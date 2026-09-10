"""Votings: the 8 KB `/votings` index as the change signal.

The index lists `{date, proceeding, votingsNum}`; per-MP votes only exist
on `/votings/{sitting}/{num}`. A sitting is touched when the index reports
more votings than the stage holds, or when it still has unsealed votings
(detail captured before the vote rows were published). Sealed votings
(`etl_watermarks` entity `voting`) are refetched if their staged rows fail
the completeness check introduced after legacy seals were written.
"""
from __future__ import annotations

from collections import defaultdict

from supagraf.etl import watermark
from supagraf.db import supabase
from supagraf.schema.votings import Voting
from supagraf.sync import stage
from supagraf.sync.context import SyncContext
from supagraf.sync.resources._common import fetch_details, upsert_changed
from supagraf.sync.stage import SyncResult

TABLE = "_stage_votings"


def seal_key(term: int, sitting: int, num: int) -> str:
    return f"term{term}__{sitting}__{num}"


def has_complete_vote_rows(payload: dict) -> bool:
    """Whether the detail contains the complete per-MP ballot snapshot.

    The API can briefly publish a non-empty, partial ``votes`` array.  A row is
    immutable only after both participation totals agree with the array.
    ``VOTE_VALID`` (list ballots) counts as participating, hence the generic
    non-ABSENT check rather than summing YES/NO/ABSTAIN/PRESENT.
    """
    votes = payload.get("votes")
    total_voted = payload.get("totalVoted")
    not_participating = payload.get("notParticipating")
    if not isinstance(votes, list) or not isinstance(total_voted, int) or not isinstance(not_participating, int):
        return False
    if len(votes) != total_voted + not_participating:
        return False
    absent = sum(1 for row in votes if isinstance(row, dict) and row.get("vote") == "ABSENT")
    participating = sum(1 for row in votes if isinstance(row, dict) and row.get("vote") != "ABSENT")
    return absent == not_participating and participating == total_voted


def _incomplete_staged_ids(term: int) -> set[str]:
    rows = supabase().rpc("incomplete_staged_votings", {"p_term": term}).execute().data or []
    return {str(row["natural_id"]) for row in rows}


def plan_sittings(index: list[dict], stored: set[str], sealed: set[str], term: int, full: bool) -> list[int]:
    expected: dict[int, int] = defaultdict(int)
    for g in index:
        expected[int(g["proceeding"])] += int(g.get("votingsNum") or 0)
    have: dict[int, set[int]] = defaultdict(set)
    for nid in stored:
        sitting, _, num = nid.partition("__")
        have[int(sitting)].add(int(num))
    return [s for s, n in sorted(expected.items())
            if full or len(have[s]) < n or any(seal_key(term, s, v) not in sealed for v in have[s])]


def sync(ctx: SyncContext) -> SyncResult:
    res = SyncResult(resource="votings")
    index = ctx.api.get_json(f"{ctx.base}/votings") or []
    res.listed = sum(int(g.get("votingsNum") or 0) for g in index)
    stored_ids = set(stage.read_index(TABLE, ctx.term))
    # Old updater versions sealed any non-empty vote list.  Ignore such a seal
    # when the staged payload fails the stronger completeness invariant; the
    # refetch repairs the stage and the existing watermark becomes valid.
    incomplete = _incomplete_staged_ids(ctx.term)
    sealed = watermark.load_sealed("voting") - {
        seal_key(ctx.term, *map(int, nid.split("__"))) for nid in incomplete
    }
    sittings = plan_sittings(index, stored_ids, sealed, ctx.term, ctx.full)
    res.notes["sittings_touched"] = sittings

    targets: list[str] = []
    for sitting in sittings:
        for v in ctx.api.get_json(f"{ctx.base}/votings/{sitting}") or []:
            nid = f"{sitting}__{v['votingNumber']}"
            if not ctx.full and nid in stored_ids and seal_key(ctx.term, sitting, v["votingNumber"]) in sealed:
                res.skipped += 1
            else:
                targets.append(nid)

    items = fetch_details(ctx, res, targets, lambda nid: f"{ctx.base}/votings/{nid.replace('__', '/')}")
    written = upsert_changed(ctx, res, table=TABLE, model=Voting, items=items,
                             stored=stage.read_payloads(TABLE, ctx.term, targets))
    sittings_written = {int(nid.split("__")[0]) for nid in written}
    res.notes["written_sittings"] = sorted(sittings_written)
    to_seal = [seal_key(ctx.term, *map(int, nid.split("__")))
               for nid, d, _ in items if has_complete_vote_rows(d)]
    if to_seal and not res.errors:
        watermark.bulk_seal("voting", to_seal, source="predicate_votes_captured")
    ctx.mark("votings", res.dirty, sittings_written)
    return res
