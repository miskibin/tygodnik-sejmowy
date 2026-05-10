"""End-to-end test of supagraf.enrich.print_stance.

Real DB writes for prints/model_runs/enrichment_failures. LLM is mocked at
the httpx layer; extract_pdf is mocked too — paddleocr cold start adds
~30s for nothing in this test (the print_summary e2e exercises real
extraction already).

Gated `RUN_E2E=1`.

Idempotency note: re-running with the same prompt version does NOT
short-circuit today; this is documented as a known TODO for Phase D.
"""
from __future__ import annotations

import json
import os
from unittest.mock import MagicMock, patch

import pytest

from supagraf.db import supabase
from supagraf.enrich import DEFAULT_LLM_MODEL
from supagraf.enrich.llm import LLMResponseError
from supagraf.enrich.pdf import ExtractionResult
from supagraf.enrich.print_stance import JOB_NAME, classify_stance

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_E2E") != "1",
    reason="e2e against live Supabase; set RUN_E2E=1 to enable",
)

PRINT_NUMBER = "2055-A"
PDF_RELPATH = "sejm/prints/2055-A__2055-A.pdf"


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


def _canned_extraction() -> ExtractionResult:
    text = "Wnioskuje sie o przyjecie projektu ustawy o zmianie XYZ."
    return ExtractionResult(
        sha256="canned-sha",
        text=text,
        page_count=1,
        ocr_used=False,
        char_count_per_page=[len(text)],
        model_version="canned-test",
        cache_hit=False,
    )


def _reset_print_row():
    """Clear stance fields for the test print so we always start clean.

    Matches CHECK constraint: nulling all five provenance columns together
    avoids violating prints_stance_provenance.
    """
    supabase().table("prints").update({
        "stance": None,
        "stance_confidence": None,
        "stance_prompt_version": None,
        "stance_prompt_sha256": None,
        "stance_model": None,
    }).eq("number", PRINT_NUMBER).execute()


def _delete_audit_rows():
    """Remove prior model_runs/enrichment_failures for this fn so counts are
    deterministic. enrichment_failures cascades via FK on model_run_id."""
    supabase().table("model_runs").delete().eq("fn_name", JOB_NAME).execute()


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
        "stance,stance_confidence,stance_prompt_version,stance_prompt_sha256,stance_model"
    ).eq("number", PRINT_NUMBER).single().execute().data


def test_happy_path_persists_stance_and_audit():
    expected = {"stance": "FOR", "confidence": 0.88}
    with patch("supagraf.enrich.print_stance.extract_pdf",
               return_value=_canned_extraction()), \
         patch("supagraf.enrich.llm.httpx.post",
               return_value=_ollama_response(expected)) as mock_post:
        out = classify_stance(
            entity_type="print",
            entity_id=PRINT_NUMBER,
            pdf_relpath=PDF_RELPATH,
        )

    assert out.stance == "FOR"
    assert out.confidence == 0.88
    mock_post.assert_called_once()

    row = _read_print()
    assert row["stance"] == "FOR"
    # real is float; tolerate float precision (0.88 -> 0.879999...).
    assert abs(row["stance_confidence"] - 0.88) < 1e-5
    assert row["stance_prompt_version"] == "1"
    assert row["stance_prompt_sha256"] is not None
    assert row["stance_model"] == DEFAULT_LLM_MODEL

    assert _count_runs("ok") == 1
    assert _count_runs("failed") == 0
    assert _count_failures() == 0


def test_llm_5xx_records_failure_no_stance_written():
    # 500 retried 3x by tenacity in _post_chat → eventually LLMHTTPError.
    with patch("supagraf.enrich.print_stance.extract_pdf",
               return_value=_canned_extraction()), \
         patch("supagraf.enrich.llm.httpx.post",
               return_value=_ollama_error_response(500, "internal")):
        with pytest.raises(Exception):
            classify_stance(
                entity_type="print",
                entity_id=PRINT_NUMBER,
                pdf_relpath=PDF_RELPATH,
            )

    row = _read_print()
    assert row["stance"] is None
    assert _count_runs("failed") == 1
    assert _count_failures() == 1
    failures = supabase().table("enrichment_failures").select(
        "error"
    ).eq("fn_name", JOB_NAME).execute().data or []
    assert any("LLMHTTPError" in f["error"] for f in failures)


def test_llm_invalid_stance_value_records_failure():
    # 'INVALID' violates the Literal type → ValidationError → LLMResponseError.
    bad_content = {"stance": "INVALID", "confidence": 0.5}
    with patch("supagraf.enrich.print_stance.extract_pdf",
               return_value=_canned_extraction()), \
         patch("supagraf.enrich.llm.httpx.post",
               return_value=_ollama_response(bad_content)):
        with pytest.raises(LLMResponseError):
            classify_stance(
                entity_type="print",
                entity_id=PRINT_NUMBER,
                pdf_relpath=PDF_RELPATH,
            )

    row = _read_print()
    assert row["stance"] is None
    assert _count_runs("failed") == 1
    failures = supabase().table("enrichment_failures").select(
        "error"
    ).eq("fn_name", JOB_NAME).execute().data or []
    assert any("PrintStanceOutput" in f["error"] for f in failures)


def test_llm_confidence_out_of_range_records_failure():
    # confidence=1.5 violates Field(le=1.0) — Pydantic raises before DB write.
    bad_content = {"stance": "FOR", "confidence": 1.5}
    with patch("supagraf.enrich.print_stance.extract_pdf",
               return_value=_canned_extraction()), \
         patch("supagraf.enrich.llm.httpx.post",
               return_value=_ollama_response(bad_content)):
        with pytest.raises(LLMResponseError):
            classify_stance(
                entity_type="print",
                entity_id=PRINT_NUMBER,
                pdf_relpath=PDF_RELPATH,
            )

    row = _read_print()
    assert row["stance"] is None
    assert _count_runs("failed") == 1


def test_idempotency_rerun_writes_again():
    # Phase D may add a skip; today both runs write. Asserts current contract
    # so any future skip-logic regression in either direction is caught.
    expected = {"stance": "AGAINST", "confidence": 0.6}
    with patch("supagraf.enrich.print_stance.extract_pdf",
               return_value=_canned_extraction()), \
         patch("supagraf.enrich.llm.httpx.post",
               return_value=_ollama_response(expected)):
        classify_stance(
            entity_type="print",
            entity_id=PRINT_NUMBER,
            pdf_relpath=PDF_RELPATH,
        )
        classify_stance(
            entity_type="print",
            entity_id=PRINT_NUMBER,
            pdf_relpath=PDF_RELPATH,
        )

    assert _count_runs("ok") == 2
    row = _read_print()
    assert row["stance"] == "AGAINST"
