"""Dirty-resource → SQL loader plan.

Every `load_*` function rebuilds its target from the whole `_stage_*`
table for the term (none is incremental — see docs/updater.md), so the only
lever is *not calling* the ones whose inputs did not change. The chain
below is the canonical FK-safe order; a loader runs when any resource in
its trigger set is dirty (or on `--full`).

Dependencies encoded here (all hard FKs, see supabase/migrations):
  mps ← clubs · proceedings ← mps · votings ← proceedings · votes ← mps,votings
  committee_sittings ← committees · print children/edges ← prints
  processes ← mps,committees,prints · bills ← prints · questions ← mps
  videos ← committees · district_postcodes ← districts · act_relations ← acts
Proceedings run *after* prints/processes so agenda refs resolve in the
same run instead of queueing in `unresolved_agenda_*_refs` until tomorrow.
"""
from __future__ import annotations

from dataclasses import dataclass

from loguru import logger

from supagraf.db import call_rpc_scalar
from supagraf.load import _rpc_int


@dataclass(frozen=True)
class Loader:
    fn: str
    triggers: frozenset[str]
    takes_term: bool = True


def _l(fn: str, *triggers: str, takes_term: bool = True) -> Loader:
    return Loader(fn, frozenset(triggers), takes_term)


LOAD_CHAIN: tuple[Loader, ...] = (
    _l("load_clubs", "clubs"),
    _l("load_inferred_clubs", "mps", "votings"),
    _l("load_mps", "mps"),
    _l("load_mp_club_membership", "mps", "clubs"),
    _l("load_mp_office_expenses", "mp_office_expenses"),
    _l("load_committees", "committees"),
    _l("load_committee_sittings", "committee_sittings", "committees"),
    _l("load_prints", "prints"),
    _l("load_prints_additional", "prints"),
    _l("load_print_relationships", "prints"),
    _l("load_print_attachments", "prints"),
    _l("load_processes", "processes", "prints", "committees"),
    _l("load_proceedings", "proceedings"),
    _l("load_votings", "votings", "proceedings"),
    _l("load_votes", "votings", "mps"),
    _l("load_bills", "bills", "prints"),
    _l("load_questions", "questions"),
    _l("load_videos", "videos", "committees"),
    _l("load_districts", "districts"),
    _l("load_district_postcodes", "postcodes", "districts"),
    _l("load_promises", "promises"),
    _l("load_acts", "acts"),
    _l("load_act_relations", "acts"),
)

# Matview refreshes: heavy, so gated the same way.
REFRESH_CHAIN: tuple[Loader, ...] = (
    _l("refresh_mp_discipline", "votings", takes_term=False),
    _l("refresh_mp_rebellion_count", "votings", takes_term=False),
    _l("refresh_voting_promise_link", "votings", "promises", takes_term=False),
    _l("refresh_mp_activity", "votings", "proceedings", takes_term=False),
    _l("refresh_minister_reply_stats", "questions", takes_term=False),
    _l("refresh_polls_mv", "polls", takes_term=False),
    _l("refresh_atlas_matviews", "votings", takes_term=True),
)


def plan(chain: tuple[Loader, ...], dirty: set[str], *, full: bool) -> list[Loader]:
    if full:
        return list(chain)
    return [l for l in chain if l.triggers & dirty]


def run_loaders(term: int, dirty: set[str], *, full: bool = False) -> dict[str, int]:
    """Run the selected `load_*` functions in chain order. Raises on the
    first failure — a broken parent load must not be followed by children."""
    out: dict[str, int] = {}
    for l in plan(LOAD_CHAIN, dirty, full=full):
        n = _rpc_int(l.fn, term)
        logger.info("load {}: affected={}", l.fn, n)
        out[l.fn] = n
    return out


def run_refreshes(term: int, dirty: set[str], *, full: bool = False) -> dict[str, str]:
    """Refresh the matviews whose inputs changed. Failures are collected,
    not raised — one slow matview must not block the others."""
    out: dict[str, str] = {}
    for l in plan(REFRESH_CHAIN, dirty, full=full):
        try:
            r = call_rpc_scalar(l.fn, {"p_term": term} if l.takes_term else None)
            out[l.fn] = "ok" if r is None else str(r)[:80]
            logger.info("refresh {}: {}", l.fn, out[l.fn])
        except Exception as e:  # noqa: BLE001
            out[l.fn] = f"failed: {e!r}"[:200]
            logger.error("refresh {} failed: {!r}", l.fn, e)
    return out
