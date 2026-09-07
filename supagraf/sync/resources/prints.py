"""Prints: full list (no server-side filter exists) diffed on `changeDate`.

`/prints` ignores every query parameter and always returns all ~3 300 rows
(1.8 MB, ~3 s). Each row carries `changeDate`; the stage index
`{number: payload->>changeDate}` is one cheap query, so only new or
advanced prints cost a detail request (400 B each).
"""
from __future__ import annotations

from urllib.parse import quote

from supagraf.schema.prints import Print
from supagraf.sync.context import SyncContext
from supagraf.sync.resources._diff import upsert_changed
from supagraf.sync.stage import SyncResult, read_index

RESOURCE = "prints"
TABLE = "_stage_prints"


def _changed(item: dict, stored_cd: str | None) -> bool:
    cd = item.get("changeDate")
    if stored_cd is None:
        return True
    if not isinstance(cd, str) or not cd:
        return False
    return cd > stored_cd


def plan(listing: list[dict], stored: dict[str, str | None], full: bool) -> list[dict]:
    todo: list[dict] = []
    for p in listing:
        num = p.get("number")
        if num is None:
            continue
        num = str(num).strip()
        if full or num not in stored or _changed(p, stored[num]):
            todo.append(p)
    return todo


def sync(ctx: SyncContext) -> SyncResult:
    res = SyncResult(RESOURCE)
    base = ctx.base()
    listing = ctx.api.get_json(f"{base}/prints")
    if not isinstance(listing, list):
        raise RuntimeError("prints list is not a list")
    res.listed = len(listing)
    stored = read_index(TABLE, ctx.term, json_key="changeDate")
    todo = plan(listing, stored, ctx.full)
    res.skipped = res.listed - len(todo)

    def _detail(p: dict):
        num = str(p["number"]).strip()
        return ctx.api.get_json(f"{base}/prints/{quote(num, safe='')}")

    fetched = ctx.api.map(_detail, todo, label="prints")
    res.fetched = len(fetched)
    items = []
    for p, detail, exc in fetched:
        num = str(p["number"]).strip()
        if exc is not None:
            res.errors.append((num, repr(exc)[:300]))
            continue
        if detail is None:
            res.notes["gone"] = res.notes.get("gone", 0) + 1
            continue
        items.append((num, detail, ctx.api.url(f"{base}/prints/{quote(num, safe='')}")))
    # Everything in `items` is new-or-advanced by construction; pass an empty
    # `stored` so the payload comparison never suppresses a write.
    upsert_changed(ctx, res, table=TABLE, model=Print, items=items, stored={})
    ctx.mark(RESOURCE, res.dirty)
    return res
