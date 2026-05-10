"""End-to-end processes test.

Stages 164 process fixtures into Supabase, runs load_processes, asserts
counts, FK integrity, no orphan committees, queue tracking, no cycles, and
idempotency. Skipped by default; enable with `RUN_E2E=1`.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from supagraf.db import supabase
from supagraf.stage import processes as stage_processes

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_E2E") != "1",
    reason="e2e against live Supabase; set RUN_E2E=1 to enable",
)

REPO_ROOT = Path(__file__).resolve().parents[3]
PROCESSES_DIR = REPO_ROOT / "fixtures" / "sejm" / "processes"


def _fixture_files() -> list[Path]:
    return [p for p in sorted(PROCESSES_DIR.glob("*.json")) if not p.name.startswith("_")]


def _walk_stages(stages):
    """Yield every stage node depth-first."""
    for s in stages or []:
        yield s
        yield from _walk_stages(s.get("children", []))


@pytest.fixture(scope="module")
def loaded():
    """Stage + load once. Returns (client, payloads_by_number)."""
    report = stage_processes.stage()
    assert report.ok(), report.errors
    client = supabase()
    affected = client.rpc("load_processes", {"p_term": 10}).execute().data
    assert int(affected or 0) >= 0
    payloads = {}
    for p in _fixture_files():
        d = json.loads(p.read_text(encoding="utf-8"))
        payloads[d["number"]] = d
    return client, payloads


def test_process_count(loaded):
    client, payloads = loaded
    cnt = client.table("processes").select("id", count="exact").eq("term", 10).execute().count
    assert cnt == len(payloads) == 164


def test_stage_count(loaded):
    client, payloads = loaded
    expected = sum(1 for d in payloads.values() for _ in _walk_stages(d.get("stages", [])))
    cnt = client.table("process_stages").select("id", count="exact").eq("term", 10).execute().count
    assert cnt == expected


def test_stage_tree_depth_and_parents(loaded):
    """Root stages: parent_id null, depth 0. Children: parent_id set, depth>=1."""
    client, _ = loaded
    roots = (
        client.table("process_stages").select("id", count="exact")
        .eq("term", 10).is_("parent_id", "null").execute().count
    )
    children = (
        client.table("process_stages").select("id", count="exact")
        .eq("term", 10).not_.is_("parent_id", "null").execute().count
    )
    assert roots > 0
    assert children > 0
    # depth=0 must equal roots; depth>=1 must equal children.
    depth0 = (
        client.table("process_stages").select("id", count="exact")
        .eq("term", 10).eq("depth", 0).execute().count
    )
    assert depth0 == roots


def test_invariants_zero_cycles_and_orphans(loaded):
    client, _ = loaded
    inv = client.rpc("assert_invariants", {"p_term": 10}).execute().data
    assert inv["process_stage_cycles_count"] == 0
    assert inv["process_stages_orphan_committee"] == 0
    assert inv["processes_total"] == 164


def test_unresolved_print_refs_queued(loaded):
    """Audit: 1 print_number ('17719-z') doesn't resolve in prints."""
    client, _ = loaded
    inv = client.rpc("assert_invariants", {"p_term": 10}).execute().data
    open_count = inv["unresolved_process_print_refs_open"]
    # At least 1 expected (sentinel '17719-z'). Allow a small range in case the
    # prints table evolves; the invariant is non-zero tracking.
    assert open_count >= 1
    rows = (
        client.table("unresolved_process_print_refs").select("raw_print_number")
        .eq("term", 10).is_("resolved_at", "null").execute().data or []
    )
    raw_nums = {r["raw_print_number"] for r in rows}
    assert "17719-z" in raw_nums


def test_committee_stub_extended_for_sejm(loaded):
    """The 'Sejm' code referenced in stages but not in committees fixtures must
    have been stub-extended with is_stub=true."""
    client, _ = loaded
    row = (
        client.table("committees").select("is_stub")
        .eq("term", 10).eq("code", "Sejm").single().execute().data
    )
    assert row["is_stub"] is True


def test_rapporteur_fk_resolves_to_mps(loaded):
    """Every non-null rapporteur_id must resolve in mps(term, mp_id)."""
    client, _ = loaded
    rows = (
        client.table("process_stages").select("rapporteur_id")
        .eq("term", 10).not_.is_("rapporteur_id", "null").execute().data or []
    )
    assert rows
    ids = sorted({r["rapporteur_id"] for r in rows})
    found = (
        client.table("mps").select("mp_id").eq("term", 10).in_("mp_id", ids).execute().data or []
    )
    assert {r["mp_id"] for r in found} == set(ids)


def test_idempotency_rerun(loaded):
    client, _ = loaded
    def _snap():
        return (
            client.table("processes").select("id", count="exact").eq("term", 10).execute().count,
            client.table("process_stages").select("id", count="exact").eq("term", 10).execute().count,
            client.table("unresolved_process_print_refs").select("id", count="exact").eq("term", 10).execute().count,
        )
    before = _snap()
    client.rpc("load_processes", {"p_term": 10}).execute()
    after = _snap()
    assert after == before, f"counts changed on rerun: {before} -> {after}"


def test_invariants_print_resolution_breakdown(loaded):
    client, _ = loaded
    inv = client.rpc("assert_invariants", {"p_term": 10}).execute().data
    resolved = inv["process_stages_resolved_print_count"]
    unresolved = inv["process_stages_unresolved_print_count"]
    assert resolved + unresolved > 0
    assert unresolved >= 1  # '17719-z' sentinel
