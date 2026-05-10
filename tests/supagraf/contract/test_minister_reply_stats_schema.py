"""F3 contract: minister_reply_stats matview + refresh_minister_reply_stats()."""
from __future__ import annotations

import os

import pytest

from supagraf.db import supabase

pytestmark = pytest.mark.skipif(
    os.environ.get("SUPABASE_URL") is None and not (
        __import__("pathlib").Path(__file__).resolve().parents[3] / ".env"
    ).exists(),
    reason="needs Supabase creds",
)


MATVIEW_COLS = {
    "term", "recipient_name", "n_total", "n_overdue_30d", "n_unanswered",
    "median_days", "p90_days", "max_days", "mean_days",
}


def test_minister_reply_stats_columns():
    rows = supabase().table("minister_reply_stats").select("*").limit(1).execute().data
    assert rows, "matview returned no rows"
    assert MATVIEW_COLS.issubset(set(rows[0].keys())), \
        f"missing cols: {MATVIEW_COLS - set(rows[0].keys())}"


def test_refresh_minister_reply_stats_callable():
    r = supabase().rpc("refresh_minister_reply_stats", {}).execute()
    assert r is not None
