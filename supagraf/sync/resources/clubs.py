"""Clubs: a dozen rows — fetch every detail, write only what changed."""
from __future__ import annotations

from supagraf.schema.clubs import Club
from supagraf.sync.context import SyncContext
from supagraf.sync.resources._diff import upsert_changed
from supagraf.sync.stage import SyncResult, read_payloads

RESOURCE = "clubs"
TABLE = "_stage_clubs"


def sync(ctx: SyncContext) -> SyncResult:
    res = SyncResult(RESOURCE)
    base = ctx.base()
    listing = ctx.api.get_json(f"{base}/clubs")
    if not isinstance(listing, list):
        raise RuntimeError("clubs list is not a list")
    res.listed = len(listing)
    stored = read_payloads(TABLE, ctx.term)
    ids = [c["id"] for c in listing if c.get("id")]
    fetched = ctx.api.map(lambda cid: ctx.api.get_json(f"{base}/clubs/{cid}"), ids, label="clubs")
    res.fetched = len(fetched)
    items = []
    for cid, detail, exc in fetched:
        if exc is not None:
            res.errors.append((str(cid), repr(exc)[:300]))
            continue
        items.append((str(cid), detail, ctx.api.url(f"{base}/clubs/{cid}")))
    upsert_changed(ctx, res, table=TABLE, model=Club, items=items, stored=stored)
    ctx.mark(RESOURCE, res.dirty)
    return res
