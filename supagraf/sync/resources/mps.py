"""MPs: list → detail only for MPs whose list row disagrees with the stage."""
from __future__ import annotations

from supagraf.schema.mps import MP
from supagraf.sync import stage
from supagraf.sync.context import SyncContext
from supagraf.sync.resources._common import fetch_details, list_row_matches, upsert_changed
from supagraf.sync.stage import SyncResult

TABLE = "_stage_mps"


def sync(ctx: SyncContext) -> SyncResult:
    res = SyncResult(resource="mps")
    listing = ctx.api.get_json(f"{ctx.base}/MP") or []
    res.listed = len(listing)
    stored = stage.read_payloads(TABLE, ctx.term)
    todo = [str(m["id"]) for m in listing
            if ctx.full or str(m["id"]) not in stored or not list_row_matches(m, stored[str(m["id"])])]
    res.skipped = res.listed - len(todo)
    items = fetch_details(ctx, res, todo, lambda i: f"{ctx.base}/MP/{i}")
    upsert_changed(ctx, res, table=TABLE, model=MP, items=items, stored=stored)
    ctx.mark("mps", res.dirty)
    return res
