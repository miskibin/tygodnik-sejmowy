"""End-to-end test of supagraf.enrich.embed_print.

Real DB writes for embeddings/prints/model_runs/enrichment_failures.
extract_pdf mocked (paddle cold-start ~30s helps no test). embed_and_store
is REPLACED with a fake that does the real DB upsert with a canned vec
but skips the httpx call to Ollama - keeps the test hermetic from a
running daemon while still exercising the embeddings table writes.

Gated `RUN_E2E=1`.
"""
from __future__ import annotations

import os
from unittest.mock import patch

import pytest

from supagraf.db import supabase
from supagraf.enrich.embed import (
    DEFAULT_EMBED_MODEL,
    EMBED_DIM,
    EmbedHTTPError,
    EmbedResult,
    upsert_embedding,
)
from supagraf.enrich.embed_print import JOB_NAME, embed_print
from supagraf.enrich.pdf import ExtractionResult

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_E2E") != "1",
    reason="e2e against live Supabase; set RUN_E2E=1 to enable",
)

PRINT_NUMBER = "2055-A"
PDF_RELPATH = "sejm/prints/2055-A__2055-A.pdf"
CANNED_TEXT = "Tekst pisma sejmowego do testow embeddingu."
FAKE_VEC = [0.001 * i for i in range(EMBED_DIM)]


def _canned_extraction(text: str = CANNED_TEXT) -> ExtractionResult:
    return ExtractionResult(
        sha256="canned-sha-embed",
        text=text,
        page_count=1,
        ocr_used=False,
        char_count_per_page=[len(text)],
        model_version="canned-test",
        cache_hit=False,
    )


def fake_embed_and_store(
    *, text: str, entity_type: str, entity_id: str, model: str = DEFAULT_EMBED_MODEL
) -> EmbedResult:
    """Real DB upsert + canned vec. Bypasses Ollama httpx call.

    Mirrors embed_and_store's contract so the enricher's downstream
    assertions (dim, EmbedResult shape) are exercised against real values.
    """
    upsert_embedding(
        entity_type=entity_type, entity_id=entity_id, vec=FAKE_VEC, model=model
    )
    return EmbedResult(
        entity_type=entity_type, entity_id=entity_id, model=model, vec=FAKE_VEC
    )


def _reset_state():
    """Drop test embedding row, reset prints provenance, drop model_runs."""
    supabase().table("embeddings").delete().eq(
        "entity_type", "print"
    ).eq("entity_id", PRINT_NUMBER).execute()
    # Null both together - prints_embedding_provenance allows (NULL, NULL)
    # but rejects (model, NULL).
    supabase().table("prints").update({
        "embedding_model": None,
        "embedded_at": None,
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
        "embedding_model,embedded_at"
    ).eq("number", PRINT_NUMBER).single().execute().data


def _read_embedding() -> dict | None:
    r = supabase().table("embeddings").select(
        "entity_type,entity_id,model"
    ).eq("entity_type", "print").eq("entity_id", PRINT_NUMBER).execute()
    return (r.data or [None])[0]


def test_happy_path_persists_embedding_and_audit():
    with patch("supagraf.enrich.embed_print.extract_pdf",
               return_value=_canned_extraction()), \
         patch("supagraf.enrich.embed_print.embed_and_store",
               side_effect=fake_embed_and_store):
        out = embed_print(
            entity_type="print",
            entity_id=PRINT_NUMBER,
            pdf_relpath=PDF_RELPATH,
        )

    assert out.entity_type == "print"
    assert out.entity_id == PRINT_NUMBER
    assert len(out.vec) == EMBED_DIM

    emb = _read_embedding()
    assert emb is not None
    assert emb["entity_type"] == "print"
    assert emb["entity_id"] == PRINT_NUMBER
    assert emb["model"] == DEFAULT_EMBED_MODEL

    p = _read_print()
    assert p["embedding_model"] == DEFAULT_EMBED_MODEL
    assert p["embedded_at"] is not None

    assert _count_runs("ok") == 1
    assert _count_runs("failed") == 0
    assert _count_failures() == 0


def test_idempotent_rerun_same_pk_two_audit_rows():
    with patch("supagraf.enrich.embed_print.extract_pdf",
               return_value=_canned_extraction()), \
         patch("supagraf.enrich.embed_print.embed_and_store",
               side_effect=fake_embed_and_store):
        embed_print(entity_type="print", entity_id=PRINT_NUMBER, pdf_relpath=PDF_RELPATH)
        first_stamp = _read_print()["embedded_at"]
        embed_print(entity_type="print", entity_id=PRINT_NUMBER, pdf_relpath=PDF_RELPATH)

    # Single embedding row (UPSERT on PK), prints stamp updated, 2 audit runs.
    cnt = supabase().table("embeddings").select(
        "entity_id", count="exact"
    ).eq("entity_type", "print").eq("entity_id", PRINT_NUMBER).execute().count
    assert cnt == 1

    p = _read_print()
    assert p["embedding_model"] == DEFAULT_EMBED_MODEL
    # Second run produced a fresh stamp (>= first; clock may be same ms).
    assert p["embedded_at"] >= first_stamp
    assert _count_runs("ok") == 2


def test_wrong_entity_type_no_db_writes():
    with patch("supagraf.enrich.embed_print.extract_pdf",
               return_value=_canned_extraction()), \
         patch("supagraf.enrich.embed_print.embed_and_store",
               side_effect=fake_embed_and_store) as emb:
        # 'act' is allowed — use a truly unknown type to trip decorator validation.
        with pytest.raises(ValueError, match="unknown entity_type"):
            embed_print(
                entity_type="bogus",
                entity_id=PRINT_NUMBER,
                pdf_relpath=PDF_RELPATH,
            )

    emb.assert_not_called()
    assert _read_embedding() is None
    p = _read_print()
    assert p["embedding_model"] is None
    # Decorator validates entity_type BEFORE _insert_run, so no audit row.
    assert _count_runs() == 0


def test_empty_text_records_failure_no_writes():
    with patch("supagraf.enrich.embed_print.extract_pdf",
               return_value=_canned_extraction(text="   \n  ")), \
         patch("supagraf.enrich.embed_print.embed_and_store",
               side_effect=fake_embed_and_store) as emb:
        with pytest.raises(ValueError, match="empty extracted text"):
            embed_print(
                entity_type="print",
                entity_id=PRINT_NUMBER,
                pdf_relpath=PDF_RELPATH,
            )

    emb.assert_not_called()
    assert _read_embedding() is None
    p = _read_print()
    assert p["embedded_at"] is None
    assert _count_runs("failed") == 1
    assert _count_failures() == 1


def test_embed_http_error_no_provenance_stamp():
    """Mock embed_and_store raising HTTP error — must NOT stamp prints."""
    def _raise(**_):
        raise EmbedHTTPError("ollama 503: down")

    with patch("supagraf.enrich.embed_print.extract_pdf",
               return_value=_canned_extraction()), \
         patch("supagraf.enrich.embed_print.embed_and_store",
               side_effect=_raise):
        with pytest.raises(EmbedHTTPError):
            embed_print(
                entity_type="print",
                entity_id=PRINT_NUMBER,
                pdf_relpath=PDF_RELPATH,
            )

    assert _read_embedding() is None
    p = _read_print()
    assert p["embedded_at"] is None
    assert _count_runs("failed") == 1
    failures = supabase().table("enrichment_failures").select(
        "error"
    ).eq("fn_name", JOB_NAME).execute().data or []
    assert any("EmbedHTTPError" in f["error"] for f in failures)
