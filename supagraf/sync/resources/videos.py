"""Videos: `?since=&till=` date window from a cursor (full list is 7.5 MB)."""
from __future__ import annotations

from datetime import date, timedelta

from supagraf.schema.videos import Video
from supagraf.sync import cursors, stage
from supagraf.sync.context import SyncContext
from supagraf.sync.resources._common import upsert_changed
from supagraf.sync.stage import SyncResult

TABLE = "_stage_videos"
OVERLAP_DAYS = 3


def sync(ctx: SyncContext) -> SyncResult:
    res = SyncResult(resource="videos")
    name = f"videos.term{ctx.term}"
    cursor = None if ctx.full else cursors.get_cursor(name)
    params = {}
    if cursor:
        params = {"since": (date.fromisoformat(cursor) - timedelta(days=OVERLAP_DAYS)).isoformat(),
                  "till": (ctx.today + timedelta(days=ctx.horizon_days)).isoformat()}
    res.notes["since"] = params.get("since", "all")
    url = ctx.api.url(f"{ctx.base}/videos")
    listing = ctx.api.paginate(f"{ctx.base}/videos", params, page_size=2000)
    res.listed = len(listing)
    items = [(v["unid"], v, url) for v in listing if v.get("unid")]
    upsert_changed(ctx, res, table=TABLE, model=Video, items=items,
                   stored=stage.read_payloads(TABLE, ctx.term, [i for i, _, _ in items]))
    if not res.errors:
        cursors.set_cursor(name, ctx.today.isoformat())
    ctx.mark("videos", res.dirty)
    return res
