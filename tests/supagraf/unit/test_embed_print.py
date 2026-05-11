"""Unit tests for supagraf.enrich.embed_print.

All side-effects mocked: supabase table lookup, embed_and_store, supabase
update, audit decorator's DB seams. Verifies the title + summary text
construction, MAX_INPUT_CHARS truncation, and audit-decorator wire-up.

This file was rewritten on 2026-05-12 when embed_print was switched from
PDF-extraction-based embedding to LLM-summary-based embedding, and again
the same day to use `title_plus_summary` as the passage strategy (see
docs/embedding_eval_2026-05-12.md).
"""
from __future__ import annotations

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


class _FakeSupabase:
    """Fake supabase() client for the `select + update` chain used in embed_print.

    select chain:
        supabase().table("prints").select(...).eq("number", id).single().execute().data
    update chain:
        supabase().table("prints").update({...}).eq("number", id).execute()
    """

    def __init__(self, *, row: dict | None, update_raises: Exception | None = None):
        self._row = row
        self._update_raises = update_raises
        self.update_calls: list[dict] = []

    # Two-stage: table("prints") returns self; subsequent chain methods are no-ops
    # that finally hit .execute() or .data.
    def table(self, _name):
        return self

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def single(self):
        return self

    def execute(self):
        if self._update_raises is not None and self.update_calls:
            raise self._update_raises
        return MagicMock(data=self._row)

    def update(self, payload):
        self.update_calls.append(payload)
        return self


@pytest.fixture
def patch_pipeline(mock_audit):
    """Yield (fake_supabase, embed_mock). Tests configure both."""
    fake_sb = _FakeSupabase(row=None)
    with patch("supagraf.enrich.embed_print.embed_and_store") as emb, \
         patch("supagraf.enrich.embed_print.supabase", return_value=fake_sb):
        yield fake_sb, emb


# ---- happy path -----------------------------------------------------------


def test_happy_path_uses_title_plus_summary(patch_pipeline):
    fake_sb, emb = patch_pipeline
    fake_sb._row = {
        "number": "2055-A",
        "title": "Ustawa o cyberbezpieczeństwie.",
        "summary": "Projekt zwiększa kompetencje CSIRT i wprowadza obowiązki dla podmiotów krytycznych.",
    }
    emb.return_value = _fake_result()

    out = embed_print(entity_type="print", entity_id="2055-A")

    assert out.entity_type == "print"
    assert len(out.vec) == EMBED_DIM
    emb.assert_called_once()
    text = emb.call_args.kwargs["text"]
    assert text.startswith("Ustawa o cyberbezpieczeństwie.")
    assert "\n\n" in text
    assert "CSIRT" in text
    assert len(text) <= MAX_INPUT_CHARS
    # Provenance stamp must include both fields.
    assert fake_sb.update_calls, "no update fired"
    payload = fake_sb.update_calls[-1]
    assert payload["embedding_model"] == DEFAULT_EMBED_MODEL
    assert payload["embedded_at"]


def test_text_capped_at_max_input_chars(patch_pipeline):
    fake_sb, emb = patch_pipeline
    fake_sb._row = {
        "number": "2055-A",
        "title": "T" * 200,
        "summary": "x" * (MAX_INPUT_CHARS + 5000),
    }
    emb.return_value = _fake_result()

    embed_print(entity_type="print", entity_id="2055-A")
    assert len(emb.call_args.kwargs["text"]) == MAX_INPUT_CHARS


def test_missing_title_falls_back_to_summary_only(patch_pipeline):
    fake_sb, emb = patch_pipeline
    fake_sb._row = {
        "number": "2055-A",
        "title": None,
        "summary": "Podsumowanie bez tytułu.",
    }
    emb.return_value = _fake_result()
    embed_print(entity_type="print", entity_id="2055-A")
    assert emb.call_args.kwargs["text"] == "Podsumowanie bez tytułu."


def test_empty_summary_raises_no_embed_call(patch_pipeline, mock_audit):
    _, rec, fin = mock_audit
    fake_sb, emb = patch_pipeline
    fake_sb._row = {"number": "2055-A", "title": "Tytuł", "summary": "   \n\t  "}

    with pytest.raises(ValueError, match="no summary"):
        embed_print(entity_type="print", entity_id="2055-A")

    emb.assert_not_called()
    assert not fake_sb.update_calls
    rec.assert_called_once()
    fin.assert_called_once()
    assert fin.call_args.args[1] == "failed"


# ---- decorator validation -------------------------------------------------


def test_wrong_entity_type_raises_before_select(patch_pipeline, mock_audit):
    ins, rec, fin = mock_audit
    fake_sb, emb = patch_pipeline

    with pytest.raises((ValueError, EmbedResponseError), match="unknown entity_type|invalid"):
        embed_print(entity_type="bogus", entity_id="2055-A")

    ins.assert_not_called()
    rec.assert_not_called()
    fin.assert_not_called()
    emb.assert_not_called()
    assert not fake_sb.update_calls


# ---- embed errors bubble --------------------------------------------------


def test_embed_response_error_records_failure(patch_pipeline, mock_audit):
    _, rec, fin = mock_audit
    fake_sb, emb = patch_pipeline
    fake_sb._row = {"number": "2055-A", "title": "T", "summary": "S"}
    emb.side_effect = EmbedResponseError("expected dim 1024, got 768")

    with pytest.raises(EmbedResponseError, match="expected dim"):
        embed_print(entity_type="print", entity_id="2055-A")

    rec.assert_called_once()
    assert "EmbedResponseError" in rec.call_args.args[4]
    fin.assert_called_once()
    assert fin.call_args.args[1] == "failed"
    assert not fake_sb.update_calls


def test_embed_http_error_records_failure(patch_pipeline, mock_audit):
    _, rec, fin = mock_audit
    fake_sb, emb = patch_pipeline
    fake_sb._row = {"number": "2055-A", "title": "T", "summary": "S"}
    emb.side_effect = EmbedHTTPError("ollama 503: down")

    with pytest.raises(EmbedHTTPError):
        embed_print(entity_type="print", entity_id="2055-A")

    rec.assert_called_once()
    assert "EmbedHTTPError" in rec.call_args.args[4]
    fin.assert_called_once()
    assert fin.call_args.args[1] == "failed"
    assert not fake_sb.update_calls


# ---- prints update fails the whole run -----------------------------------


def test_prints_update_failure_fails_whole_run(patch_pipeline, mock_audit):
    """Even if embed_and_store succeeded, an APIError on the prints update
    must surface and mark the run failed — otherwise we'd have an
    embeddings row with no provenance pointer back to it."""
    _, rec, fin = mock_audit
    fake_sb, emb = patch_pipeline
    fake_sb._row = {"number": "2055-A", "title": "T", "summary": "S"}
    fake_sb._update_raises = APIError({"message": "constraint violated", "code": "23514"})
    emb.return_value = _fake_result()

    with pytest.raises(APIError):
        embed_print(entity_type="print", entity_id="2055-A")

    emb.assert_called_once()
    rec.assert_called_once()
    assert "APIError" in rec.call_args.args[4]
    fin.assert_called_once()
    assert fin.call_args.args[1] == "failed"
