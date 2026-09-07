"""Legislative processes via `?modifiedSince=` (server-side delta).

A two-day delta is ~5 KB / 0.6 s against 1.5 MB / 2.7 s for the full list.
The list item lacks `stages`, so each changed process still needs one
detail request; the detail is compared against the stage row so a
timestamp bump without content change does not trigger the heavy
`load_processes` (it rebuilds every stage row of the term).
"""
from __future__ import annotations

from urllib.parse import quote

from supagraf.db import supabase
from supagraf.schema.processes import Process
from supagraf.sync.context import SyncContext
from supagraf.sync.cursors import get_cursor, now_upstream, set_cursor, since_from_cursor
from supagraf.sync.resources._diff import upsert_changed
from supagraf.sync.stage import SyncResult, read_payloads_for

RESOURCE = "processes"
TABLE = "_stage_processes"


def _cursor_name(ctx: SyncContext) -> str:
    return f"processes.term{ctx.term}"


def _derived_since(ctx: SyncContext) -> str | None:
    """Fallback for a stage populated before cursors existed: newest
    changeDate already staged, minus the standard overlap."""
    rows = (
        supabase().table(TABLE).select("v:payload->>changeDate")
        .eq("term", ctx.term).order("payload->>changeDate", desc=True).limit(1)
        .execute().data or []
    )
    v = rows[0].get("v") if rows else None
    return since_from_cursor(v[:19]) if isinstance(v, str) and len(v) >= 19 else None


def sync(ctx: SyncContext) -> SyncResult:
    res = SyncResult(RESOURCE)
    base = ctx.base()
    started = now_upstream()
    since = None
    if not ctx.full:
        since = since_from_cursor(get_cursor(_cursor_name(ctx))) or _derived_since(ctx)
    params = {"modifiedSince": since} if since else {}
    listing = ctx.api.paginate(f"{base}/processes", params, page_size=500)
    res.listed = len(listing)
    res.notes["since"] = since or "all"
    nums = [str(p["number"]).strip() for p in listing if p.get("number") is not None]
    stored = read_payloads_for(TABLE, ctx.term, nums)

    def _detail(num: str):
        return ctx.api.get_json(f"{base}/processes/{quote(num, safe='')}")

    fetched = ctx.api.map(_detail, nums, label="processes")
    res.fetched = len(fetched)
    items = []
    for num, detail, exc in fetched:
        if exc is not None:
            res.errors.append((num, repr(exc)[:300]))
            continue
        if detail is None:
            res.notes["gone"] = res.notes.get("gone", 0) + 1
            continue
        items.append((num, detail, ctx.api.url(f"{base}/processes/{quote(num, safe='')}")))
    upsert_changed(ctx, res, table=TABLE, model=Process, items=items, stored=stored)
    if not res.errors:
        set_cursor(_cursor_name(ctx), started)
    ctx.mark(RESOURCE, res.dirty)
    return res
