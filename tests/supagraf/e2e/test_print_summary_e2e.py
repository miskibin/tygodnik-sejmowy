"""End-to-end test of supagraf.enrich.print_summary.

Real PDF extraction (B1 cache) + real DB writes for prints/model_runs/
enrichment_failures. LLM is mocked at the httpx layer to keep the test
hermetic from a running Ollama daemon.

Gated `RUN_E2E=1`. Set `RUN_LLM_LIVE=1` to additionally hit a real Ollama
(currently a no-op opt-out — the mock always wins to keep CI green).

Idempotency note: re-running with the same prompt version does NOT
short-circuit today; this is documented as a known TODO for Phase C.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from supagraf.db import supabase
from supagraf.enrich import DEFAULT_LLM_MODEL
from supagraf.enrich.llm import LLMResponseError
from supagraf.enrich.print_summary import JOB_NAME, PROMPT_NAME, summarize_print

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_E2E") != "1",
    reason="e2e against live Supabase; set RUN_E2E=1 to enable",
)

PRINT_NUMBER = "2055-A"
PDF_RELPATH = "sejm/prints/2055-A__2055-A.pdf"
REPO_ROOT = Path(__file__).resolve().parents[3]


def _ollama_response(content: dict) -> MagicMock:
    """Build a mock httpx.Response that mimics a successful Ollama /api/chat."""
    resp = MagicMock()
    resp.status_code = 200
    resp.json.return_value = {"message": {"content": json.dumps(content)}}
    resp.text = ""
    return resp


def _ollama_error_response(status: int = 500, body: str = "boom") -> MagicMock:
    resp = MagicMock()
    resp.status_code = status
    resp.json.side_effect = ValueError("not json")
    resp.text = body
    return resp


def _reset_print_row():
    """Clear summary fields for the test print so we always start clean.

    NOTE: matches CHECK constraint by nulling all five provenance columns
    together; setting summary alone would violate prints_summary_provenance.
    """
    supabase().table("prints").update({
        "summary": None,
        "short_title": None,
        "summary_prompt_version": None,
        "summary_prompt_sha256": None,
        "summary_model": None,
    }).eq("number", PRINT_NUMBER).execute()


def _delete_audit_rows():
    """Remove any prior model_runs/enrichment_failures for this entity to
    keep counts deterministic. enrichment_failures cascades via FK on
    model_run_id, so deleting model_runs is sufficient."""
    supabase().table("model_runs").delete().eq(
        "fn_name", JOB_NAME
    ).execute()


@pytest.fixture(autouse=True)
def _isolate_state():
    _reset_print_row()
    _delete_audit_rows()
    yield
    _reset_print_row()
    _delete_audit_rows()


def _count_runs(status: str | None = None) -> int:
    q = supabase().table("model_runs").select("id", count="exact").eq("fn_name", JOB_NAME)
    if status is not None:
        q = q.eq("status", status)
    return q.execute().count or 0


def _count_failures() -> int:
    return supabase().table("enrichment_failures").select(
        "id", count="exact"
    ).eq("fn_name", JOB_NAME).execute().count or 0


def _read_print() -> dict:
    return supabase().table("prints").select(
        "summary,short_title,summary_prompt_version,summary_prompt_sha256,summary_model"
    ).eq("number", PRINT_NUMBER).single().execute().data


def test_happy_path_persists_summary_and_audit():
    expected = {"summary": "Streszczenie testowe pisma sejmowego.",
                "short_title": "Test pismo"}
    with patch("supagraf.enrich.llm.httpx.post",
               return_value=_ollama_response(expected)) as mock_post:
        out = summarize_print(
            entity_type="print",
            entity_id=PRINT_NUMBER,
            pdf_relpath=PDF_RELPATH,
        )

    assert out.summary == expected["summary"]
    assert out.short_title == expected["short_title"]
    mock_post.assert_called_once()  # single happy LLM call

    row = _read_print()
    assert row["summary"] == expected["summary"]
    assert row["short_title"] == expected["short_title"]
    assert row["summary_prompt_version"] == "1"
    assert row["summary_prompt_sha256"] is not None
    assert row["summary_model"] == DEFAULT_LLM_MODEL

    assert _count_runs("ok") == 1
    assert _count_runs("failed") == 0
    assert _count_failures() == 0


def test_llm_5xx_records_failure_no_summary_written():
    # 500 is retried 3x by tenacity in _post_chat → eventually LLMHTTPError.
    with patch("supagraf.enrich.llm.httpx.post",
               return_value=_ollama_error_response(500, "internal")):
        with pytest.raises(Exception):
            summarize_print(
                entity_type="print",
                entity_id=PRINT_NUMBER,
                pdf_relpath=PDF_RELPATH,
            )

    row = _read_print()
    assert row["summary"] is None
    assert _count_runs("failed") == 1
    assert _count_failures() == 1
    failures = supabase().table("enrichment_failures").select(
        "error"
    ).eq("fn_name", JOB_NAME).execute().data or []
    assert any("LLMHTTPError" in f["error"] for f in failures)


def test_llm_schema_mismatch_records_failure():
    # Response missing required field 'short_title' → ValidationError →
    # LLMResponseError (NOT retried — fails immediately).
    bad_content = {"summary": "ok", "unexpected_field": "x"}
    with patch("supagraf.enrich.llm.httpx.post",
               return_value=_ollama_response(bad_content)):
        with pytest.raises(LLMResponseError):
            summarize_print(
                entity_type="print",
                entity_id=PRINT_NUMBER,
                pdf_relpath=PDF_RELPATH,
            )

    row = _read_print()
    assert row["summary"] is None
    assert _count_runs("failed") == 1
    failures = supabase().table("enrichment_failures").select(
        "error"
    ).eq("fn_name", JOB_NAME).execute().data or []
    assert any("PrintSummaryOutput" in f["error"] for f in failures)
