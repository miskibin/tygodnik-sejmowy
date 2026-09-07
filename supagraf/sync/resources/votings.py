"""Votings: the 8 KB `/votings` index as the change signal.

The index lists `{date, proceeding, votingsNum}`; per-MP votes only exist
on `/votings/{sitting}/{num}`. A sitting is touched when the index reports
more votings than the stage holds, or when it still has unsealed votings
(detail captured before the vote rows were published). Sealed votings
(`etl_watermarks` entity `voting`) are never refetched.
"""
from __future__ import annotations

from collections import defaultdict

from loguru import logger

from supagraf.etl.watermark import bulk_seal, load_sealed
from supagraf.schema.votings import Voting
from supagraf.sync.context import SyncContext
from supagraf.sync.resources._diff import upsert_changed
from supagraf.sync.stage import SyncResult, read_index, read_payloads_for, same_payload

RESOURCE = "votings"
TABLE = "_stage_votings"


def plan_sittings(index: list[dict], stored_ids: set[str], sealed: set[str], term: int, full: bool) -> list[int]:
    expected: dict[int, int] = defaultdict(int)
    for g in index:
        if g.get("proceeding") is None:
            continue
        expected[int(g["proceeding"])] += int(g.get("votingsNum") or 0)
    have: dict[int, set[int]] = defaultdict(set)
    for nid in stored_ids:
        sitting, _, num = nid.partition("__")
        if sitting.isdigit() and num.isdigit():
            have[int(sitting)].add(int(num))
    todo: list[int] = []
    for sitting, n in sorted(expected.items()):
        if full:
            todo.append(sitting)
            continue
        if len(have[sitting]) < n:
            todo.append(sitting)
            continue
        unsealed = [v for v in have[sitting] if f"term{term}__{sitting}__{v}" not in sealed]
        if unsealed:
            todo.append(sitting)
    return todo


def sync(ctx: SyncContext) -> SyncResult:
    res = SyncResult(RESOURCE)
    base = ctx.base()
    index = ctx.api.get_json(f"{base}/votings")
    if not isinstance(index, list):
        raise RuntimeError("votings index is not a list")
    res.listed = sum(int(g.get("votingsNum") or 0) for g in index)
    stored_ids = set(read_index(TABLE, ctx.term))
    sealed = load_sealed("voting")
    sittings = plan_sittings(index, stored_ids, sealed, ctx.term, ctx.full)
    res.notes["sittings_touched"] = sittings

    targets: list[tuple[int, int]] = []
    for sitting in sittings:
        lst = ctx.api.get_json(f"{base}/votings/{sitting}")
        if not isinstance(lst, list):
            res.errors.append((str(sitting), "per-sitting list missing"))
            continue
        for v in lst:
            num = v.get("votingNumber")
            if num is None:
                continue
            nid = f"{sitting}__{num}"
            if not ctx.full and nid in stored_ids and f"term{ctx.term}__{sitting}__{num}" in sealed:
                res.skipped += 1
                continue
            targets.append((sitting, int(num)))

    fetched = ctx.api.map(lambda t: ctx.api.get_json(f"{base}/votings/{t[0]}/{t[1]}"), targets, label="votings")
    res.fetched = len(fetched)
    items = []
    to_seal: list[str] = []
    for (sitting, num), detail, exc in fetched:
        nid = f"{sitting}__{num}"
        if exc is not None:
            res.errors.append((nid, repr(exc)[:300]))
            continue
        if not isinstance(detail, dict):
            res.errors.append((nid, "detail missing"))
            continue
        items.append((nid, detail, ctx.api.url(f"{base}/votings/{sitting}/{num}")))
        if detail.get("votes"):
            to_seal.append(f"term{ctx.term}__{sitting}__{num}")
    # Refetched unsealed votings may be byte-identical (votes still not
    # published) — the stored comparison keeps those out of the write set.
    stored = read_payloads_for(TABLE, ctx.term, [nid for nid, _, _ in items]) if items else {}
    n = upsert_changed(ctx, res, table=TABLE, model=Voting, items=items, stored=stored)
    # Sittings whose votings were written — the loader plan loads only those.
    written = {int(nid.split("__")[0]) for nid, payload, _ in items
               if not (nid in stored and same_payload(stored[nid], payload))} if n else set()
    res.notes["written_sittings"] = sorted(written)
    if to_seal and not res.errors:
        try:
            bulk_seal("voting", to_seal, source="predicate_votes_captured")
        except Exception as e:  # noqa: BLE001 — watermark is an optimisation
            logger.warning("bulk_seal voting failed: {!r}", e)
    ctx.mark(RESOURCE, res.dirty, written)
    return res
