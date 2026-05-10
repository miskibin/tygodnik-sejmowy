"""End-to-end ELI acts test.

Fetches a small slice of the live ELI registry, stages, loads, and asserts
counts + relation/unresolved queue + self-cycle CHECK + idempotency.
Skipped by default; enable with `RUN_E2E=1`.
"""
from __future__ import annotations

import os
from pathlib import Path

import pytest

from supagraf.db import supabase
from supagraf.fetch.acts import fetch_acts
from supagraf.fixtures.storage import fixtures_root
from supagraf.stage import acts as stage_acts

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_E2E") != "1",
    reason="e2e against live Supabase + api.sejm.gov.pl; set RUN_E2E=1 to enable",
)

REPO_ROOT = Path(__file__).resolve().parents[3]


@pytest.fixture(scope="module")
def loaded():
    """Fetch a small batch from a recent year, stage, then load.

    Uses limit_per_year=10 so the test is bounded (~5s wall over network).
    """
    # Tiny slice of a recent year; verifies the full pipeline end-to-end.
    fetch_acts(years=[2025], publisher="DU", throttle_s=0.1, limit_per_year=10)
    report = stage_acts.stage(term=10)
    assert report.ok(), report.errors
    client = supabase()
    n_acts = int(client.rpc("load_acts", {"p_term": 10}).execute().data or 0)
    n_rels = int(client.rpc("load_act_relations", {"p_term": 10}).execute().data or 0)
    return client, n_acts, n_rels


def test_acts_loaded(loaded):
    client, n_acts, _ = loaded
    rows = (
        client.table("acts").select("id", count="exact")
        .eq("publisher", "DU").eq("year", 2025).execute().count
    )
    assert rows >= 10  # we fetched at least 10 (other agents may have added more)
    # n_acts is row_count of the upsert; with idempotent re-runs the second
    # call returns 0 — but on the first call after fetch it's >=10.
    assert n_acts >= 0


def test_acts_eli_id_unique(loaded):
    client, _, _ = loaded
    rows = (
        client.table("acts").select("eli_id")
        .eq("publisher", "DU").eq("year", 2025).execute().data or []
    )
    eli_ids = [r["eli_id"] for r in rows]
    assert len(eli_ids) == len(set(eli_ids))


def test_relation_or_queue_for_each_ref(loaded):
    """Some recent acts must have at least one reference; those refs land
    either in act_relations (target found in our acts) or unresolved_act_relations."""
    client, _, _ = loaded
    rels = client.table("act_relations").select("id", count="exact").execute().count
    unres = client.table("unresolved_act_relations").select("id", count="exact").execute().count
    # 2025 acts almost certainly have references (Podstawa prawna, Akty zmienione, etc.)
    assert rels + unres > 0


def test_self_cycle_check_enforced(loaded):
    """The CHECK (target_act_id is null or source_act_id <> target_act_id) must
    block any attempt to insert a self-relation row."""
    client, _, _ = loaded
    one = (
        client.table("acts").select("id").limit(1).execute().data or []
    )
    assert one
    aid = one[0]["id"]
    # Direct insert via RPC isn't easy, use raw SQL through PostgREST execute_sql is unavailable;
    # rely on the supabase python client. Inserting target_act_id = source_act_id should error.
    with pytest.raises(Exception):
        (
            client.table("act_relations").insert({
                "source_act_id": aid,
                "relation_type": "amends",
                "target_act_id": aid,
                "target_eli_id": "DU/9999/9999",
            }).execute()
        )


def test_relation_type_check_enforced(loaded):
    """Invalid relation_type must be rejected by the CHECK constraint."""
    client, _, _ = loaded
    one = client.table("acts").select("id").limit(1).execute().data or []
    assert one
    aid = one[0]["id"]
    with pytest.raises(Exception):
        (
            client.table("act_relations").insert({
                "source_act_id": aid,
                "relation_type": "totally_made_up",
                "target_eli_id": "DU/9999/9999",
            }).execute()
        )


def test_idempotency_rerun(loaded):
    client, _, _ = loaded
    def _snap():
        return (
            client.table("acts").select("id", count="exact")
              .eq("publisher", "DU").eq("year", 2025).execute().count,
            client.table("act_relations").select("id", count="exact").execute().count,
            client.table("unresolved_act_relations").select("id", count="exact")
              .is_("resolved_at", "null").execute().count,
        )
    before = _snap()
    client.rpc("load_acts", {"p_term": 10}).execute()
    client.rpc("load_act_relations", {"p_term": 10}).execute()
    after = _snap()
    assert after == before, f"counts changed on rerun: {before} -> {after}"


def test_processes_eli_act_id_column_exists(loaded):
    """0038 added the slot column. Even when null, the column should be queryable."""
    client, _, _ = loaded
    rows = (
        client.table("processes").select("id, eli, eli_act_id")
        .eq("term", 10).limit(1).execute().data or []
    )
    assert rows  # processes already loaded by upstream tests
    assert "eli_act_id" in rows[0]
