"""End-to-end PaddleOCR-VL-1.5 backend against live Supabase pdf_extracts.

Skipped by default. Enable with `RUN_E2E=1`. Uses 1988-A scanned print
(no usable text layer — guaranteed OCR work). Validates:

- Paddle primary run produces meaningful Polish text.
- Cache row written under model_version='paddle-vl-1.5-primary' with ocr_used=True.
- Re-run hits cache and does NOT re-invoke the OCR pipeline.
"""
from __future__ import annotations

import importlib.util
import os
from pathlib import Path

import pytest

from supagraf.db import supabase
from supagraf.enrich import pdf as pdf_mod
from supagraf.enrich.pdf import PADDLE_MODEL_VERSION, _sha256, extract_pdf

pytestmark = [
    pytest.mark.skipif(
        os.environ.get("RUN_E2E") != "1",
        reason="e2e against live Supabase + paddle model; set RUN_E2E=1 to enable",
    ),
    pytest.mark.skipif(
        importlib.util.find_spec("paddleocr") is None,
        reason="paddleocr not installed",
    ),
]

# 1988-A is a scanned PDF — paddle is the only realistic extractor for it.
FIXTURE_PDF = (
    Path(__file__).resolve().parents[2].parent
    / "fixtures" / "sejm" / "prints" / "1988-A__1988-A.pdf"
)


@pytest.fixture(scope="module")
def fixture_pdf() -> Path:
    assert FIXTURE_PDF.exists(), f"fixture missing: {FIXTURE_PDF}"
    return FIXTURE_PDF


def _delete_primary_row(sha: str) -> None:
    supabase().table("pdf_extracts").delete().eq("sha256", sha).eq(
        "model_version", PADDLE_MODEL_VERSION
    ).execute()


def _primary_row(sha: str) -> dict | None:
    r = (
        supabase()
        .table("pdf_extracts")
        .select("text, page_count, ocr_used, char_count_per_page, model_version")
        .eq("sha256", sha)
        .eq("model_version", PADDLE_MODEL_VERSION)
        .limit(1)
        .execute()
    )
    return (r.data or [None])[0]


def test_paddle_ocr_extracts_and_caches(fixture_pdf, monkeypatch):
    """Cold-start paddle + cache hit on rerun. Real model, no mocks."""
    sha = _sha256(fixture_pdf)
    _delete_primary_row(sha)
    try:
        # First call — paddle is primary, runs immediately. Cold start may take 10-30s.
        r1 = extract_pdf(fixture_pdf)
        assert r1.ocr_used is True
        assert r1.cache_hit is False
        assert r1.model_version == PADDLE_MODEL_VERSION
        assert r1.page_count > 0
        assert len(r1.char_count_per_page) == r1.page_count
        # Polish parliamentary print — expect non-trivial extracted text.
        assert len(r1.text) > 100, f"text too short: {len(r1.text)} chars"

        row = _primary_row(sha)
        assert row is not None
        assert row["ocr_used"] is True
        assert row["model_version"] == PADDLE_MODEL_VERSION
        assert row["page_count"] == r1.page_count

        # Second call — must cache-hit and NOT touch the OCR pipeline.
        ocr_called = {"n": 0}
        original_extract = pdf_mod.PaddleOcrBackend.extract

        def spy(self, path):
            ocr_called["n"] += 1
            return original_extract(self, path)

        monkeypatch.setattr(pdf_mod.PaddleOcrBackend, "extract", spy)
        r2 = extract_pdf(fixture_pdf)
        assert r2.cache_hit is True
        assert r2.text == r1.text
        assert ocr_called["n"] == 0, "OCR pipeline was re-invoked despite cache hit"
    finally:
        _delete_primary_row(sha)
