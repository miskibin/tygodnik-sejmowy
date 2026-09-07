"""Committee sittings via the per-date endpoint.

`/committees/sittings/{date}` returns every committee's sittings for one
day (~60 KB) — one request per day in [today-window, today+horizon]
replaces the old 40× per-committee sweep (~1 MB each). Results are merged
by `num` into the existing per-committee bundle so the stage row keeps the
full history the loader upserts from. `--full` falls back to the
per-committee listing.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import timedelta

from loguru import logger

from supagraf.etl.watermark import bulk_seal
from supagraf.schema.committee_sittings import CommitteeSittingsBundle
from supagraf.sync.context import SyncContext
from supagraf.sync.resources._diff import upsert_changed
from supagraf.sync.resources.committees import committee_codes
from supagraf.sync.stage import SyncResult, read_payloads

RESOURCE = "committee_sittings"
TABLE = "_stage_committee_sittings"


def _merge(existing: dict | None, code: str, fresh: list[dict]) -> dict:
    by_num: dict[int, dict] = {}
    for s in (existing or {}).get("sittings") or []:
        if isinstance(s, dict) and s.get("num") is not None:
            by_num[int(s["num"])] = s
    for s in fresh:
        if isinstance(s, dict) and s.get("num") is not None:
            by_num[int(s["num"])] = s
    return {"code": code, "sittings": [by_num[k] for k in sorted(by_num)]}


def _seal_finished(ctx: SyncContext, code: str, sittings: list[dict]) -> None:
    keys = [
        f"term{ctx.term}__{code}__{s.get('num')}"
        for s in sittings
        if isinstance(s, dict) and s.get("status") == "FINISHED" and s.get("num") is not None
    ]
    if keys:
        try:
            bulk_seal("committee_sitting", keys, source="predicate_status_finished")
        except Exception as e:  # noqa: BLE001 — watermark is an optimisation
            logger.warning("bulk_seal committee_sitting {} failed: {!r}", code, e)


def sync(ctx: SyncContext) -> SyncResult:
    res = SyncResult(RESOURCE)
    base = ctx.base()
    stored = read_payloads(TABLE, ctx.term)
    fresh_by_code: dict[str, list[dict]] = defaultdict(list)

    if ctx.full:
        codes = committee_codes(ctx)
        fetched = ctx.api.map(lambda c: ctx.api.get_json(f"{base}/committees/{c}/sittings"), codes, label="csit")
        res.fetched = len(fetched)
        for code, payload, exc in fetched:
            if exc is not None:
                res.errors.append((code, repr(exc)[:300]))
                continue
            fresh_by_code[code] = list(payload or [])
        merged = {code: {"code": code, "sittings": sittings} for code, sittings in fresh_by_code.items()}
    else:
        days = [
            (ctx.today + timedelta(days=d)).isoformat()
            for d in range(-ctx.window_days, ctx.horizon_days + 1)
        ]
        fetched = ctx.api.map(lambda d: ctx.api.get_json(f"{base}/committees/sittings/{d}"), days, label="csit")
        res.fetched = len(fetched)
        for day, payload, exc in fetched:
            if exc is not None:
                res.errors.append((day, repr(exc)[:300]))
                continue
            for s in payload or []:
                code = (s or {}).get("code")
                if code:
                    fresh_by_code[code].append(s)
        merged = {code: _merge(stored.get(code), code, sittings) for code, sittings in fresh_by_code.items()}

    res.listed = sum(len(v) for v in fresh_by_code.values())
    items = [
        (code, bundle, ctx.api.url(f"{base}/committees/{code}/sittings"))
        for code, bundle in merged.items()
    ]
    upsert_changed(ctx, res, table=TABLE, model=CommitteeSittingsBundle, items=items, stored=stored)
    for code, sittings in fresh_by_code.items():
        _seal_finished(ctx, code, sittings)
    ctx.mark(RESOURCE, res.dirty)
    return res
