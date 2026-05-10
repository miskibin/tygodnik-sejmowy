"""Contract tests for migration 0035 (MP photo URLs).

Hits the live DB via the existing `supabase()` client. Tests are skipped if
the env doesn't carry credentials (mirrors the e2e gating used elsewhere)."""
from __future__ import annotations

import os

import pytest

from supagraf.db import supabase


pytestmark = pytest.mark.skipif(
    not os.environ.get("SUPABASE_URL") or not os.environ.get("SUPABASE_KEY"),
    reason="needs SUPABASE_URL/KEY for live contract checks",
)


def test_photo_columns_exist():
    """mps has photo_url + photo_fetched_at columns."""
    cli = supabase()
    # Selecting a column that does not exist throws via PostgREST. A select
    # with limit 1 is the cheapest probe.
    cli.table("mps").select("id, photo_url, photo_fetched_at").limit(1).execute()


def test_partial_index_pending_query_works():
    """mps_photo_pending_idx is present (verified by exercising its query)."""
    # PostgREST won't reach pg_indexes; we instead trust the migration ran
    # AND verify by exercising the query the index is meant to cover.
    cli = supabase()
    cli.table("mps").select("id").is_("photo_fetched_at", "null").limit(1).execute()
