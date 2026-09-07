"""Legislative processes via `?modifiedSince=` (server-side delta).

The list item lacks `stages`, so each changed process needs one detail
request; the detail is compared to the stage row so a timestamp-only bump
does not trigger `load_processes` (it rebuilds every stage row of the term).
"""
from __future__ import annotations

from urllib.parse import quote

from supagraf.db import supabase
from supagraf.schema.processes import Process
from supagraf.sync import cursors, stage
from supagraf.sync.context import SyncContext
from supagraf.sync.resources._common import fetch_details, upsert_changed
from supagraf.sync.stage import SyncResult

TABLE = "_stage_processes"


def _derived_since(term: int) -> str | None:
    """Stage populated before cursors existed: newest staged changeDate."""
    rows = (supabase().table(TABLE).select("v:payload->>changeDate").eq("term", term)
            .order("payload->>changeDate", desc=True).limit(1).execute().data or [])
    v = rows[0]["v"] if rows else None
    return cursors.since_from_cursor(v[:19]) if v else None


def sync(ctx: SyncContext) -> SyncResult:
    res = SyncResult(resource="processes")
    name = f"processes.term{ctx.term}"
    started = cursors.now_upstream()
    since = None if ctx.full else (cursors.since_from_cursor(cursors.get_cursor(name)) or _derived_since(ctx.term))
    res.notes["since"] = since or "all"
    listing = ctx.api.paginate(f"{ctx.base}/processes", {"modifiedSince": since} if since else {})
    res.listed = len(listing)
    nums = [str(p["number"]).strip() for p in listing]
    items = fetch_details(ctx, res, nums, lambda n: f"{ctx.base}/processes/{quote(n, safe='')}")
    upsert_changed(ctx, res, table=TABLE, model=Process, items=items,
                   stored=stage.read_payloads(TABLE, ctx.term, nums))
    if not res.errors:
        cursors.set_cursor(name, started)
    ctx.mark("processes", res.dirty)
    return res
