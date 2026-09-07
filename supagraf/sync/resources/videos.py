"""Videos: `?since=&till=` date window from a cursor (full list is 7.5 MB)."""
from __future__ import annotations

from datetime import date, timedelta

from supagraf.schema.videos import Video
from supagraf.sync.context import SyncContext
from supagraf.sync.cursors import get_cursor, set_cursor
from supagraf.sync.resources._diff import upsert_changed
from supagraf.sync.stage import SyncResult, read_payloads_for

RESOURCE = "videos"
TABLE = "_stage_videos"
OVERLAP_DAYS = 3


def _cursor_name(ctx: SyncContext) -> str:
    return f"videos.term{ctx.term}"


def sync(ctx: SyncContext) -> SyncResult:
    res = SyncResult(RESOURCE)
    base = ctx.base()
    cursor = None if ctx.full else get_cursor(_cursor_name(ctx))
    params: dict = {}
    if cursor:
        since = (date.fromisoformat(cursor) - timedelta(days=OVERLAP_DAYS)).isoformat()
        till = (ctx.today + timedelta(days=ctx.horizon_days)).isoformat()
        params = {"since": since, "till": till}
    listing = ctx.api.paginate(f"{base}/videos", params, page_size=2000)
    res.listed = len(listing)
    res.notes["since"] = params.get("since") or "all"
    ids = [str(v["unid"]) for v in listing if v.get("unid")]
    stored = read_payloads_for(TABLE, ctx.term, ids)
    items = [(str(v["unid"]), v, ctx.api.url(f"{base}/videos")) for v in listing if v.get("unid")]
    upsert_changed(ctx, res, table=TABLE, model=Video, items=items, stored=stored)
    if not res.errors:
        set_cursor(_cursor_name(ctx), ctx.today.isoformat())
    ctx.mark(RESOURCE, res.dirty)
    return res
