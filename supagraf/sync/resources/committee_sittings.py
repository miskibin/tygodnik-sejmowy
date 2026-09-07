"""Committee sittings via the per-date endpoint.

`/committees/sittings/{date}` returns every committee's sittings for one
day (~60 KB) — one request per day in [today-window, today+horizon]
replaces the old 40× per-committee sweep (~1 MB each). Results are merged
by `num` into the existing per-committee bundle so the stage row keeps the
full history. `--full` falls back to the per-committee listing.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import timedelta

from supagraf.etl import watermark
from supagraf.schema.committee_sittings import CommitteeSittingsBundle
from supagraf.sync import stage
from supagraf.sync.context import SyncContext
from supagraf.sync.resources._common import upsert_changed
from supagraf.sync.resources.committees import committee_codes
from supagraf.sync.stage import SyncResult

TABLE = "_stage_committee_sittings"


def merge(existing: dict | None, code: str, fresh: list[dict]) -> dict:
    by_num = {int(s["num"]): s for s in (existing or {}).get("sittings", []) if s.get("num") is not None}
    by_num |= {int(s["num"]): s for s in fresh if s.get("num") is not None}
    return {"code": code, "sittings": [by_num[k] for k in sorted(by_num)]}


def sync(ctx: SyncContext) -> SyncResult:
    res = SyncResult(resource="committee_sittings")
    stored = stage.read_payloads(TABLE, ctx.term)
    fresh: dict[str, list[dict]] = defaultdict(list)
    if ctx.full:
        keys = committee_codes(ctx)
        path = lambda c: f"{ctx.base}/committees/{c}/sittings"  # noqa: E731
    else:
        keys = [(ctx.today + timedelta(days=d)).isoformat()
                for d in range(-ctx.window_days, ctx.horizon_days + 1)]
        path = lambda d: f"{ctx.base}/committees/sittings/{d}"  # noqa: E731
    fetched = ctx.api.map(lambda k: ctx.api.get_json(path(k)), keys, label=res.resource)
    res.fetched = len(fetched)
    for key, payload, exc in fetched:
        if exc is not None:
            res.error(key, exc)
            continue
        for s in payload or []:
            fresh[key if ctx.full else s["code"]].append(s)
    res.listed = sum(len(v) for v in fresh.values())
    bundles = {code: {"code": code, "sittings": sittings} if ctx.full else merge(stored.get(code), code, sittings)
               for code, sittings in fresh.items()}
    items = [(code, b, ctx.api.url(f"{ctx.base}/committees/{code}/sittings")) for code, b in bundles.items()]
    upsert_changed(ctx, res, table=TABLE, model=CommitteeSittingsBundle, items=items, stored=stored)
    finished = [f"term{ctx.term}__{code}__{s['num']}" for code, ss in fresh.items()
                for s in ss if s.get("status") == "FINISHED" and s.get("num") is not None]
    if finished:
        watermark.bulk_seal("committee_sitting", finished, source="predicate_status_finished")
    ctx.mark("committee_sittings", res.dirty)
    return res
