"""End-to-end proceedings test (live Supabase). Gated by RUN_E2E=1."""
from __future__ import annotations

import os
from pathlib import Path

import pytest

from supagraf.db import supabase
from supagraf.stage import proceedings as stage_proceedings

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_E2E") != "1",
    reason="e2e against live Supabase; set RUN_E2E=1 to enable",
)

REPO_ROOT = Path(__file__).resolve().parents[3]
PROC_DIR = REPO_ROOT / "fixtures" / "sejm" / "proceedings"


@pytest.fixture(scope="module")
def loaded():
    report = stage_proceedings.stage(term=10)
    assert report.ok(), report.errors
    client = supabase()
    affected = client.rpc("load_proceedings", {"p_term": 10}).execute().data
    assert int(affected or 0) >= 1
    return client


def test_counts(loaded):
    client = loaded
    p = client.table("proceedings").select("id", count="exact").eq("term", 10).execute().count
    s = client.table("proceeding_statements").select("id", count="exact").eq("term", 10).execute().count
    assert p == 9
    # 49 (519) + 50 (852) ... total 6609 across 29 days.
    assert s == 6609


def test_proc_49_two_days_with_519(loaded):
    client = loaded
    proc = (
        client.table("proceedings").select("id")
        .eq("term", 10).eq("number", 49).single().execute().data
    )
    days = client.table("proceeding_days").select("id,date").eq("proceeding_id", proc["id"]).execute().data
    assert len(days) == 2
    day_ids = [d["id"] for d in days]
    s_count = (
        client.table("proceeding_statements").select("id", count="exact")
        .in_("proceeding_day_id", day_ids).execute().count
    )
    assert s_count == 519


def test_at_least_one_body_text(loaded):
    client = loaded
    cnt = (
        client.table("proceeding_statements").select("id", count="exact")
        .eq("term", 10).not_.is_("body_text", "null").execute().count
    )
    assert cnt > 0


def test_at_least_one_nonmp(loaded):
    client = loaded
    cnt = (
        client.table("proceeding_statements").select("id", count="exact")
        .eq("term", 10).is_("mp_id", "null").execute().count
    )
    assert cnt > 0


def test_agenda_items_populated(loaded):
    client = loaded
    n = client.table("agenda_items").select("id", count="exact").execute().count
    assert n >= 200


def test_agenda_item_processes_resolved(loaded):
    client = loaded
    n = (
        client.table("agenda_item_processes")
        .select("agenda_item_id", count="exact")
        .eq("term", 10).execute().count
    )
    assert n >= 1


def test_unresolved_agenda_process_refs(loaded):
    client = loaded
    n = (
        client.table("unresolved_agenda_process_refs")
        .select("id", count="exact")
        .eq("term", 10).is_("resolved_at", "null").execute().count
    )
    assert n >= 100


def test_votings_proceedings_no_orphans(loaded):
    client = loaded
    votings = client.table("votings").select("term,sitting").eq("term", 10).execute().data or []
    procs = client.table("proceedings").select("number").eq("term", 10).execute().data or []
    proc_nums = {p["number"] for p in procs}
    orphans = [v for v in votings if v["sitting"] not in proc_nums]
    assert orphans == []


def test_dates_covered_by_days(loaded):
    """Direct query — assert_invariants is too heavy for the anon statement
    timeout once all resources are loaded (same caveat as videos e2e)."""
    client = loaded
    procs = client.table("proceedings").select("id,dates").eq("term", 10).execute().data or []
    days = client.table("proceeding_days").select("proceeding_id,date").execute().data or []
    by_pid: dict[int, set[str]] = {}
    for d in days:
        by_pid.setdefault(d["proceeding_id"], set()).add(d["date"])
    for p in procs:
        for dt in p["dates"]:
            assert dt in by_pid.get(p["id"], set()), f"date {dt} of proceeding {p['id']} has no day row"
