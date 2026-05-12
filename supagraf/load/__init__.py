"""Load layer: invokes pure-SQL functions defined in supabase/migrations/."""
from __future__ import annotations

from dataclasses import dataclass

from loguru import logger
from postgrest.exceptions import APIError
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from supagraf.db import supabase


_TRANSIENT_TIMEOUT_CODE = "57014"


def _is_timeout(exc: Exception) -> bool:
    return isinstance(exc, APIError) and getattr(exc, "code", None) == _TRANSIENT_TIMEOUT_CODE \
        or (isinstance(exc, APIError) and "statement timeout" in str(exc).lower())


@dataclass
class LoadStep:
    step: str
    affected: int


@dataclass
class LoadReport:
    steps: list[LoadStep]

    def total(self) -> int:
        return sum(s.affected for s in self.steps)


_PRE_STEPS = (
    "load_clubs",
    "load_inferred_clubs",
    "load_mps",
    "load_mp_club_membership",
    # proceedings: depends on mps (composite FK on (term, mp_id)). Must run
    # BEFORE votings — votings.term, votings.sitting FKs into proceedings(term, number).
    "load_proceedings",
    "load_votings",
    # committees after mps (member.mp_id FKs into mps), before prints (independent).
    "load_committees",
    # committee_sittings: needs committees rows (FK committee_id) — must run
    # immediately after load_committees. Independent of prints/processes.
    "load_committee_sittings",
    # prints: parents first, then additionalPrints children, then edges, then attachments.
    # Order matters: print_relationships FKs into prints; attachments need both parent
    # and child print rows present (child attachments point at child print_id).
    "load_prints",
    "load_prints_additional",
    "load_print_relationships",
    "load_print_attachments",
    # processes: depends on mps (rapporteur composite FK), committees (stub-extends),
    # and prints (resolved or queued unresolved). Last in the chain.
    "load_processes",
    # bills: independent resource; needs prints already loaded for FK resolution.
    "load_bills",
    # questions: depends on mps (author composite FK). Independent of prints/
    # committees/processes — placed last in the chain.
    "load_questions",
    # videos: depends on committees (FK + stub-extend on miss).
    "load_videos",
    # districts + postcodes: external (PKW + GUS TERYT). Districts must load
    # before district_postcodes (FK on (term, district_num) -> districts).
    "load_districts",
    "load_district_postcodes",
    # promises: external (manifestos). Independent of all other resources.
    # promise_print_candidates is filled by the matcher enrich job, not by
    # a load_* SQL function.
    "load_promises",
    # ELI acts: independent. load_acts must run before load_act_relations
    # so the relations FK can resolve target_act_id where possible.
    "load_acts",
    "load_act_relations",
)


@retry(
    retry=retry_if_exception_type(APIError),
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    reraise=True,
)
def _rpc_int(client, fn: str, term: int) -> int:
    r = client.rpc(fn, {"p_term": term}).execute()
    return int(r.data or 0)


@retry(
    retry=retry_if_exception_type(APIError),
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    reraise=True,
)
def _rpc_load_votes_sitting(client, term: int, sitting: int) -> int:
    r = client.rpc(
        "load_votes_for_sitting", {"p_term": term, "p_sitting": sitting}
    ).execute()
    return int(r.data or 0)


def run_core_load(term: int = 10) -> LoadReport:
    """Run the core load. Each SQL function runs in its own RPC call so each fits
    well under the anon-role statement_timeout (default 8s on Supabase). The big
    load_votes step is further split per-sitting.
    """
    client = supabase()
    steps: list[LoadStep] = []

    for fn in _PRE_STEPS:
        affected = _rpc_int(client, fn, term)
        logger.info("load {}: affected={}", fn, affected)
        steps.append(LoadStep(step=fn, affected=affected))

    sittings = client.rpc("staged_sittings", {"p_term": term}).execute().data or []
    total_votes = 0
    for row in sittings:
        s = row["sitting"]
        n = _rpc_load_votes_sitting(client, term, s)
        total_votes += n
        logger.info("load_votes sitting={}: affected={}", s, n)
    steps.append(LoadStep(step="load_votes", affected=total_votes))
    logger.info("load load_votes (total): affected={}", total_votes)
    return LoadReport(steps=steps)
