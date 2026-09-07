"""ELI acts through the changes feed.

`/eli/changes/acts?since=yyyy-MM-ddTHH:mm:ss&limit=500&offset=N` returns
full act details (identical to `/eli/acts/{pub}/{year}/{pos}`) for DU and
MP, ascending by change date — no year listing, no per-act detail loop.
First run without a cursor starts from January 1st of the current year.
"""
from __future__ import annotations

from supagraf.schema.acts import ActIn
from supagraf.sync import cursors, stage
from supagraf.sync.context import SyncContext
from supagraf.sync.resources._common import upsert_changed
from supagraf.sync.stage import SyncResult

TABLE = "_stage_acts"
CURSOR = "acts.changes"
PAGE = 500


def fetch_changes(ctx: SyncContext, since: str) -> list[dict]:
    out: list[dict] = []
    while True:
        page = ctx.api.get_json("/eli/changes/acts", {"since": since, "limit": PAGE, "offset": len(out)})
        out.extend(page["items"])
        if not page["items"] or len(out) >= int(page["totalCount"]):
            return out


def sync(ctx: SyncContext) -> SyncResult:
    res = SyncResult(resource="acts")
    started = cursors.now_upstream()
    since = (None if ctx.full else cursors.since_from_cursor(cursors.get_cursor(CURSOR))) \
        or f"{ctx.today.year}-01-01T00:00:00"
    res.notes["since"] = since
    acts = fetch_changes(ctx, since)
    res.listed = len(acts)
    items = [(a["ELI"], a, ctx.api.url(f"/eli/acts/{a['ELI']}")) for a in acts if a.get("ELI")]
    stored = stage.read_payloads(TABLE, None, [i for i, _, _ in items], key_col="eli_id")
    # _stage_acts is keyed on eli_id and has no term column.
    upsert_changed(ctx, res, table=TABLE, model=ActIn, items=items, stored=stored, on_conflict="eli_id",
                   extra=lambda nid: {"eli_id": nid, "term": None, "natural_id": None})
    if not res.errors:
        cursors.set_cursor(CURSOR, started)
    ctx.mark("acts", res.dirty)
    return res
