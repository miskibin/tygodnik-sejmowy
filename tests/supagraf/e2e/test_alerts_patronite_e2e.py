"""E2e: alerts/patronite/brief_deliveries against live Supabase. RUN_E2E=1."""
from __future__ import annotations

import os
import uuid

import pytest

from supagraf.db import supabase

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_E2E") != "1",
    reason="e2e against live Supabase; set RUN_E2E=1 to enable",
)


def _hash(suffix: str) -> str:
    return f"e2e_test_{suffix}_{uuid.uuid4().hex[:8]}"


def test_alert_subscription_email_only_succeeds():
    cli = supabase()
    h = _hash("email_only")
    try:
        r = cli.table("alert_subscriptions").insert({
            "email_hash": h,
            "target_type": "phrase",
            "target_value": "test_phrase",
            "channel": "email",
        }).execute()
        assert r.data, "insert returned no row"
    finally:
        cli.table("alert_subscriptions").delete().eq("email_hash", h).execute()


def test_alert_subscription_both_null_fails():
    cli = supabase()
    with pytest.raises(Exception) as exc:
        cli.table("alert_subscriptions").insert({
            "user_id": None,
            "email_hash": None,
            "target_type": "phrase",
            "target_value": "test",
            "channel": "email",
        }).execute()
    assert "23514" in str(exc.value) or "check" in str(exc.value).lower() or "violates" in str(exc.value).lower()


def test_alert_subscription_unique_via_index():
    cli = supabase()
    h = _hash("unique")
    payload = {
        "email_hash": h,
        "target_type": "mp",
        "target_value": "ABC123",
        "channel": "email",
    }
    try:
        cli.table("alert_subscriptions").insert(payload).execute()
        with pytest.raises(Exception) as exc:
            cli.table("alert_subscriptions").insert(payload).execute()
        assert "23505" in str(exc.value) or "duplicate" in str(exc.value).lower() or "unique" in str(exc.value).lower()
    finally:
        cli.table("alert_subscriptions").delete().eq("email_hash", h).execute()


def test_patrons_monthly_upsert_updates_row():
    cli = supabase()
    month = "2099-12-01"  # sentinel future month; clean below
    try:
        cli.table("patrons_monthly").upsert({
            "month": month,
            "n_patrons": 10,
            "total_zl": 100.00,
            "source": "e2e_test",
        }, on_conflict="month").execute()

        cli.table("patrons_monthly").upsert({
            "month": month,
            "n_patrons": 20,
            "total_zl": 250.00,
            "source": "e2e_test",
        }, on_conflict="month").execute()

        rows = cli.table("patrons_monthly").select("*").eq("month", month).execute().data
        assert len(rows) == 1
        assert rows[0]["n_patrons"] == 20
        assert float(rows[0]["total_zl"]) == 250.00
    finally:
        cli.table("patrons_monthly").delete().eq("month", month).execute()


def test_alert_dispatch_cascade_on_subscription_delete():
    cli = supabase()
    h = _hash("cascade")
    sub = cli.table("alert_subscriptions").insert({
        "email_hash": h,
        "target_type": "phrase",
        "target_value": "cascade_test",
        "channel": "email",
    }).execute().data[0]
    sub_id = sub["id"]
    try:
        cli.table("alert_dispatches").insert({
            "subscription_id": sub_id,
            "event_type": "test_event",
            "payload": {"x": 1},
        }).execute()

        before = cli.table("alert_dispatches").select("id").eq("subscription_id", sub_id).execute().data
        assert len(before) == 1, "dispatch row not inserted"

        cli.table("alert_subscriptions").delete().eq("id", sub_id).execute()

        after = cli.table("alert_dispatches").select("id").eq("subscription_id", sub_id).execute().data
        assert len(after) == 0, "dispatch row not cascaded"
    except Exception:
        # cleanup if we left state behind
        cli.table("alert_subscriptions").delete().eq("id", sub_id).execute()
        raise


def test_brief_deliveries_email_only_succeeds():
    cli = supabase()
    h = _hash("brief")
    try:
        r = cli.table("brief_deliveries").insert({
            "email_hash": h,
            "issue_no": 1,
            "channel": "email",
            "status": "queued",
        }).execute()
        assert r.data
    finally:
        cli.table("brief_deliveries").delete().eq("email_hash", h).execute()


def test_brief_deliveries_both_null_fails():
    cli = supabase()
    with pytest.raises(Exception) as exc:
        cli.table("brief_deliveries").insert({
            "user_id": None,
            "email_hash": None,
            "issue_no": 1,
            "channel": "email",
        }).execute()
    assert "23514" in str(exc.value) or "check" in str(exc.value).lower() or "violates" in str(exc.value).lower()
