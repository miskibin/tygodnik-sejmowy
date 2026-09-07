"""ELI acts through the changes feed.

`/eli/changes/acts?since=yyyy-MM-ddTHH:mm:ss&limit=500&offset=N` returns
full act details (byte-identical to `/eli/acts/{pub}/{year}/{pos}`) for
both DU and MP, ascending by change date. That replaces the year listing +
per-act detail loop entirely. First run without a cursor starts from
January 1st of the current year (~7k items, 14 pages).
"""
from __future__ import annotations

from datetime import date

from loguru import logger

from supagraf.schema.acts import ActIn
from supagraf.sync.context import SyncContext
from supagraf.sync.cursors import get_cursor, now_upstream, set_cursor, since_from_cursor
from supagraf.sync.stage import SyncResult, read_payloads_for, stage_row, upsert_rows, validate, same_payload

RESOURCE = "acts"
TABLE = "_stage_acts"
CURSOR = "acts.changes"
PAGE = 500
CHANGES_URL = "/eli/changes/acts"


def _initial_since(ctx: SyncContext) -> str:
    return f"{date(ctx.today.year, 1, 1).isoformat()}T00:00:00"


def fetch_changes(ctx: SyncContext, since: str) -> list[dict]:
    out: list[dict] = []
    offset = 0
    while True:
        page = ctx.api.get_json(CHANGES_URL, {"since": since, "limit": PAGE, "offset": offset})
        if not isinstance(page, dict):
            raise RuntimeError(f"unexpected changes feed shape: {type(page).__name__}")
        items = page.get("items") or []
        out.extend(items)
        total = int(page.get("totalCount") or 0)
        offset += len(items)
        if not items or offset >= total:
            break
    return out


def sync(ctx: SyncContext) -> SyncResult:
    res = SyncResult(RESOURCE)
    started = now_upstream()
    since = None if ctx.full else since_from_cursor(get_cursor(CURSOR))
    since = since or _initial_since(ctx)
    res.notes["since"] = since
    items = fetch_changes(ctx, since)
    res.listed = len(items)
    ids = [a["ELI"] for a in items if a.get("ELI")]
    stored = read_payloads_for(TABLE, None, ids, key_col="eli_id")
    rows: list[dict] = []
    for a in items:
        eli = a.get("ELI")
        if not eli:
            continue
        if not ctx.full and eli in stored and same_payload(stored[eli], a):
            res.skipped += 1
            continue
        err = validate(ActIn, a)
        if err:
            res.errors.append((eli, err))
            logger.warning("acts {}: {}", eli, err)
            continue
        row = stage_row(term=ctx.term, natural_id=eli, payload=a,
                        source_url=ctx.api.url(f"/eli/acts/{eli}"), captured_at=ctx.captured_at)
        row.pop("term"); row["eli_id"] = row.pop("natural_id")
        rows.append(row)
    res.changed = len(rows)
    res.upserted = upsert_rows(TABLE, rows, on_conflict="eli_id", errors=res.errors)
    if not res.errors:
        set_cursor(CURSOR, started)
    ctx.mark(RESOURCE, res.dirty)
    return res
