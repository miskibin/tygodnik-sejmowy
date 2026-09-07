"""Bills (RPW): no delta filter upstream — full list (~850 KB) diffed locally."""
from __future__ import annotations

from supagraf.schema.bills import Bill
from supagraf.sync.context import SyncContext
from supagraf.sync.resources._diff import upsert_changed
from supagraf.sync.stage import SyncResult, read_payloads

RESOURCE = "bills"
TABLE = "_stage_bills"


def sync(ctx: SyncContext) -> SyncResult:
    res = SyncResult(RESOURCE)
    base = ctx.base()
    listing = ctx.api.paginate(f"{base}/bills", page_size=2000)
    res.listed = len(listing)
    stored = read_payloads(TABLE, ctx.term)
    items = []
    for b in listing:
        nid = b.get("number") or b.get("id")
        if not nid:
            continue
        items.append((str(nid), b, ctx.api.url(f"{base}/bills")))
    upsert_changed(ctx, res, table=TABLE, model=Bill, items=items, stored=stored)
    ctx.mark(RESOURCE, res.dirty)
    return res
