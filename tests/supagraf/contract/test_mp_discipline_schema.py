"""F3 contract: mp_vote_discipline view, mp_discipline_summary matview, refresh_mp_discipline()."""
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


VIEW_COLS = {"voting_id", "mp_id", "term", "club_id_at_vote",
             "club_modal_choice", "mp_choice", "aligned"}
MATVIEW_COLS = {"term", "mp_id", "n_votes", "n_aligned", "pct_aligned"}


def _select_one(table: str):
    return supabase().table(table).select("*").limit(1).execute().data


def test_mp_vote_discipline_columns():
    rows = _select_one("mp_vote_discipline")
    assert rows, "view returned no rows; can't verify columns"
    assert VIEW_COLS.issubset(set(rows[0].keys())), \
        f"missing cols: {VIEW_COLS - set(rows[0].keys())}"


def test_mp_discipline_summary_columns():
    rows = _select_one("mp_discipline_summary")
    assert rows, "matview returned no rows"
    assert MATVIEW_COLS.issubset(set(rows[0].keys())), \
        f"missing cols: {MATVIEW_COLS - set(rows[0].keys())}"


def test_refresh_mp_discipline_callable():
    r = supabase().rpc("refresh_mp_discipline", {}).execute()
    assert r is not None
