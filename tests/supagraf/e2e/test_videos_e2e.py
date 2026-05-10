"""End-to-end videos test.

Stages 1000 video fixtures into Supabase, runs load_videos, asserts counts,
type breakdown, FK integrity (committee_id resolves), no orphans, idempotency,
and stub-extend works for any committee codes new to the videos resource.
Skipped by default; enable with `RUN_E2E=1`.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from supagraf.db import supabase
from supagraf.stage import videos as stage_videos

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_E2E") != "1",
    reason="e2e against live Supabase; set RUN_E2E=1 to enable",
)

REPO_ROOT = Path(__file__).resolve().parents[3]
VIDEOS_DIR = REPO_ROOT / "fixtures" / "sejm" / "videos"


def _fixture_files() -> list[Path]:
    return [p for p in sorted(VIDEOS_DIR.glob("*.json")) if not p.name.startswith("_")]


@pytest.fixture(scope="module")
def loaded():
    """Stage + load once. Returns (client, payloads_by_unid)."""
    report = stage_videos.stage()
    assert report.ok(), report.errors
    client = supabase()
    affected = client.rpc("load_videos", {"p_term": 10}).execute().data
    assert int(affected or 0) >= 0
    payloads = {}
    for p in _fixture_files():
        d = json.loads(p.read_text(encoding="utf-8"))
        payloads[d["unid"]] = d
    return client, payloads


def test_video_count(loaded):
    client, payloads = loaded
    cnt = client.table("videos").select("id", count="exact").eq("term", 10).execute().count
    assert cnt == len(payloads) == 1000


def test_type_breakdown(loaded):
    """Direct table queries: assert_invariants is too heavy for the anon
    statement timeout once all resources are loaded. Videos invariants are
    still defined and callable by ops, just not in the e2e CI loop."""
    client, payloads = loaded
    expected = {}
    for d in payloads.values():
        expected[d["type"]] = expected.get(d["type"], 0) + 1
    rows = client.table("videos").select("type").eq("term", 10).execute().data or []
    actual = {}
    for r in rows:
        actual[r["type"]] = actual.get(r["type"], 0) + 1
    assert actual == expected


def test_zero_committee_orphans(loaded):
    """Every row with non-null committee_code must have at least one
    video_committees(role='committee'). Same for subcommittee_code."""
    client, _ = loaded
    vids_w_c = (
        client.table("videos").select("id,committee_code").eq("term", 10)
        .not_.is_("committee_code", "null").execute().data or []
    )
    ids = [v["id"] for v in vids_w_c]
    joined = (
        client.table("video_committees").select("video_id")
        .eq("role", "committee").in_("video_id", ids).execute().data or []
    )
    missing = set(ids) - {r["video_id"] for r in joined}
    assert missing == set(), f"committee orphans: {len(missing)}"

    vids_w_s = (
        client.table("videos").select("id,subcommittee_code").eq("term", 10)
        .not_.is_("subcommittee_code", "null").execute().data or []
    )
    ids_s = [v["id"] for v in vids_w_s]
    joined_s = (
        client.table("video_committees").select("video_id")
        .eq("role", "subcommittee").in_("video_id", ids_s).execute().data or []
    )
    missing_s = set(ids_s) - {r["video_id"] for r in joined_s}
    assert missing_s == set(), f"subcommittee orphans: {len(missing_s)}"


def test_no_committee_count(loaded):
    """Audit: 426 videos lack a committee field (inne|konferencja|posiedzenie)."""
    client, payloads = loaded
    expected = sum(1 for d in payloads.values() if not d.get("committee"))
    cnt = (
        client.table("videos").select("id", count="exact")
        .eq("term", 10).is_("committee_code", "null").execute().count
    )
    assert cnt == expected == 426


def test_transcribed_count(loaded):
    """Audit: transcribe always False (count = 0)."""
    client, _ = loaded
    cnt = (
        client.table("videos").select("id", count="exact")
        .eq("term", 10).eq("transcribe", True).execute().count
    )
    assert cnt == 0


def test_video_committees_junction(loaded):
    """Junction rows: one per (video, code, role); multi-code strings split."""
    client, payloads = loaded
    expected = 0
    for d in payloads.values():
        for fld in ("committee", "subcommittee"):
            v = d.get(fld)
            if v:
                expected += sum(1 for x in v.split(",") if x.strip())
    cnt = client.table("video_committees").select("video_id", count="exact").execute().count
    assert cnt == expected


def test_idempotency_rerun(loaded):
    client, _ = loaded
    def _snap():
        return (
            client.table("videos").select("id", count="exact").eq("term", 10).execute().count,
            client.table("video_committees").select("video_id", count="exact").execute().count,
        )
    before = _snap()
    client.rpc("load_videos", {"p_term": 10}).execute()
    after = _snap()
    assert after == before, f"counts changed on rerun: {before} -> {after}"


def test_stub_extend_safety(loaded):
    """Every code referenced from videos resolves in committees(term, code).
    If any new codes appeared (not present from D1), they were stubbed in.
    """
    client, payloads = loaded
    referenced = set()
    for d in payloads.values():
        for fld in ("committee", "subcommittee"):
            v = d.get(fld)
            if v:
                for x in v.split(","):
                    x = x.strip()
                    if x:
                        referenced.add(x)
    rows = client.table("committees").select("code").eq("term", 10).execute().data or []
    have = {r["code"] for r in rows}
    missing = referenced - have
    assert missing == set(), f"unresolved codes after load_videos: {missing}"


def test_committee_field_data_integrity(loaded):
    """Sample known fixture: 004BBF920E8397E2C1258D950045099C → committee 'RSP'."""
    client, _ = loaded
    row = (
        client.table("videos").select("committee_code,type,unid")
        .eq("term", 10).eq("unid", "004BBF920E8397E2C1258D950045099C")
        .single().execute().data
    )
    assert row["committee_code"] == "RSP"
    assert row["type"] == "komisja"
