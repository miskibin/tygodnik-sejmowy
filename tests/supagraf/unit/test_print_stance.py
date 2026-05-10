"""Unit tests for supagraf.enrich.print_stance.

All side-effects mocked: extract_pdf, call_structured, supabase update,
audit decorator's DB seams. Verifies wire-up between B1/B2/B5 + happy/
adversarial paths without touching network or disk.
"""
from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from pydantic import ValidationError as PVErr

from supagraf.enrich import DEFAULT_LLM_MODEL
from supagraf.enrich.llm import LLMCall, LLMResponseError, PromptRef
from supagraf.enrich.pdf import ExtractionResult
from supagraf.enrich.print_stance import PrintStanceOutput, classify_stance


def _fake_extraction(text: str = "Tekst pisma sejmowego.") -> ExtractionResult:
    return ExtractionResult(
        sha256="deadbeef",
        text=text,
        page_count=1,
        ocr_used=False,
        char_count_per_page=[len(text)],
        model_version="pypdf-test",
        cache_hit=False,
    )


def _fake_call(parsed: PrintStanceOutput, *, version: int = 1, sha: str = "abc123") -> LLMCall:
    return LLMCall(
        model=DEFAULT_LLM_MODEL,
        prompt=PromptRef(name="print_stance", version=version,
                         path=Path("/tmp/v1.md"), sha256=sha, body="..."),
        parsed=parsed,
        raw_response="{}",
        model_run_id=None,
    )


@pytest.fixture
def mock_audit():
    """Patch the decorator's DB seams (B5 internals) so no Supabase calls fire."""
    with patch("supagraf.enrich.audit._insert_run") as ins, \
         patch("supagraf.enrich.audit._record_failure") as rec, \
         patch("supagraf.enrich.audit._finish_run") as fin:
        ins.return_value = 7
        yield ins, rec, fin


@pytest.fixture
def mock_pipeline():
    """Patch extract_pdf, call_structured and the supabase() persistence call."""
    with patch("supagraf.enrich.print_stance.extract_pdf") as extr, \
         patch("supagraf.enrich.print_stance.call_structured") as llm, \
         patch("supagraf.enrich.print_stance.supabase") as sb, \
         patch("supagraf.enrich.print_stance.fixtures_root") as froot:
        froot.return_value = Path("/tmp/fixtures")
        sb.return_value.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()
        yield extr, llm, sb


# ---- happy path -----------------------------------------------------------

def test_happy_path_writes_and_returns_parsed(mock_audit, mock_pipeline):
    extr, llm, sb = mock_pipeline
    extr.return_value = _fake_extraction()
    parsed = PrintStanceOutput(stance="FOR", confidence=0.92)
    llm.return_value = _fake_call(parsed, version=1, sha="abc123")

    out = classify_stance(
        entity_type="print",
        entity_id="2055-A",
        pdf_relpath="sejm/prints/2055-A__2055-A.pdf",
    )

    assert out is parsed
    extr.assert_called_once()
    llm.assert_called_once()
    update_call = sb.return_value.table.return_value.update
    update_call.assert_called_once()
    payload = update_call.call_args.args[0]
    assert payload["stance"] == "FOR"
    assert payload["stance_confidence"] == 0.92
    assert payload["stance_prompt_version"] == "1"
    assert payload["stance_prompt_sha256"] == "abc123"
    assert payload["stance_model"] == DEFAULT_LLM_MODEL


def test_happy_path_audit_decorator_finishes_ok(mock_audit, mock_pipeline):
    ins, rec, fin = mock_audit
    extr, llm, _ = mock_pipeline
    extr.return_value = _fake_extraction()
    llm.return_value = _fake_call(PrintStanceOutput(stance="NEUTRAL", confidence=0.5))

    classify_stance(
        entity_type="print",
        entity_id="2055-A",
        pdf_relpath="sejm/prints/2055-A__2055-A.pdf",
    )

    ins.assert_called_once()
    rec.assert_not_called()
    fin.assert_called_once()
    assert fin.call_args.args[1] == "ok"


# ---- LLM failure path -----------------------------------------------------

def test_llm_response_error_records_failure_and_reraises(mock_audit, mock_pipeline):
    ins, rec, fin = mock_audit
    extr, llm, sb = mock_pipeline
    extr.return_value = _fake_extraction()
    llm.side_effect = LLMResponseError("schema mismatch")

    with pytest.raises(LLMResponseError, match="schema mismatch"):
        classify_stance(
            entity_type="print",
            entity_id="2055-A",
            pdf_relpath="sejm/prints/2055-A__2055-A.pdf",
        )

    rec.assert_called_once()
    err_text = rec.call_args.args[4]
    assert "LLMResponseError" in err_text
    fin.assert_called_once()
    assert fin.call_args.args[1] == "failed"
    sb.return_value.table.return_value.update.assert_not_called()


# ---- empty text -----------------------------------------------------------

def test_empty_text_raises_no_llm_call(mock_audit, mock_pipeline):
    _, rec, fin = mock_audit
    extr, llm, sb = mock_pipeline
    extr.return_value = _fake_extraction(text="   \n\t  ")

    with pytest.raises(ValueError, match="empty extracted text"):
        classify_stance(
            entity_type="print",
            entity_id="2055-A",
            pdf_relpath="sejm/prints/2055-A__2055-A.pdf",
        )

    llm.assert_not_called()
    sb.return_value.table.return_value.update.assert_not_called()
    rec.assert_called_once()
    fin.assert_called_once()
    assert fin.call_args.args[1] == "failed"


# ---- decorator validation -------------------------------------------------

def test_wrong_entity_type_raises_before_db(mock_audit, mock_pipeline):
    ins, rec, fin = mock_audit
    extr, llm, _ = mock_pipeline

    with pytest.raises(ValueError, match="unknown entity_type"):
        classify_stance(
            entity_type="bogus",
            entity_id="2055-A",
            pdf_relpath="sejm/prints/2055-A__2055-A.pdf",
        )

    # Decorator validates entity_type before _insert_run; nothing else fires.
    ins.assert_not_called()
    rec.assert_not_called()
    fin.assert_not_called()
    extr.assert_not_called()
    llm.assert_not_called()


# ---- pydantic schema strictness -------------------------------------------

def test_output_model_forbids_extra_fields():
    # Belt-and-braces: schema mismatch (extra field) is fatal even bypassing
    # call_structured.
    with pytest.raises(PVErr):
        PrintStanceOutput.model_validate({
            "stance": "FOR", "confidence": 0.5, "extra": "no"
        })


def test_output_model_rejects_invalid_stance():
    # Belt-and-braces for the SQL CHECK: Pydantic rejects non-enum values
    # so we never even attempt to write a bad row.
    with pytest.raises(PVErr):
        PrintStanceOutput.model_validate({"stance": "INVALID", "confidence": 0.5})


def test_output_model_rejects_confidence_out_of_range():
    # Confidence > 1.0 violates Field(ge=0,le=1) — same envelope as SQL CHECK.
    with pytest.raises(PVErr):
        PrintStanceOutput.model_validate({"stance": "FOR", "confidence": 1.5})
    with pytest.raises(PVErr):
        PrintStanceOutput.model_validate({"stance": "FOR", "confidence": -0.1})
