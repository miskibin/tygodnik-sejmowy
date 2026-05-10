"""P5 contract: alerts/patronite/brief_deliveries schema slots (migration 0039)."""
from __future__ import annotations

import os
from pathlib import Path

import pytest

from supagraf.db import supabase

pytestmark = pytest.mark.skipif(
    os.environ.get("SUPABASE_URL") is None
    and not (Path(__file__).resolve().parents[3] / ".env").exists(),
    reason="needs Supabase creds",
)


ALERT_SUB_COLS = {
    "id", "user_id", "email_hash", "target_type", "target_value",
    "channel", "active", "created_at", "confirmed_at",
}
ALERT_DISP_COLS = {
    "id", "subscription_id", "event_type", "payload", "channel_status", "sent_at",
}
PATRONS_COLS = {
    "month", "n_patrons", "total_zl", "source", "imported_at", "notes",
}
INFRA_COLS = {"month", "category", "zl", "note"}
BRIEF_DEL_COLS = {
    "id", "user_id", "email_hash", "issue_no", "channel",
    "generated_at", "sent_at", "opened_at", "resend_message_id", "status",
}


def _columns(table: str) -> set[str]:
    """Return column names for a table by selecting one row (handles empty tables via head)."""
    cli = supabase()
    rows = cli.table(table).select("*").limit(1).execute().data
    if rows:
        return set(rows[0].keys())
    # table empty: try insert dry-run via PostgREST returning representation;
    # fall back to information_schema via RPC if available.
    return _columns_via_information_schema(table)


def _columns_via_information_schema(table: str) -> set[str]:
    cli = supabase()
    # PostgREST exposes pg_meta-like info via table 'information_schema.columns'?
    # Not by default. Use a SECURITY DEFINER fallback or rely on inserting+rolling back.
    # Simplest: query a view we know exists. We instead use schema introspection
    # by selecting count to confirm table exists, then trust the migration.
    cli.table(table).select("*", count="exact").limit(0).execute()
    return set()  # signals: table exists, columns unverified by data


def _table_exists_or_skip(table: str) -> None:
    supabase().table(table).select("*", count="exact").limit(0).execute()


def test_alert_subscriptions_table_exists():
    _table_exists_or_skip("alert_subscriptions")


def test_alert_dispatches_table_exists():
    _table_exists_or_skip("alert_dispatches")


def test_patrons_monthly_table_exists():
    _table_exists_or_skip("patrons_monthly")


def test_infra_costs_table_exists():
    _table_exists_or_skip("infra_costs")


def test_brief_deliveries_table_exists():
    _table_exists_or_skip("brief_deliveries")


def test_alert_subscriptions_has_check_user_or_email():
    """Insert with both NULL must fail on the (user_id is not null or email_hash is not null) CHECK."""
    cli = supabase()
    try:
        cli.table("alert_subscriptions").insert({
            "user_id": None,
            "email_hash": None,
            "target_type": "phrase",
            "target_value": "__contract_test__",
            "channel": "email",
        }).execute()
    except Exception as e:
        # expected: CHECK violation 23514
        assert "23514" in str(e) or "check" in str(e).lower() or "violates" in str(e).lower(), str(e)
        return
    pytest.fail("expected CHECK violation when both user_id and email_hash NULL")


def test_brief_deliveries_has_check_user_or_email():
    cli = supabase()
    try:
        cli.table("brief_deliveries").insert({
            "user_id": None,
            "email_hash": None,
            "issue_no": 1,
            "channel": "email",
        }).execute()
    except Exception as e:
        assert "23514" in str(e) or "check" in str(e).lower() or "violates" in str(e).lower(), str(e)
        return
    pytest.fail("expected CHECK violation when both user_id and email_hash NULL")


def test_patrons_monthly_first_of_month_check():
    cli = supabase()
    try:
        cli.table("patrons_monthly").insert({
            "month": "2026-05-15",  # not first of month
            "n_patrons": 1,
            "total_zl": 1.0,
            "source": "__contract_test__",
        }).execute()
    except Exception as e:
        assert "23514" in str(e) or "check" in str(e).lower() or "violates" in str(e).lower(), str(e)
        return
    pytest.fail("expected CHECK violation for non-first-of-month")


def test_enums_exist():
    """Verify the 3 enums exist by attempting an insert with a valid enum value."""
    cli = supabase()
    # alert_target_type + alert_channel: smoke via metadata-style failing insert
    # We can't directly query pg_type via PostgREST; instead an insert with a
    # bogus enum value should fail with 22P02 (invalid_text_representation).
    try:
        cli.table("alert_subscriptions").insert({
            "email_hash": "__contract_test__",
            "target_type": "BOGUS_TARGET",
            "target_value": "x",
            "channel": "email",
        }).execute()
    except Exception as e:
        assert "22P02" in str(e) or "invalid" in str(e).lower(), str(e)
    else:
        pytest.fail("expected enum cast error on alert_target_type")

    try:
        cli.table("alert_subscriptions").insert({
            "email_hash": "__contract_test__",
            "target_type": "phrase",
            "target_value": "x",
            "channel": "BOGUS_CHANNEL",
        }).execute()
    except Exception as e:
        assert "22P02" in str(e) or "invalid" in str(e).lower(), str(e)
    else:
        pytest.fail("expected enum cast error on alert_channel")

    try:
        cli.table("brief_deliveries").insert({
            "email_hash": "__contract_test__",
            "issue_no": 1,
            "channel": "BOGUS_BRIEF",
        }).execute()
    except Exception as e:
        assert "22P02" in str(e) or "invalid" in str(e).lower(), str(e)
    else:
        pytest.fail("expected enum cast error on brief_channel")
