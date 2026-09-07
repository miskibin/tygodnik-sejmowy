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
Trigger sets list *inputs* only; pure FK prerequisites (votings → proceedings,
votes → mps, sittings → committees) are guaranteed by the chain order and do
not force a reload.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from loguru import logger

from postgrest.exceptions import APIError

from supagraf.db import call_rpc_scalar
from supagraf.load import _PgOperationalError, _rpc_int


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
    _l("load_committee_sittings", "committee_sittings"),
    _l("load_prints", "prints"),
    _l("load_prints_additional", "prints"),
    _l("load_print_relationships", "prints"),
    _l("load_print_attachments", "prints"),
    _l("load_processes", "processes", "prints", "committees"),
    _l("load_proceedings", "proceedings"),
    _l("load_votings", "votings"),
    _l("load_votes", "votings"),
    _l("load_bills", "bills", "prints"),
    _l("load_questions", "questions"),
    _l("load_videos", "videos"),
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


# Whole-term loaders that have a per-sitting variant (migration 0108). When
# the sync reports which sittings it wrote, only those are loaded — the
# whole-term versions rebuild 75 sittings / 2M vote rows and do not fit in
# Cloudflare's 100 s gateway window through PostgREST.
TARGETED: dict[str, tuple[str, str]] = {
    "load_proceedings": ("proceedings", "load_proceeding"),
    "load_votings": ("votings", "load_votings_sitting"),
    "load_votes": ("votings", "load_votes_sitting"),
}
_TARGET_ARG = {"load_proceeding": "p_number", "load_votings_sitting": "p_sitting", "load_votes_sitting": "p_sitting"}


def _call_targeted(fn: str, term: int, keys: set[int]) -> int:
    total = 0
    for k in sorted(keys):
        n = int(call_rpc_scalar(fn, {"p_term": term, _TARGET_ARG[fn]: k}) or 0)
        logger.info("load {}({}): affected={}", fn, k, n)
        total += n
    return total


def run_loaders(term: int, dirty: set[str], *, full: bool = False,
                changed_keys: dict[str, set[int]] | None = None) -> dict[str, int]:
    """Run the selected `load_*` functions in chain order. Raises on the
    first failure — a broken parent load must not be followed by children.

    `changed_keys` (resource → sitting numbers written) switches the heavy
    proceedings/votings loaders to their per-sitting variants. A dirty
    resource without keys (e.g. `--skip-fetch`) runs the whole-term loader.
    """
    out: dict[str, int] = {}
    changed_keys = changed_keys or {}
    for l in plan(LOAD_CHAIN, dirty, full=full):
        target = TARGETED.get(l.fn)
        keys = changed_keys.get(target[0]) if target else None
        # The other triggers of these loaders (mps, proceedings) are FK
        # prerequisites, not inputs — they never require a whole-term reload.
        if target and keys and not full:
            out[l.fn] = _call_targeted(target[1], term, keys)
            continue
        n = _rpc_int(l.fn, term)
        logger.info("load {}: affected={}", l.fn, n)
        out[l.fn] = n
    return out


def run_refreshes(term: int, dirty: set[str], *, full: bool = False) -> dict[str, Any]:
    """Refresh the matviews whose inputs changed. Failures are collected,
    not raised — one slow matview must not block the others."""
    out: dict[str, Any] = {}
    failed = 0
    for l in plan(REFRESH_CHAIN, dirty, full=full):
        try:
            r = call_rpc_scalar(l.fn, {"p_term": term} if l.takes_term else None)
        except (APIError, _PgOperationalError) as e:
            out[l.fn] = f"failed: {e}"[:200]
            failed += 1
            logger.error("refresh {} failed: {}", l.fn, e)
            continue
        out[l.fn] = "ok" if r is None else str(r)[:80]
        logger.info("refresh {}: {}", l.fn, out[l.fn])
    if failed:
        out["failed"] = failed
    return out
