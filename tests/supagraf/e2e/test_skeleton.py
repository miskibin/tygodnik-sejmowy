"""End-to-end skeleton test.

Runs the full mps+clubs+votings pipeline against the live Supabase project,
then asserts data-integrity invariants on the loaded rows. Re-runnable.

Skipped by default. Enable with `RUN_E2E=1`.
"""
from __future__ import annotations

import os

import pytest

from supagraf.db import supabase
from supagraf.load import run_core_load
from supagraf.stage import clubs as stage_clubs
from supagraf.stage import mps as stage_mps
from supagraf.stage import votings as stage_votings

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_E2E") != "1",
    reason="e2e against live Supabase; set RUN_E2E=1 to enable",
)


@pytest.fixture(scope="module")
def loaded():
    """Run stage + load once and return the invariants snapshot."""
    assert stage_clubs.stage().ok()
    assert stage_mps.stage().ok()
    assert stage_votings.stage().ok()
    run_core_load(term=10)
    inv = supabase().rpc("assert_invariants", {"p_term": 10}).execute().data
    return inv


def test_row_counts(loaded):
    assert loaded["mps_total"] == 498
    assert loaded["clubs_total"] >= 11  # 11 fixture + inferred
    assert loaded["votings_total"] == 623
    assert loaded["votes_total"] == 286_541
    assert loaded["memberships_total"] >= 498


def test_inferred_clubs_present(loaded):
    # Republikanie + Polska2050-TD referenced but not in fixtures
    assert loaded["inferred_clubs"] >= 2


def test_no_orphan_rows(loaded):
    assert loaded["orphan_votes_no_voting"] == 0
    assert loaded["orphan_votes_no_mp"] == 0
    assert loaded["orphan_membership_no_mp"] == 0
    assert loaded["orphan_membership_no_club"] == 0


def test_vote_tallies_match_summary(loaded):
    m = loaded["tally_mismatches"]
    assert m["yes_mismatch"] == 0
    assert m["no_mismatch"] == 0
    assert m["abstain_mismatch"] == 0
    assert m["present_mismatch"] == 0
    assert m["not_participating_mismatch"] == 0
    assert m["total_voted_mismatch"] == 0


def test_voting_size_invariant(loaded):
    # total_voted + not_participating must equal actual vote-row count per voting
    assert loaded["votings_where_total_voted_plus_not_participating_neq_voting_size"] == 0


def test_distinct_voters_within_mps(loaded):
    # All MPs that voted must be in mps fixtures
    assert loaded["distinct_mps_voted"] <= loaded["mps_total"]


def test_membership_history_captured(loaded):
    # 22+ MPs switched clubs (Polska2050 -> Centrum migration is real history)
    assert loaded["mps_with_multiple_memberships"] >= 20


def test_idempotent_rerun(loaded):
    """Re-run load — invariants must be identical."""
    run_core_load(term=10)
    after = supabase().rpc("assert_invariants", {"p_term": 10}).execute().data
    assert after["mps_total"] == loaded["mps_total"]
    assert after["votes_total"] == loaded["votes_total"]
    assert after["votings_total"] == loaded["votings_total"]
    assert after["memberships_total"] == loaded["memberships_total"]
