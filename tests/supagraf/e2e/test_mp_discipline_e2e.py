"""F3 e2e: mp_vote_discipline + mp_discipline_summary + refresh_mp_discipline."""
from __future__ import annotations

import os

import pytest

from supagraf.db import supabase

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_E2E") != "1",
    reason="e2e against live Supabase; set RUN_E2E=1 to enable",
)


def test_detail_view_nonempty():
    cnt = supabase().table("mp_vote_discipline").select("voting_id", count="exact").limit(1).execute().count
    assert cnt > 0, "mp_vote_discipline empty"


def test_summary_row_count_term10():
    rows = (
        supabase().table("mp_discipline_summary").select("mp_id", count="exact")
        .eq("term", 10).execute()
    )
    n = rows.count
    assert 400 <= n <= 600, f"expected ~460..543 rows for term 10, got {n}"


def test_pct_aligned_range_and_n_votes():
    rows = (
        supabase().table("mp_discipline_summary")
        .select("mp_id,n_votes,pct_aligned").eq("term", 10).execute().data or []
    )
    for r in rows:
        nv = r["n_votes"]
        pct = r["pct_aligned"]
        if nv == 0:
            assert pct is None
        else:
            assert pct is not None, f"mp_id={r['mp_id']} n_votes={nv} pct=NULL"
            pct_f = float(pct)
            assert 0.0 <= pct_f <= 100.0, f"out-of-range pct={pct} mp_id={r['mp_id']}"


def test_refresh_helper_runs():
    r = supabase().rpc("refresh_mp_discipline", {}).execute()
    assert r is not None


def test_sanity_top_bottom_print(capsys):
    client = supabase()
    top = (
        client.table("mp_discipline_summary")
        .select("mp_id,n_votes,pct_aligned").eq("term", 10)
        .gte("n_votes", 100).order("pct_aligned", desc=True).limit(5).execute().data
    )
    bottom = (
        client.table("mp_discipline_summary")
        .select("mp_id,n_votes,pct_aligned").eq("term", 10)
        .gte("n_votes", 100).order("pct_aligned", desc=False).limit(5).execute().data
    )
    print("\n[F3] top-5 most-disciplined (term=10, n_votes>=100):")
    for r in top:
        print(f"  mp_id={r['mp_id']:4d} n={r['n_votes']:4d} pct={r['pct_aligned']}")
    print("\n[F3] bottom-5 most-independent (term=10, n_votes>=100):")
    for r in bottom:
        print(f"  mp_id={r['mp_id']:4d} n={r['n_votes']:4d} pct={r['pct_aligned']}")
    assert top and bottom
    assert float(top[0]["pct_aligned"]) >= float(bottom[0]["pct_aligned"])
