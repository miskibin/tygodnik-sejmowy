"""Load layer: invokes pure-SQL functions defined in supabase/migrations/."""
from __future__ import annotations

from dataclasses import dataclass

from loguru import logger
from postgrest.exceptions import APIError
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from supagraf.db import call_rpc_scalar, supabase

try:
    from psycopg import OperationalError as _PgOperationalError
except ImportError:  # psycopg only required on the direct-PG path
    _PgOperationalError = type("_NoPsycopg", (Exception,), {})


_RPC_RETRY_EXC = (APIError, _PgOperationalError)
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
    # votes: monolithic single-call (0002_core_load_fns.sql). Previously
    # split per-sitting in Python via staged_sittings() + load_votes_for_sitting()
    # to fit under the 8s PostgREST anon timeout; those SQL functions never
    # existed in repo migrations, so the path 404'd on every direct-DSN run.
    # With SUPAGRAF_LOAD_DIRECT_DSN set, statement_timeout is irrelevant
    # (superuser, no Kong), so the single load_votes(p_term) call is fine.
    "load_votes",
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
    retry=retry_if_exception_type(_RPC_RETRY_EXC),
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    reraise=True,
)
def _rpc_int(fn: str, term: int) -> int:
    return int(call_rpc_scalar(fn, {"p_term": term}) or 0)


def run_core_load(term: int = 10) -> LoadReport:
    """Run the core load. Each SQL function is invoked via a single RPC call.

    Path:
      - SUPAGRAF_LOAD_DIRECT_DSN set → psycopg straight to Postgres (no Kong,
        no PostgREST statement_timeout). Heavy functions like load_votes (one
        UPSERT across all sittings) and load_proceedings finish here.
      - DSN unset → falls back to Supabase HTTP client. Older split-per-sitting
        logic against staged_sittings()/load_votes_for_sitting() existed in
        Python but those SQL functions were never shipped in repo migrations,
        so that path was dead code. Migrations only define monolithic
        load_votes(p_term integer).
    """
    # supabase() kept warm so model_run_finish (and any non-RPC writes
    # downstream of load) don't lazy-init on a cold cache.
    supabase()
    steps: list[LoadStep] = []

    for fn in _PRE_STEPS:
        affected = _rpc_int(fn, term)
        logger.info("load {}: affected={}", fn, affected)
        steps.append(LoadStep(step=fn, affected=affected))

    return LoadReport(steps=steps)
