"""E2E: mp_attendance + mp_activity_summary match source tables (RUN_E2E=1)."""
from __future__ import annotations

import os

import pytest

from supagraf.db import supabase

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_E2E") != "1",
    reason="e2e against live Supabase; set RUN_E2E=1 to enable",
)


def test_refresh_mp_activity_runs():
    r = supabase().rpc("refresh_mp_activity", {}).execute()
    assert r is not None


def test_activity_summary_matches_statements_for_sample_mp():
    client = supabase()
    sample = (
        client.table("proceeding_statements")
        .select("mp_id")
        .eq("term", 10)
        .not_.is_("mp_id", "null")
        .limit(1)
        .execute()
        .data
    )
    if not sample:
        pytest.skip("no proceeding_statements with mp_id for term 10")
    mp_id = sample[0]["mp_id"]

    rows = (
        client.table("mp_activity_summary")
        .select("n_statements")
        .eq("term", 10)
        .eq("mp_id", mp_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    assert len(rows) == 1, f"mp_activity_summary missing row for mp_id={mp_id}"
    mv = rows[0]

    raw = (
        client.table("proceeding_statements")
        .select("id", count="exact")
        .eq("term", 10)
        .eq("mp_id", mp_id)
        .execute()
    )
    assert raw.count == mv["n_statements"], (
        f"n_statements mismatch mp_id={mp_id}: mv={mv['n_statements']} raw={raw.count}"
    )


def test_attendance_matches_votes_for_sample_mp():
    client = supabase()
    sample = (
        client.table("votes")
        .select("mp_id")
        .eq("term", 10)
        .limit(1)
        .execute()
        .data
    )
    if not sample:
        pytest.skip("no votes for term 10")
    mp_id = sample[0]["mp_id"]

    rows = (
        client.table("mp_attendance")
        .select("total_votes", "attended", "pct_attended")
        .eq("term", 10)
        .eq("mp_id", mp_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    assert len(rows) == 1, f"mp_attendance missing row for mp_id={mp_id}"
    mv = rows[0]

    total = (
        client.table("votes")
        .select("voting_id", count="exact")
        .eq("term", 10)
        .eq("mp_id", mp_id)
        .execute()
        .count
    )
    attended = (
        client.table("votes")
        .select("voting_id", count="exact")
        .eq("term", 10)
        .eq("mp_id", mp_id)
        .neq("vote", "ABSENT")
        .execute()
        .count
    )
    assert mv["total_votes"] == total, (
        f"total_votes mismatch mp_id={mp_id}: mv={mv['total_votes']} raw={total}"
    )
    assert mv["attended"] == attended, (
        f"attended mismatch mp_id={mp_id}: mv={mv['attended']} raw={attended}"
    )
    if total and total > 0:
        pct = round(100.0 * attended / total, 1)
        assert float(mv["pct_attended"]) == pytest.approx(pct, rel=0, abs=0.05), (
            f"pct_attended mismatch mp_id={mp_id}: mv={mv['pct_attended']} expected={pct}"
        )
