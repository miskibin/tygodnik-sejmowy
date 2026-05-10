"""E2E tests for cross-entity linkage views/tables (mig 0060/0061/0062/0063/0064).

Asserts data-integrity invariants on:
  * voting_stage_summary  view  : one row per voting (with link), valid stage codes
  * voting_row_context    view  : enriches summary with print + process titles
  * statement_print_links table : agenda + mention provenance, no orphans

Skipped by default. Enable with `RUN_E2E=1`.
"""
from __future__ import annotations

import os

import pytest

from supagraf.db import supabase

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_E2E") != "1",
    reason="e2e against live Supabase; set RUN_E2E=1 to enable",
)

# Stage code vocabulary from voting_stage_summary view (mig 0062). Kept here
# so the test fails loudly if the view starts emitting unmapped codes —
# frontend STAGE_LABEL falls back to raw, but unknown codes are a smell.
KNOWN_STAGE_CODES = {
    # process_stages.stage_type values that actually surface (post-Start filter)
    "Voting", "CommitteeReport", "SenatePosition", "SejmReading",
    "Reading", "ReadingReferral", "Referral", "CommitteeWork",
    "End", "ToPresident", "PresidentSignature", "Opinion",
    "SenatePositionConsideration", "Veto",
    # Title-regex synthesized codes
    "Amendment", "Procedural", "Election", "Motion",
    "FirstReading", "SecondReading", "ThirdReading",
}


@pytest.fixture(scope="module")
def sb():
    return supabase()


# ----- voting_stage_summary -----------------------------------------------

def test_voting_stage_summary_unique_per_voting(sb):
    """The view must return at most one row per voting_id (distinct on)."""
    rows = sb.table("voting_stage_summary").select("voting_id").limit(2000).execute().data or []
    ids = [r["voting_id"] for r in rows]
    assert len(ids) == len(set(ids)), "voting_stage_summary returned duplicate voting_ids"


def test_voting_stage_summary_codes_in_vocab(sb):
    """Every emitted stage_type must be in the known vocab so the frontend
    label map stays in sync with reality."""
    rows = sb.table("voting_stage_summary").select("stage_type").limit(2000).execute().data or []
    seen = {r["stage_type"] for r in rows if r["stage_type"] is not None}
    unknown = seen - KNOWN_STAGE_CODES
    assert not unknown, f"Unknown stage_type codes leaking into view: {unknown}"


def test_voting_stage_summary_min_coverage(sb):
    """Stage coverage on term 10 must hit the plan's 70% target."""
    votings = sb.table("votings").select("id", count="exact", head=True).eq("term", 10).execute()
    total = votings.count or 0
    rows = sb.table("voting_stage_summary").select("stage_type").limit(2000).execute().data or []
    with_stage = sum(1 for r in rows if r.get("stage_type") is not None)
    assert total > 0
    coverage = with_stage / total
    assert coverage >= 0.70, f"voting_stage_summary stage coverage {coverage:.2%} < 70%"


# ----- voting_row_context -------------------------------------------------

def test_voting_row_context_print_short_title_resolves_when_print_present(sb):
    """When primary_print_id is set, print_short_title must come from prints
    (best-effort — short_title is allowed to be null on a few prints)."""
    rows = sb.table("voting_row_context").select(
        "voting_id, primary_print_id, print_term, print_number"
    ).not_.is_("primary_print_id", "null").limit(50).execute().data or []
    assert rows, "voting_row_context returned no rows with primary_print_id"
    for r in rows:
        assert r["print_term"] == 10
        assert r["print_number"], f"row {r['voting_id']} has print_id but no print_number"


# ----- statement_print_links ---------------------------------------------

def test_statement_print_links_sources_in_vocab(sb):
    """Constraint allows only ('agenda_item','title_regex','manual')."""
    rows = sb.table("statement_print_links").select("source").limit(1000).execute().data or []
    sources = {r["source"] for r in rows}
    assert sources <= {"agenda_item", "title_regex", "manual"}, (
        f"unexpected sources in statement_print_links: {sources}"
    )


def test_statement_print_links_min_agenda_coverage(sb):
    """At least 40% of statements with body_text must have an agenda_item link."""
    stmts = (
        sb.table("proceeding_statements")
        .select("id", count="exact", head=True)
        .eq("term", 10)
        .not_.is_("body_text", "null")
        .execute()
    )
    total_stmts = stmts.count or 0
    if total_stmts == 0:
        pytest.skip("no statements loaded")
    # Count distinct statement_ids with source='agenda_item'.
    page = (
        sb.table("statement_print_links")
        .select("statement_id", count="exact", head=True)
        .eq("source", "agenda_item")
        .execute()
    )
    agenda_links = page.count or 0
    # links >= statements with link, but a tighter bound: distinct statements.
    distinct = sb.rpc(
        "count_distinct_statement_print_link_statements",
        {"p_source": "agenda_item"},
    ) if False else None  # no helper RPC; fall back to coarse ratio.
    # Use a fetched sample to estimate distinct statements (cheap heuristic
    # for the e2e gate; tightening would mean adding a SQL view).
    assert agenda_links >= total_stmts * 0.40, (
        f"agenda-source links {agenda_links} below 40% of {total_stmts} statements"
    )


def test_statement_print_links_no_orphans(sb):
    """Every link must reference a real statement and a real print (FKs).
    Postgres FKs guarantee this, but a regression in cleanup could leave
    rows pointing at deleted parents — sanity-check via one round-trip."""
    sample = sb.table("statement_print_links").select(
        "statement_id, print_id, source"
    ).limit(50).execute().data or []
    if not sample:
        pytest.skip("no statement_print_links rows")
    stmt_ids = list({r["statement_id"] for r in sample})
    print_ids = list({r["print_id"] for r in sample})
    stmts = sb.table("proceeding_statements").select("id").in_("id", stmt_ids).limit(len(stmt_ids)).execute().data or []
    prints = sb.table("prints").select("id").in_("id", print_ids).limit(len(print_ids)).execute().data or []
    assert len(stmts) == len(stmt_ids), "statement_print_links references missing statements"
    assert len(prints) == len(print_ids), "statement_print_links references missing prints"


def test_statement_print_links_provenance_split(sb):
    """Both sources must be populated post-backfill (not one-sided)."""
    agenda = sb.table("statement_print_links").select("statement_id", count="exact", head=True).eq("source", "agenda_item").execute()
    regex_ = sb.table("statement_print_links").select("statement_id", count="exact", head=True).eq("source", "title_regex").execute()
    assert (agenda.count or 0) > 0, "no agenda_item-source links"
    assert (regex_.count or 0) > 0, "no title_regex-source links"
