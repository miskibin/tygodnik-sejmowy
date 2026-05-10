"""Unit tests for supagraf.enrich.print_impact.

All side-effects mocked: extract_pdf, call_structured, supabase update,
audit decorator's DB seams.
"""
from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from supagraf.enrich import DEFAULT_LLM_MODEL
from supagraf.enrich.llm import LLMCall, LLMResponseError, PromptRef
from supagraf.enrich.pdf import ExtractionResult
from supagraf.enrich.print_impact import (
    AffectedGroup,
    PrintImpactOutput,
    assess_impact,
)


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


def _fake_call(parsed: PrintImpactOutput, *, version: int = 1, sha: str = "abc123") -> LLMCall:
    return LLMCall(
        model=DEFAULT_LLM_MODEL,
        prompt=PromptRef(name="print_impact", version=version,
                         path=Path("/tmp/v1.md"), sha256=sha, body="..."),
        parsed=parsed,
        raw_response="{}",
        model_run_id=None,
    )


@pytest.fixture
def mock_audit():
    with patch("supagraf.enrich.audit._insert_run") as ins, \
         patch("supagraf.enrich.audit._record_failure") as rec, \
         patch("supagraf.enrich.audit._finish_run") as fin:
        ins.return_value = 7
        yield ins, rec, fin


@pytest.fixture
def mock_pipeline():
    with patch("supagraf.enrich.print_impact.extract_pdf") as extr, \
         patch("supagraf.enrich.print_impact.call_structured") as llm, \
         patch("supagraf.enrich.print_impact.supabase") as sb:
        sb.return_value.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()
        yield extr, llm, sb


def test_happy_path_writes_punch_groups_and_provenance(mock_audit, mock_pipeline):
    extr, llm, sb = mock_pipeline
    extr.return_value = _fake_extraction()
    parsed = PrintImpactOutput(
        impact_punch="Najemcy odlicza do 12 000 zl czynszu rocznie od PIT.",
        affected_groups=[
            AffectedGroup(tag="najemca", severity="high", est_population=None),
            AffectedGroup(tag="wlasciciel-mieszkania", severity="medium", est_population=None),
        ],
    )
    llm.return_value = _fake_call(parsed, version=1, sha="abc123")

    out = assess_impact(
        entity_type="print",
        entity_id="2055-A",
        pdf_relpath="sejm/prints/2055-A__2055-A.pdf",
    )

    assert out is parsed
    update_call = sb.return_value.table.return_value.update
    update_call.assert_called_once()
    payload = update_call.call_args.args[0]
    assert payload["impact_punch"].startswith("Najemcy")
    # Stored as list of dicts (jsonb-friendly), not as Pydantic objects.
    groups = payload["affected_groups"]
    assert isinstance(groups, list)
    assert all(isinstance(g, dict) for g in groups)
    assert groups[0] == {"tag": "najemca", "severity": "high", "est_population": None}
    assert payload["impact_prompt_version"] == "1"
    assert payload["impact_prompt_sha256"] == "abc123"
    assert payload["impact_model"] == DEFAULT_LLM_MODEL


def test_empty_groups_legitimately_persisted(mock_audit, mock_pipeline):
    # Procedural prints get [] groups. Provenance still stamped because the
    # CHECK in 0041 binds impact_punch + affected_groups + provenance together.
    extr, llm, sb = mock_pipeline
    extr.return_value = _fake_extraction()
    parsed = PrintImpactOutput(
        impact_punch="Ratyfikacja umowy bez bezposredniego wplywu.",
        affected_groups=[],
    )
    llm.return_value = _fake_call(parsed, version=1, sha="def456")

    assess_impact(
        entity_type="print",
        entity_id="2055-A",
        pdf_relpath="sejm/prints/2055-A__2055-A.pdf",
    )

    payload = sb.return_value.table.return_value.update.call_args.args[0]
    assert payload["affected_groups"] == []
    assert payload["impact_punch"].startswith("Ratyfikacja")


def test_audit_decorator_finishes_ok(mock_audit, mock_pipeline):
    ins, rec, fin = mock_audit
    extr, llm, _ = mock_pipeline
    extr.return_value = _fake_extraction()
    llm.return_value = _fake_call(
        PrintImpactOutput(impact_punch="Wystarczajaco dlugi opis zmiany.", affected_groups=[])
    )

    assess_impact(
        entity_type="print",
        entity_id="2055-A",
        pdf_relpath="sejm/prints/2055-A__2055-A.pdf",
    )

    ins.assert_called_once()
    rec.assert_not_called()
    fin.assert_called_once()
    assert fin.call_args.args[1] == "ok"


def test_llm_response_error_records_failure_and_reraises(mock_audit, mock_pipeline):
    _, rec, fin = mock_audit
    extr, llm, sb = mock_pipeline
    extr.return_value = _fake_extraction()
    llm.side_effect = LLMResponseError("schema mismatch")

    with pytest.raises(LLMResponseError, match="schema mismatch"):
        assess_impact(
            entity_type="print",
            entity_id="2055-A",
            pdf_relpath="sejm/prints/2055-A__2055-A.pdf",
        )

    rec.assert_called_once()
    fin.assert_called_once()
    assert fin.call_args.args[1] == "failed"
    sb.return_value.table.return_value.update.assert_not_called()


def test_empty_text_raises_no_llm_call(mock_audit, mock_pipeline):
    _, rec, fin = mock_audit
    extr, llm, sb = mock_pipeline
    extr.return_value = _fake_extraction(text="   \n\t  ")

    with pytest.raises(ValueError, match="empty extracted text"):
        assess_impact(
            entity_type="print",
            entity_id="2055-A",
            pdf_relpath="sejm/prints/2055-A__2055-A.pdf",
        )

    llm.assert_not_called()
    sb.return_value.table.return_value.update.assert_not_called()
    rec.assert_called_once()
    fin.assert_called_once()
    assert fin.call_args.args[1] == "failed"


def test_wrong_entity_type_raises_before_db(mock_audit, mock_pipeline):
    ins, rec, fin = mock_audit
    extr, llm, _ = mock_pipeline

    with pytest.raises(ValueError, match="unknown entity_type"):
        assess_impact(
            entity_type="bogus",
            entity_id="2055-A",
            pdf_relpath="sejm/prints/2055-A__2055-A.pdf",
        )

    ins.assert_not_called()
    rec.assert_not_called()
    fin.assert_not_called()
    extr.assert_not_called()
    llm.assert_not_called()
