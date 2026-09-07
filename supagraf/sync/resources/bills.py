"""Bills (RPW): no delta filter upstream — full list (~850 KB) diffed locally."""
from __future__ import annotations

from supagraf.schema.bills import Bill
from supagraf.sync import stage
from supagraf.sync.context import SyncContext
from supagraf.sync.resources._common import upsert_changed
from supagraf.sync.stage import SyncResult

TABLE = "_stage_bills"


def sync(ctx: SyncContext) -> SyncResult:
    res = SyncResult(resource="bills")
    url = ctx.api.url(f"{ctx.base}/bills")
    listing = ctx.api.paginate(f"{ctx.base}/bills", page_size=2000)
    res.listed = len(listing)
    items = [(str(b.get("number") or b["id"]), b, url) for b in listing]
    upsert_changed(ctx, res, table=TABLE, model=Bill, items=items,
                   stored=stage.read_payloads(TABLE, ctx.term))
    ctx.mark("bills", res.dirty)
    return res
