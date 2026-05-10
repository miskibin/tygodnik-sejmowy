"""F3 e2e: minister_reply_stats + refresh_minister_reply_stats."""
from __future__ import annotations

import os

import pytest

from supagraf.db import supabase

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_E2E") != "1",
    reason="e2e against live Supabase; set RUN_E2E=1 to enable",
)


def test_term10_nonempty():
    n = (
        supabase().table("minister_reply_stats").select("recipient_name", count="exact")
        .eq("term", 10).execute().count
    )
    assert n > 0, f"minister_reply_stats has no term=10 rows (got {n})"


def test_overdue_le_total():
    rows = (
        supabase().table("minister_reply_stats")
        .select("recipient_name,n_total,n_overdue_30d").eq("term", 10)
        .execute().data or []
    )
    assert rows
    for r in rows:
        assert r["n_overdue_30d"] <= r["n_total"], \
            f"overdue>total for {r['recipient_name']}: {r['n_overdue_30d']}>{r['n_total']}"


def test_refresh_helper_runs():
    r = supabase().rpc("refresh_minister_reply_stats", {}).execute()
    assert r is not None


def test_top5_slowest_print(capsys):
    rows = (
        supabase().table("minister_reply_stats")
        .select("recipient_name,n_total,n_overdue_30d,median_days,p90_days,max_days")
        .eq("term", 10).order("p90_days", desc=True, nullsfirst=False).limit(5)
        .execute().data
    )
    assert rows, "no top-5 rows returned"
    print("\n[P3.2] top-5 slowest ministers (term=10, by p90_days):")
    for r in rows:
        print(
            f"  {r['recipient_name'][:60]:60s} "
            f"n={r['n_total']:4d} overdue={r['n_overdue_30d']:4d} "
            f"median={r['median_days']} p90={r['p90_days']} max={r['max_days']}"
        )
    assert len(rows) == 5
