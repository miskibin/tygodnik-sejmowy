"""End-to-end committees test.

Stages committees from fixtures into Supabase, runs load_committees, asserts
row counts, FK integrity, no orphans/self-refs, and idempotency.
Skipped by default; enable with `RUN_E2E=1`.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import pytest
from postgrest.exceptions import APIError

from supagraf.db import supabase
from supagraf.stage import committees as stage_committees

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_E2E") != "1",
    reason="e2e against live Supabase; set RUN_E2E=1 to enable",
)

REPO_ROOT = Path(__file__).resolve().parents[3]
COMMITTEES_DIR = REPO_ROOT / "fixtures" / "sejm" / "committees"


def _fixture_files() -> list[Path]:
    return [p for p in sorted(COMMITTEES_DIR.glob("*.json")) if not p.name.startswith("_")]


@pytest.fixture(scope="module")
def loaded():
    """Stage + load once. Returns (client, payloads_by_code)."""
    report = stage_committees.stage()
    assert report.ok(), report.errors
    client = supabase()
    affected = client.rpc("load_committees", {"p_term": 10}).execute().data
    assert int(affected or 0) >= 0
    payloads = {}
    for p in _fixture_files():
        d = json.loads(p.read_text(encoding="utf-8"))
        payloads[d["code"]] = d
    return client, payloads


def test_committee_count(loaded):
    """First-class committees match fixture count; stubs created for referenced subcommittee codes."""
    client, payloads = loaded
    total = client.table("committees").select("id", count="exact").eq("term", 10).execute().count
    first_class = (
        client.table("committees").select("id", count="exact")
        .eq("term", 10).eq("is_stub", False).execute().count
    )
    stubs = (
        client.table("committees").select("id", count="exact")
        .eq("term", 10).eq("is_stub", True).execute().count
    )
    assert first_class == len(payloads) == 40
    assert stubs == 103
    assert total == 143


def test_member_count(loaded):
    client, payloads = loaded
    expected = sum(len(d.get("members", []) or []) for d in payloads.values())
    cnt = client.table("committee_members").select("id", count="exact").eq("term", 10).execute().count
    assert cnt == expected == 1075


def test_subcommittee_edge_count(loaded):
    client, payloads = loaded
    expected = sum(len(d.get("subCommittees", []) or []) for d in payloads.values())
    cnt = (
        client.table("committee_subcommittees").select("parent_id", count="exact").execute().count
    )
    assert cnt == expected == 103


def test_invariants_zero_orphans_and_self_refs(loaded):
    client, _ = loaded
    members = client.table("committee_members").select("id", count="exact").eq("term", 10).execute().count
    self_refs_raw = (
        client.table("committee_subcommittees").select("parent_id,child_id").execute().data or []
    )
    self_refs = sum(1 for r in self_refs_raw if r["parent_id"] == r["child_id"])
    assert members == 1075
    assert self_refs == 0
    # Orphan check: every committee_members.mp_id must resolve (FK enforced; double-check).
    cm = client.table("committee_members").select("mp_id").eq("term", 10).execute().data or []
    mp_ids = sorted({r["mp_id"] for r in cm})
    found = client.table("mps").select("mp_id").eq("term", 10).in_("mp_id", mp_ids).execute().data or []
    assert {r["mp_id"] for r in found} == set(mp_ids)


def test_idempotency_rerun(loaded):
    client, _ = loaded
    def _snap():
        return (
            client.table("committees").select("id", count="exact").eq("term", 10).execute().count,
            client.table("committee_members").select("id", count="exact").eq("term", 10).execute().count,
            client.table("committee_subcommittees").select("parent_id", count="exact").execute().count,
        )
    before = _snap()
    client.rpc("load_committees", {"p_term": 10}).execute()
    after = _snap()
    assert after == before, f"counts changed on rerun: {before} -> {after}"


def test_member_fk_resolves_to_mps(loaded):
    """Sample: every committee_members.mp_id must resolve to mps(term, mp_id)."""
    client, _ = loaded
    rows = client.table("committee_members").select("mp_id").eq("term", 10).execute().data or []
    mp_ids = sorted({r["mp_id"] for r in rows})
    assert mp_ids
    found = (
        client.table("mps").select("mp_id").eq("term", 10).in_("mp_id", mp_ids).execute().data or []
    )
    assert {r["mp_id"] for r in found} == set(mp_ids)


def test_hard_fk_on_subcommittee_edges(loaded):
    """Direct insert of a subcommittee edge with bogus child_id must raise FK violation."""
    client, _ = loaded
    p = client.table("committees").select("id").eq("term", 10).limit(1).execute().data
    assert p
    raised = False
    try:
        client.table("committee_subcommittees").insert({
            "parent_id": p[0]["id"],
            "child_id": 999999999,
        }).execute()
    except APIError:
        raised = True
    assert raised, "expected FK violation on bogus child_id"


def test_subcommittee_stubs_are_marked(loaded):
    """Codes only referenced via subCommittees[] land as is_stub=true rows."""
    client, _ = loaded
    row = (
        client.table("committees")
        .select("is_stub")
        .eq("term", 10).eq("code", "ASW01N").single().execute().data
    )
    assert row["is_stub"] is True
    # First-class committee NOT a stub.
    asw = (
        client.table("committees")
        .select("is_stub")
        .eq("term", 10).eq("code", "ASW").single().execute().data
    )
    assert asw["is_stub"] is False


def test_chair_function_persisted(loaded):
    """ASW chair (przewodniczący) is mp_id 140 with function set."""
    client, _ = loaded
    asw = client.table("committees").select("id").eq("term", 10).eq("code", "ASW").single().execute().data
    rows = (
        client.table("committee_members")
        .select("mp_id,function,club_short")
        .eq("committee_id", asw["id"]).eq("function", "przewodniczący")
        .execute().data or []
    )
    assert len(rows) == 1
    assert rows[0]["mp_id"] == 140
