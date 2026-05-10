"""Unit tests for supagraf.enrich.embed_print.

All side-effects mocked: extract_pdf, embed_and_store, supabase update,
audit decorator's DB seams. Verifies wire-up between B1/B3/B5 + happy/
adversarial paths without touching network or disk.
"""
from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from postgrest.exceptions import APIError

from supagraf.enrich.embed import (
    DEFAULT_EMBED_MODEL,
    EMBED_DIM,
    EmbedHTTPError,
    EmbedResponseError,
    EmbedResult,
)
from supagraf.enrich.embed_print import MAX_INPUT_CHARS, embed_print
from supagraf.enrich.pdf import ExtractionResult


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


def _fake_result(entity_id: str = "2055-A") -> EmbedResult:
    return EmbedResult(
        entity_type="print",
        entity_id=entity_id,
        model=DEFAULT_EMBED_MODEL,
        vec=[0.001 * i for i in range(EMBED_DIM)],
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
    """Patch extract_pdf, embed_and_store, supabase, fixtures_root."""
    with patch("supagraf.enrich.embed_print.extract_pdf") as extr, \
         patch("supagraf.enrich.embed_print.embed_and_store") as emb, \
         patch("supagraf.enrich.embed_print.supabase") as sb, \
         patch("supagraf.enrich.embed_print.fixtures_root") as froot:
        froot.return_value = Path("/tmp/fixtures")
        # supabase().table().update().eq().execute() chain
        sb.return_value.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()
        yield extr, emb, sb


# ---- happy path -----------------------------------------------------------

def test_happy_path_embeds_and_stamps(mock_audit, mock_pipeline):
    extr, emb, sb = mock_pipeline
    extr.return_value = _fake_extraction()
    emb.return_value = _fake_result()

    out = embed_print(
        entity_type="print",
        entity_id="2055-A",
        pdf_relpath="sejm/prints/2055-A__2055-A.pdf",
    )

    assert out.entity_type == "print"
    assert out.entity_id == "2055-A"
    assert len(out.vec) == EMBED_DIM
    extr.assert_called_once()
    emb.assert_called_once()
    # Verify text was capped + entity args passed correctly.
    kwargs = emb.call_args.kwargs
    assert kwargs["entity_type"] == "print"
    assert kwargs["entity_id"] == "2055-A"
    assert kwargs["model"] == DEFAULT_EMBED_MODEL
    assert len(kwargs["text"]) <= MAX_INPUT_CHARS

    update_call = sb.return_value.table.return_value.update
    update_call.assert_called_once()
    payload = update_call.call_args.args[0]
    assert payload["embedding_model"] == DEFAULT_EMBED_MODEL
    assert "embedded_at" in payload
    assert payload["embedded_at"]  # truthy ISO string


def test_text_capped_at_max_input_chars(mock_audit, mock_pipeline):
    extr, emb, _ = mock_pipeline
    long_text = "a" * (MAX_INPUT_CHARS + 5000)
    extr.return_value = _fake_extraction(text=long_text)
    emb.return_value = _fake_result()

    embed_print(
        entity_type="print",
        entity_id="2055-A",
        pdf_relpath="sejm/prints/2055-A__2055-A.pdf",
    )

    assert len(emb.call_args.kwargs["text"]) == MAX_INPUT_CHARS


def test_happy_path_audit_finishes_ok(mock_audit, mock_pipeline):
    ins, rec, fin = mock_audit
    extr, emb, _ = mock_pipeline
    extr.return_value = _fake_extraction()
    emb.return_value = _fake_result()

    embed_print(
        entity_type="print",
        entity_id="2055-A",
        pdf_relpath="sejm/prints/2055-A__2055-A.pdf",
    )

    ins.assert_called_once()
    rec.assert_not_called()
    fin.assert_called_once()
    assert fin.call_args.args[1] == "ok"


# ---- empty text -----------------------------------------------------------

def test_empty_text_raises_no_embed_call(mock_audit, mock_pipeline):
    _, rec, fin = mock_audit
    extr, emb, sb = mock_pipeline
    extr.return_value = _fake_extraction(text="   \n\t  ")

    with pytest.raises(ValueError, match="empty extracted text"):
        embed_print(
            entity_type="print",
            entity_id="2055-A",
            pdf_relpath="sejm/prints/2055-A__2055-A.pdf",
        )

    emb.assert_not_called()
    sb.return_value.table.return_value.update.assert_not_called()
    rec.assert_called_once()
    fin.assert_called_once()
    assert fin.call_args.args[1] == "failed"


# ---- decorator validation -------------------------------------------------

def test_wrong_entity_type_raises_before_extract(mock_audit, mock_pipeline):
    ins, rec, fin = mock_audit
    extr, emb, _ = mock_pipeline

    # 'act' is actually in ALLOWED_ENTITY_TYPES; use a truly unknown value.
    with pytest.raises(ValueError, match="unknown entity_type"):
        embed_print(
            entity_type="bogus",
            entity_id="2055-A",
            pdf_relpath="sejm/prints/2055-A__2055-A.pdf",
        )

    # Decorator validates entity_type before _insert_run; nothing else fires.
    ins.assert_not_called()
    rec.assert_not_called()
    fin.assert_not_called()
    extr.assert_not_called()
    emb.assert_not_called()


# ---- embed errors bubble --------------------------------------------------

def test_embed_response_error_records_failure(mock_audit, mock_pipeline):
    _, rec, fin = mock_audit
    extr, emb, sb = mock_pipeline
    extr.return_value = _fake_extraction()
    emb.side_effect = EmbedResponseError("expected dim 1024, got 768")

    with pytest.raises(EmbedResponseError, match="expected dim"):
        embed_print(
            entity_type="print",
            entity_id="2055-A",
            pdf_relpath="sejm/prints/2055-A__2055-A.pdf",
        )

    rec.assert_called_once()
    err_text = rec.call_args.args[4]
    assert "EmbedResponseError" in err_text
    fin.assert_called_once()
    assert fin.call_args.args[1] == "failed"
    sb.return_value.table.return_value.update.assert_not_called()


def test_embed_http_error_records_failure(mock_audit, mock_pipeline):
    _, rec, fin = mock_audit
    extr, emb, sb = mock_pipeline
    extr.return_value = _fake_extraction()
    emb.side_effect = EmbedHTTPError("ollama 503: down")

    with pytest.raises(EmbedHTTPError):
        embed_print(
            entity_type="print",
            entity_id="2055-A",
            pdf_relpath="sejm/prints/2055-A__2055-A.pdf",
        )

    rec.assert_called_once()
    assert "EmbedHTTPError" in rec.call_args.args[4]
    fin.assert_called_once()
    assert fin.call_args.args[1] == "failed"
    sb.return_value.table.return_value.update.assert_not_called()


# ---- prints update fails the whole run -----------------------------------

def test_prints_update_failure_fails_whole_run(mock_audit, mock_pipeline):
    """Even if embed_and_store succeeded, an APIError on the prints update
    must surface and mark the run failed - otherwise we'd have an
    embeddings row with no provenance pointer back to it."""
    _, rec, fin = mock_audit
    extr, emb, sb = mock_pipeline
    extr.return_value = _fake_extraction()
    emb.return_value = _fake_result()

    api_err = APIError({"message": "constraint violated", "code": "23514"})
    sb.return_value.table.return_value.update.return_value.eq.return_value.execute.side_effect = api_err

    with pytest.raises(APIError):
        embed_print(
            entity_type="print",
            entity_id="2055-A",
            pdf_relpath="sejm/prints/2055-A__2055-A.pdf",
        )

    emb.assert_called_once()
    rec.assert_called_once()
    assert "APIError" in rec.call_args.args[4]
    fin.assert_called_once()
    assert fin.call_args.args[1] == "failed"
