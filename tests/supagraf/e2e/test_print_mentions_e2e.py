"""End-to-end test of supagraf.enrich.print_mentions.

Real DB writes for print_mentions/prints/model_runs/enrichment_failures.
LLM mocked at httpx layer; extract_pdf mocked too — paddleocr cold start
adds ~30s for nothing here.

Gated `RUN_E2E=1`.

Idempotency note: re-running with the SAME prompt_version replaces rows
for that (print, version) bucket via the explicit DELETE in the enricher.
A bumped version would add fresh rows alongside; we don't exercise that
here (would require monkeypatching the prompts dir for v2.md) and rely
on the unit test for that contract.
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
from supagraf.enrich.print_mentions import JOB_NAME, extract_mentions

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_E2E") != "1",
    reason="e2e against live Supabase; set RUN_E2E=1 to enable",
)

PRINT_NUMBER = "2055-A"
PDF_RELPATH = "sejm/prints/2055-A__2055-A.pdf"
# Long enough for canned spans (40 chars >= max span_end below).
CANNED_TEXT = "Min. Anna Kowalska poparla wniosek Komisji."


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


def _canned_extraction() -> ExtractionResult:
    return ExtractionResult(
        sha256="canned-sha",
        text=CANNED_TEXT,
        page_count=1,
        ocr_used=False,
        char_count_per_page=[len(CANNED_TEXT)],
        model_version="canned-test",
        cache_hit=False,
    )


def _print_id() -> int | None:
    r = supabase().table("prints").select("id").eq("number", PRINT_NUMBER).limit(1).execute()
    return int(r.data[0]["id"]) if r.data else None


def _reset_state():
    pid = _print_id()
    if pid is not None:
        supabase().table("print_mentions").delete().eq("print_id", pid).execute()
        # Null all four together to satisfy prints_mentions_provenance.
        supabase().table("prints").update({
            "mentions_prompt_version": None,
            "mentions_prompt_sha256": None,
            "mentions_model": None,
            "mentions_extracted_at": None,
        }).eq("number", PRINT_NUMBER).execute()
    supabase().table("model_runs").delete().eq("fn_name", JOB_NAME).execute()


@pytest.fixture(autouse=True)
def _isolate_state():
    _reset_state()
    yield
    _reset_state()


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
        "mentions_prompt_version,mentions_prompt_sha256,mentions_model,mentions_extracted_at"
    ).eq("number", PRINT_NUMBER).single().execute().data


def _read_mentions() -> list[dict]:
    pid = _print_id()
    if pid is None:
        return []
    return supabase().table("print_mentions").select("*").eq("print_id", pid).execute().data or []


def test_happy_path_persists_mentions_and_audit():
    canned = {
        "mentions": [
            {"raw_text": "Anna Kowalska", "span_start": 5, "span_end": 18, "mention_type": "person"},
            {"raw_text": "Komisji", "span_start": 35, "span_end": 42, "mention_type": "committee"},
        ]
    }
    with patch("supagraf.enrich.print_mentions.extract_pdf",
               return_value=_canned_extraction()), \
         patch("supagraf.enrich.llm.httpx.post",
               return_value=_ollama_response(canned)) as mock_post:
        out = extract_mentions(
            entity_type="print",
            entity_id=PRINT_NUMBER,
            pdf_relpath=PDF_RELPATH,
        )

    assert len(out.mentions) == 2
    mock_post.assert_called_once()

    rows = _read_mentions()
    assert len(rows) == 2
    types = {r["mention_type"] for r in rows}
    assert types == {"person", "committee"}
    assert all(r["prompt_version"] == "1" for r in rows)
    assert all(r["model"] == DEFAULT_LLM_MODEL for r in rows)
    assert all(r["prompt_sha256"] for r in rows)
    assert all(r["span_start"] >= 0 and r["span_end"] >= r["span_start"] for r in rows)

    p = _read_print()
    assert p["mentions_prompt_version"] == "1"
    assert p["mentions_prompt_sha256"] is not None
    assert p["mentions_model"] == DEFAULT_LLM_MODEL
    assert p["mentions_extracted_at"] is not None

    assert _count_runs("ok") == 1
    assert _count_runs("failed") == 0
    assert _count_failures() == 0


def test_rerun_same_version_replaces_rows():
    # First run: 2 rows.
    first = {
        "mentions": [
            {"raw_text": "Anna Kowalska", "span_start": 5, "span_end": 18, "mention_type": "person"},
            {"raw_text": "Komisji", "span_start": 35, "span_end": 42, "mention_type": "committee"},
        ]
    }
    # Second run: 1 row — should REPLACE the first set, not accumulate.
    second = {
        "mentions": [
            {"raw_text": "Min.", "span_start": 0, "span_end": 4, "mention_type": "person"},
        ]
    }
    with patch("supagraf.enrich.print_mentions.extract_pdf",
               return_value=_canned_extraction()):
        with patch("supagraf.enrich.llm.httpx.post",
                   return_value=_ollama_response(first)):
            extract_mentions(entity_type="print", entity_id=PRINT_NUMBER, pdf_relpath=PDF_RELPATH)
        assert len(_read_mentions()) == 2
        with patch("supagraf.enrich.llm.httpx.post",
                   return_value=_ollama_response(second)):
            extract_mentions(entity_type="print", entity_id=PRINT_NUMBER, pdf_relpath=PDF_RELPATH)

    rows = _read_mentions()
    assert len(rows) == 1
    assert rows[0]["raw_text"] == "Min."
    assert _count_runs("ok") == 2


def test_llm_5xx_records_failure_no_mentions_written():
    with patch("supagraf.enrich.print_mentions.extract_pdf",
               return_value=_canned_extraction()), \
         patch("supagraf.enrich.llm.httpx.post",
               return_value=_ollama_error_response(500, "internal")):
        with pytest.raises(Exception):
            extract_mentions(
                entity_type="print",
                entity_id=PRINT_NUMBER,
                pdf_relpath=PDF_RELPATH,
            )

    assert _read_mentions() == []
    p = _read_print()
    assert p["mentions_extracted_at"] is None
    assert _count_runs("failed") == 1
    assert _count_failures() == 1
    failures = supabase().table("enrichment_failures").select(
        "error"
    ).eq("fn_name", JOB_NAME).execute().data or []
    assert any("LLMHTTPError" in f["error"] for f in failures)


def test_llm_invalid_mention_type_records_failure():
    # 'party' violates Literal — ValidationError → LLMResponseError.
    bad = {"mentions": [
        {"raw_text": "PiS", "span_start": 0, "span_end": 3, "mention_type": "party"},
    ]}
    with patch("supagraf.enrich.print_mentions.extract_pdf",
               return_value=_canned_extraction()), \
         patch("supagraf.enrich.llm.httpx.post",
               return_value=_ollama_response(bad)):
        with pytest.raises(LLMResponseError):
            extract_mentions(
                entity_type="print",
                entity_id=PRINT_NUMBER,
                pdf_relpath=PDF_RELPATH,
            )

    assert _read_mentions() == []
    assert _count_runs("failed") == 1
    failures = supabase().table("enrichment_failures").select(
        "error"
    ).eq("fn_name", JOB_NAME).execute().data or []
    assert any("PrintMentionsOutput" in f["error"] or "Mention" in f["error"]
               for f in failures)


def test_print_not_in_db_records_failure():
    # Use a number that won't exist; enricher must raise inside the wrapper
    # so decorator records the failure.
    canned = {"mentions": [
        {"raw_text": "x", "span_start": 0, "span_end": 1, "mention_type": "person"},
    ]}
    with patch("supagraf.enrich.print_mentions.extract_pdf",
               return_value=_canned_extraction()), \
         patch("supagraf.enrich.llm.httpx.post",
               return_value=_ollama_response(canned)):
        with pytest.raises(ValueError, match="not in DB"):
            extract_mentions(
                entity_type="print",
                entity_id="ZZZZ-NOT-EXIST",
                pdf_relpath=PDF_RELPATH,
            )

    assert _count_runs("failed") == 1
    failures = supabase().table("enrichment_failures").select(
        "error,entity_id"
    ).eq("fn_name", JOB_NAME).execute().data or []
    assert any("ZZZZ-NOT-EXIST" in (f.get("entity_id") or "") for f in failures)
