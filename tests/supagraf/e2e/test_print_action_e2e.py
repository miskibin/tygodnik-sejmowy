"""E2E test of supagraf.enrich.print_action.

Real PDF extraction + real DB writes; httpx mocked so Ollama is not required.
Gated `RUN_E2E=1`.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from supagraf.db import supabase
from supagraf.enrich import DEFAULT_LLM_MODEL
from supagraf.enrich.print_action import JOB_NAME, suggest_print_action

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_E2E") != "1",
    reason="e2e against live Supabase; set RUN_E2E=1 to enable",
)

PRINT_NUMBER = "2055-A"
PDF_RELPATH = "sejm/prints/2055-A__2055-A.pdf"


def _ollama_response(content: dict) -> MagicMock:
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
    # All 4 cols nulled together to satisfy provenance CHECK constraint.
    supabase().table("prints").update({
        "citizen_action": None,
        "citizen_action_prompt_version": None,
        "citizen_action_prompt_sha256": None,
        "citizen_action_model": None,
    }).eq("number", PRINT_NUMBER).execute()


def _delete_audit_rows():
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
        "citizen_action,citizen_action_prompt_version,citizen_action_prompt_sha256,citizen_action_model"
    ).eq("number", PRINT_NUMBER).single().execute().data


def test_happy_path_with_action_persists_and_audit():
    expected = {
        "action": "Sprawdź jak ustawa zmienia Twoje prawa do końca tego tygodnia.",
        "rationale": "Ustawa wpływa na prawa obywatelskie; szybka akcja zalecana.",
    }
    with patch("supagraf.enrich.llm.httpx.post",
               return_value=_ollama_response(expected)) as mock_post:
        out = suggest_print_action(
            entity_type="print",
            entity_id=PRINT_NUMBER,
            pdf_relpath=PDF_RELPATH,
        )

    assert out.action == expected["action"]
    assert out.rationale == expected["rationale"]
    mock_post.assert_called_once()

    row = _read_print()
    assert row["citizen_action"] == expected["action"]
    assert row["citizen_action_prompt_version"] == "1"
    assert row["citizen_action_prompt_sha256"] is not None
    assert row["citizen_action_model"] == DEFAULT_LLM_MODEL

    assert _count_runs("ok") == 1
    assert _count_runs("failed") == 0
    assert _count_failures() == 0


def test_happy_path_with_null_action_persists_provenance():
    # action=None is legitimate; row stays NULL but provenance cols populate.
    expected = {
        "action": None,
        "rationale": "Ustawa proceduralna bez bezpośredniego wpływu obywatelskiego.",
    }
    with patch("supagraf.enrich.llm.httpx.post",
               return_value=_ollama_response(expected)):
        out = suggest_print_action(
            entity_type="print",
            entity_id=PRINT_NUMBER,
            pdf_relpath=PDF_RELPATH,
        )

    assert out.action is None
    row = _read_print()
    assert row["citizen_action"] is None
    assert row["citizen_action_prompt_version"] == "1"
    assert row["citizen_action_prompt_sha256"] is not None
    assert row["citizen_action_model"] == DEFAULT_LLM_MODEL

    assert _count_runs("ok") == 1
    assert _count_failures() == 0


def test_llm_5xx_records_failure_no_action_written():
    with patch("supagraf.enrich.llm.httpx.post",
               return_value=_ollama_error_response(500, "internal")):
        with pytest.raises(Exception):
            suggest_print_action(
                entity_type="print",
                entity_id=PRINT_NUMBER,
                pdf_relpath=PDF_RELPATH,
            )

    row = _read_print()
    assert row["citizen_action"] is None
    assert row["citizen_action_model"] is None
    assert _count_runs("failed") == 1
    assert _count_failures() == 1
    failures = supabase().table("enrichment_failures").select(
        "error"
    ).eq("fn_name", JOB_NAME).execute().data or []
    assert any("LLMHTTPError" in f["error"] for f in failures)
