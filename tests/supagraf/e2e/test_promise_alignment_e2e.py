"""Live-DB sanity check for migration 0087 (motion_polarity + alignment).

Skipped automatically when SUPABASE_URL is unset. Run with::

    uv run pytest tests/supagraf/e2e/test_promise_alignment_e2e.py -v

Bosak / 2197 (likwidacja opłaty od psów) is the canonical case the bug
report cited: voting 1513, topic="wniosek o odrzucenie projektu w pierwszym
czytaniu", Bosak voted NO. Pre-migration the panel painted that NO as
"opposed"; post-migration it must resolve to "aligned".
"""
from __future__ import annotations

import os

import pytest

from supagraf.backfill.motion_polarity import classify
from supagraf.db import supabase

pytestmark = pytest.mark.skipif(
    not os.environ.get("SUPABASE_URL"),
    reason="live DB not configured",
)


def test_motion_polarity_column_present() -> None:
    sb = supabase()
    res = sb.table("votings").select("id, motion_polarity").limit(1).execute()
    assert res.data, "votings table empty?"
    # Column must exist; value can be NULL on ambiguous rows.
    assert "motion_polarity" in res.data[0]


def test_promises_stance_column_present_with_default() -> None:
    sb = supabase()
    res = sb.table("promises").select("id, stance").limit(5).execute()
    assert res.data
    for r in res.data:
        assert r["stance"] in ("pro_bill", "anti_bill")


def test_bosak_2197_voting_classified_as_reject() -> None:
    """Voting 1513 / druk 2197 — the bug-report exemplar."""
    sb = supabase()
    res = sb.table("votings").select("id, topic, motion_polarity").eq("id", 1513).execute()
    assert res.data, "voting 1513 missing — fixture drift?"
    row = res.data[0]
    assert "odrzucenie" in (row["topic"] or "").lower()
    assert row["motion_polarity"] == "reject"
    # And the python regex agrees with whatever the DB stored.
    assert classify(row["topic"]) == "reject"


def test_alignment_distribution_for_term_10() -> None:
    """Smoke: roughly the breakdown we expected when designing the regex.

    Loose bounds — guards against pattern regressions but tolerates Sejm
    workflow drift.
    """
    sb = supabase()
    rows: list[dict] = []
    page = 0
    while True:
        chunk = (
            sb.table("votings")
            .select("id, motion_polarity")
            .eq("term", 10)
            .range(page * 1000, (page + 1) * 1000 - 1)
            .execute()
            .data
            or []
        )
        if not chunk:
            break
        rows.extend(chunk)
        if len(chunk) < 1000:
            break
        page += 1

    counts: dict[str, int] = {}
    for r in rows:
        counts[r["motion_polarity"] or "null"] = counts.get(r["motion_polarity"] or "null", 0) + 1

    # Reject motions should be present (~100+ in term 10).
    assert counts.get("reject", 0) >= 50, f"too few reject motions: {counts}"
    # Amendments dominate.
    assert counts.get("amendment", 0) >= 500, f"too few amendments: {counts}"
    # NULL is allowed but shouldn't engulf everything.
    assert counts.get("null", 0) < len(rows) * 0.7, f"too many ambiguous: {counts}"


def test_mv_carries_polarity_and_stance() -> None:
    sb = supabase()
    res = (
        sb.table("voting_promise_link_mv")
        .select("voting_id, promise_id, motion_polarity, promise_stance")
        .limit(5)
        .execute()
    )
    assert res.data, "MV empty after migration?"
    for r in res.data:
        # promise_stance has a NOT NULL default; polarity may be NULL.
        assert r["promise_stance"] in ("pro_bill", "anti_bill")
