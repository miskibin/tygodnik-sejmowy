"""Clubs: a dozen rows — fetch every detail, write only what changed."""
from __future__ import annotations

from supagraf.schema.clubs import Club
from supagraf.sync import stage
from supagraf.sync.context import SyncContext
from supagraf.sync.resources._common import fetch_details, upsert_changed
from supagraf.sync.stage import SyncResult

TABLE = "_stage_clubs"


def sync(ctx: SyncContext) -> SyncResult:
    res = SyncResult(resource="clubs")
    ids = [c["id"] for c in ctx.api.get_json(f"{ctx.base}/clubs") or []]
    res.listed = len(ids)
    items = fetch_details(ctx, res, ids, lambda i: f"{ctx.base}/clubs/{i}")
    upsert_changed(ctx, res, table=TABLE, model=Club, items=items,
                   stored=stage.read_payloads(TABLE, ctx.term))
    ctx.mark("clubs", res.dirty)
    return res
