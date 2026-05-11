"""Contract: mp_attendance + mp_activity_summary matviews + refresh_mp_activity()."""
from __future__ import annotations

import os

import pytest

from supagraf.db import supabase

pytestmark = pytest.mark.skipif(
    os.environ.get("SUPABASE_URL") is None
    and not (__import__("pathlib").Path(__file__).resolve().parents[3] / ".env").exists(),
    reason="needs Supabase creds",
)

ATT_COLS = {"term", "mp_id", "total_votes", "attended", "pct_attended"}
ACT_COLS = {"term", "mp_id", "n_statements", "n_questions"}


def _select_one(table: str):
    from postgrest.exceptions import APIError

    try:
        return supabase().table(table).select("*").limit(1).execute().data
    except APIError as e:
        err = str(e).lower()
        if "pgrst205" in err or "schema cache" in err:
            pytest.skip(f"table {table} not exposed yet — apply migration 0079_mp_activity_attendance.sql")
        raise


def test_mp_attendance_columns():
    rows = _select_one("mp_attendance")
    assert rows, "mp_attendance returned no rows; apply migration 0079 and refresh_mp_activity()"
    assert ATT_COLS.issubset(set(rows[0].keys())), f"missing cols: {ATT_COLS - set(rows[0].keys())}"


def test_mp_activity_summary_columns():
    rows = _select_one("mp_activity_summary")
    assert rows, "mp_activity_summary returned no rows"
    assert ACT_COLS.issubset(set(rows[0].keys())), f"missing cols: {ACT_COLS - set(rows[0].keys())}"


def test_refresh_mp_activity_callable():
    from postgrest.exceptions import APIError

    try:
        r = supabase().rpc("refresh_mp_activity", {}).execute()
    except APIError as e:
        err = str(e).lower()
        if "pgrst202" in err or "refresh_mp_activity" in err:
            pytest.skip("refresh_mp_activity not in schema — apply migration 0079")
        raise
    assert r is not None
