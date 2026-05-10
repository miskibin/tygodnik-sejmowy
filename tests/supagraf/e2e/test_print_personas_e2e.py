"""E2E for print_personas. Real PDF + real DB; LLM mocked at httpx layer."""
from __future__ import annotations

import json
import os
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from supagraf.db import supabase
from supagraf.enrich import DEFAULT_LLM_MODEL
from supagraf.enrich.llm import LLMResponseError
from supagraf.enrich.print_personas import JOB_NAME, tag_personas

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_E2E") != "1",
    reason="e2e against live Supabase; set RUN_E2E=1 to enable",
)

PRINT_NUMBER = "2055-A"
PDF_RELPATH = "sejm/prints/2055-A__2055-A.pdf"
REPO_ROOT = Path(__file__).resolve().parents[3]


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
    # Null all 4 cols together — CHECK requires they move as a group.
    supabase().table("prints").update({
        "persona_tags": None,
        "persona_tags_prompt_version": None,
        "persona_tags_prompt_sha256": None,
        "persona_tags_model": None,
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
        "persona_tags,persona_tags_prompt_version,persona_tags_prompt_sha256,persona_tags_model"
    ).eq("number", PRINT_NUMBER).single().execute().data


def test_happy_path_persists_personas_and_audit():
    expected = {
        "tags": ["najemca", "rodzic-ucznia"],
        "rationale": "Druk wprowadza ulgi dla najemcow i zmienia organizacje szkol.",
    }
    with patch("supagraf.enrich.llm.httpx.post",
               return_value=_ollama_response(expected)) as mock_post:
        out = tag_personas(
            entity_type="print",
            entity_id=PRINT_NUMBER,
            pdf_relpath=PDF_RELPATH,
        )

    assert out.tags == expected["tags"]
    assert out.rationale == expected["rationale"]
    mock_post.assert_called_once()

    row = _read_print()
    assert row["persona_tags"] == expected["tags"]
    assert row["persona_tags_prompt_version"] == "1"
    assert row["persona_tags_prompt_sha256"] is not None
    assert row["persona_tags_model"] == DEFAULT_LLM_MODEL

    assert _count_runs("ok") == 1
    assert _count_runs("failed") == 0
    assert _count_failures() == 0


def test_llm_5xx_records_failure_no_tags_written():
    with patch("supagraf.enrich.llm.httpx.post",
               return_value=_ollama_error_response(500, "internal")):
        with pytest.raises(Exception):
            tag_personas(
                entity_type="print",
                entity_id=PRINT_NUMBER,
                pdf_relpath=PDF_RELPATH,
            )

    row = _read_print()
    assert row["persona_tags"] is None
    assert _count_runs("failed") == 1
    assert _count_failures() == 1
    failures = supabase().table("enrichment_failures").select(
        "error"
    ).eq("fn_name", JOB_NAME).execute().data or []
    assert any("LLMHTTPError" in f["error"] for f in failures)


def test_llm_schema_mismatch_records_failure():
    # Invalid tag literal -> ValidationError -> LLMResponseError (no retry).
    bad_content = {"tags": ["not-a-real-persona"], "rationale": "wystarczajaco dlugie uzasadnienie"}
    with patch("supagraf.enrich.llm.httpx.post",
               return_value=_ollama_response(bad_content)):
        with pytest.raises(LLMResponseError):
            tag_personas(
                entity_type="print",
                entity_id=PRINT_NUMBER,
                pdf_relpath=PDF_RELPATH,
            )

    row = _read_print()
    assert row["persona_tags"] is None
    assert _count_runs("failed") == 1
    failures = supabase().table("enrichment_failures").select(
        "error"
    ).eq("fn_name", JOB_NAME).execute().data or []
    assert any("PrintPersonasOutput" in f["error"] for f in failures)
