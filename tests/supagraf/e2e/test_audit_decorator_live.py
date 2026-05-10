"""E2E test for @with_model_run decorator against live Supabase.

Verifies decorator end-to-end against the real model_runs +
enrichment_failures schema (B4): row insert, finish('ok'), finish('failed')
+ enrichment_failures row, FK cascade cleanup.

Skipped by default. Enable with `RUN_E2E=1`.
"""
from __future__ import annotations

import os

import pytest

from supagraf.db import supabase
from supagraf.enrich.audit import with_model_run

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_E2E") != "1",
    reason="e2e against live Supabase; set RUN_E2E=1 to enable",
)

# Sentinel prefix keeps cleanup trivially scoped.
TEST_FN_OK = "__test_b5_ok__"
TEST_FN_FAIL = "__test_b5_failed__"
TEST_MODEL = "__test_model__"


@pytest.fixture(autouse=True)
def _cleanup():
    """Pre/post cleanup. enrichment_failures cascades via FK on model_runs delete."""
    db = supabase()
    db.table("model_runs").delete().like("fn_name", "__test_b5_%").execute()
    yield
    db.table("model_runs").delete().like("fn_name", "__test_b5_%").execute()


def test_happy_path_writes_ok_row():
    @with_model_run(fn_name=TEST_FN_OK, model=TEST_MODEL)
    def ok_fn(*, entity_type, entity_id, model_run_id=None):
        return ("ok", model_run_id)

    out = ok_fn(entity_type="print", entity_id="__b5_e2e_ok__")
    assert out[0] == "ok"
    assert isinstance(out[1], int) and out[1] > 0

    rows = (
        supabase()
        .table("model_runs")
        .select("id,status,started_at,ended_at,fn_name")
        .eq("fn_name", TEST_FN_OK)
        .execute()
        .data
    )
    assert len(rows) == 1
    r = rows[0]
    assert r["status"] == "ok"
    assert r["ended_at"] is not None
    assert r["id"] == out[1]


def test_failure_path_writes_failed_row_and_failure_record():
    @with_model_run(fn_name=TEST_FN_FAIL, model=TEST_MODEL)
    def bad_fn(*, entity_type, entity_id, model_run_id=None):
        raise RuntimeError("intentional e2e failure")

    with pytest.raises(RuntimeError, match="intentional e2e failure"):
        bad_fn(entity_type="act", entity_id="__b5_e2e_fail__")

    rows = (
        supabase()
        .table("model_runs")
        .select("id,status,ended_at")
        .eq("fn_name", TEST_FN_FAIL)
        .execute()
        .data
    )
    assert len(rows) == 1
    r = rows[0]
    assert r["status"] == "failed"
    assert r["ended_at"] is not None

    failures = (
        supabase()
        .table("enrichment_failures")
        .select("model_run_id,entity_type,entity_id,fn_name,error")
        .eq("model_run_id", r["id"])
        .execute()
        .data
    )
    assert len(failures) == 1
    f = failures[0]
    assert f["entity_type"] == "act"
    assert f["entity_id"] == "__b5_e2e_fail__"
    assert f["fn_name"] == TEST_FN_FAIL
    assert "RuntimeError" in f["error"]
