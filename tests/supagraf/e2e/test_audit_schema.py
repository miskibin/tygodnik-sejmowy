"""End-to-end tests for enrichment audit schema (model_runs + enrichment_failures).

Validates DDL invariants from migration 0013: status enum CHECK, ended_at-after-
started_at CHECK, ended_at-required-when-finished CHECK, FK ON DELETE CASCADE,
and the model_run_finish helper (atomic finish + double-finish rejection).

Skipped by default. Enable with `RUN_E2E=1`.
"""
from __future__ import annotations

import json
import os

import pytest
from postgrest.exceptions import APIError

from supagraf.db import supabase

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_E2E") != "1",
    reason="e2e against live Supabase; set RUN_E2E=1 to enable",
)

# Sentinel fn_name keeps test rows trivially identifiable for cleanup.
TEST_FN = "__test_b4_audit__"
TEST_MODEL = "__test_model__"


def _err_text(exc: APIError) -> str:
    """Stringify APIError payload for SQLSTATE/message matching."""
    payload = exc.json() if hasattr(exc, "json") else None
    return json.dumps(payload).lower() if payload else str(exc).lower()


@pytest.fixture
def cleanup():
    """Wipe test rows before and after — failures cascade automatically."""

    def _del():
        # Cascade FK removes enrichment_failures rows tied to these runs.
        supabase().table("model_runs").delete().eq("fn_name", TEST_FN).execute()

    _del()
    yield
    _del()


def _insert_running_run() -> int:
    row = (
        supabase()
        .table("model_runs")
        .insert({"fn_name": TEST_FN, "model": TEST_MODEL})
        .execute()
        .data[0]
    )
    return row["id"]


def test_insert_running_defaults(cleanup):
    rid = _insert_running_run()
    row = (
        supabase()
        .table("model_runs")
        .select("id,status,ended_at,started_at")
        .eq("id", rid)
        .execute()
        .data[0]
    )
    assert row["status"] == "running"
    assert row["ended_at"] is None
    assert row["started_at"] is not None


def test_status_check_rejects_invalid(cleanup):
    with pytest.raises(APIError) as excinfo:
        supabase().table("model_runs").insert(
            {"fn_name": TEST_FN, "model": TEST_MODEL, "status": "garbage"}
        ).execute()
    msg = _err_text(excinfo.value)
    assert "23514" in msg or "violates check" in msg or "check constraint" in msg


def test_finish_ok_via_fn(cleanup):
    rid = _insert_running_run()
    supabase().rpc("model_run_finish", {"p_run_id": rid, "p_status": "ok"}).execute()
    row = (
        supabase()
        .table("model_runs")
        .select("status,ended_at")
        .eq("id", rid)
        .execute()
        .data[0]
    )
    assert row["status"] == "ok"
    assert row["ended_at"] is not None


def test_finish_failed_via_fn(cleanup):
    rid = _insert_running_run()
    supabase().rpc(
        "model_run_finish", {"p_run_id": rid, "p_status": "failed"}
    ).execute()
    row = (
        supabase()
        .table("model_runs")
        .select("status,ended_at")
        .eq("id", rid)
        .execute()
        .data[0]
    )
    assert row["status"] == "failed"
    assert row["ended_at"] is not None


def test_finish_invalid_status_raises(cleanup):
    rid = _insert_running_run()
    with pytest.raises(APIError) as excinfo:
        supabase().rpc(
            "model_run_finish", {"p_run_id": rid, "p_status": "cancelled"}
        ).execute()
    msg = _err_text(excinfo.value)
    assert "invalid finish status" in msg


def test_double_finish_raises(cleanup):
    rid = _insert_running_run()
    supabase().rpc("model_run_finish", {"p_run_id": rid, "p_status": "ok"}).execute()
    with pytest.raises(APIError) as excinfo:
        supabase().rpc(
            "model_run_finish", {"p_run_id": rid, "p_status": "ok"}
        ).execute()
    msg = _err_text(excinfo.value)
    assert "not in running state" in msg


def test_ended_before_started_rejected(cleanup):
    rid = _insert_running_run()
    # ended_at strictly less than started_at must trip the temporal CHECK.
    with pytest.raises(APIError) as excinfo:
        supabase().table("model_runs").update(
            {"ended_at": "1970-01-01T00:00:00+00:00", "status": "ok"}
        ).eq("id", rid).execute()
    msg = _err_text(excinfo.value)
    assert "23514" in msg or "violates check" in msg or "check constraint" in msg


def test_finished_status_requires_ended_at(cleanup):
    # Direct insert: status='ok' but ended_at NULL must fail second CHECK.
    with pytest.raises(APIError) as excinfo:
        supabase().table("model_runs").insert(
            {"fn_name": TEST_FN, "model": TEST_MODEL, "status": "ok"}
        ).execute()
    msg = _err_text(excinfo.value)
    assert "23514" in msg or "violates check" in msg or "check constraint" in msg


def test_failure_cascade_on_run_delete(cleanup):
    rid = _insert_running_run()
    supabase().table("enrichment_failures").insert(
        [
            {
                "model_run_id": rid,
                "entity_type": "print",
                "entity_id": "p1",
                "fn_name": TEST_FN,
                "error": "boom1",
            },
            {
                "model_run_id": rid,
                "entity_type": "print",
                "entity_id": "p2",
                "fn_name": TEST_FN,
                "error": "boom2",
            },
        ]
    ).execute()
    before = (
        supabase()
        .table("enrichment_failures")
        .select("id")
        .eq("model_run_id", rid)
        .execute()
        .data
    )
    assert len(before) == 2

    supabase().table("model_runs").delete().eq("id", rid).execute()

    after = (
        supabase()
        .table("enrichment_failures")
        .select("id")
        .eq("model_run_id", rid)
        .execute()
        .data
    )
    assert after == []


def test_failure_fk_enforced(cleanup):
    # Bogus model_run_id must trip the FK (SQLSTATE 23503).
    with pytest.raises(APIError) as excinfo:
        supabase().table("enrichment_failures").insert(
            {
                "model_run_id": 999_999_999,
                "entity_type": "print",
                "entity_id": "p1",
                "fn_name": TEST_FN,
                "error": "boom",
            }
        ).execute()
    msg = _err_text(excinfo.value)
    assert "23503" in msg or "foreign key" in msg or "violates foreign" in msg
