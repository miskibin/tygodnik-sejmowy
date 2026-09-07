"""Prints: full list (no server-side filter exists) diffed on `changeDate`.

`/prints` ignores every query parameter and always returns all ~3 300 rows
(1.8 MB); each carries `changeDate`. The stage index `{number: changeDate}`
is one cheap query, so only new or advanced prints cost a detail request.
"""
from __future__ import annotations

from urllib.parse import quote

from supagraf.schema.prints import Print
from supagraf.sync import stage
from supagraf.sync.context import SyncContext
from supagraf.sync.resources._common import fetch_details, upsert_changed
from supagraf.sync.stage import SyncResult

TABLE = "_stage_prints"


def plan(listing: list[dict], stored: dict[str, str | None], full: bool) -> list[str]:
    """Numbers to refetch: unknown, or list changeDate newer than the staged one."""
    todo = []
    for p in listing:
        num = str(p["number"]).strip()
        cd = p.get("changeDate") or ""
        if full or num not in stored or (cd and cd > (stored[num] or "")):
            todo.append(num)
    return todo


def sync(ctx: SyncContext) -> SyncResult:
    res = SyncResult(resource="prints")
    listing = ctx.api.get_json(f"{ctx.base}/prints") or []
    res.listed = len(listing)
    todo = plan(listing, stage.read_index(TABLE, ctx.term, json_key="changeDate"), ctx.full)
    res.skipped = res.listed - len(todo)
    items = fetch_details(ctx, res, todo, lambda n: f"{ctx.base}/prints/{quote(n, safe='')}")
    # Everything here is new-or-advanced by construction: no stored comparison.
    upsert_changed(ctx, res, table=TABLE, model=Print, items=items, stored={})
    ctx.mark("prints", res.dirty)
    return res
