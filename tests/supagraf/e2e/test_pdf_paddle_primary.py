"""End-to-end paddle-primary extraction against live Supabase pdf_extracts.

Skipped by default. Enable with `RUN_E2E=1`. Uses 2055-A (a small text-based
PDF) to verify the paddle-primary path produces markdown, caches under
paddle-vl-1.5-primary with ocr_used=true, and the second call is a cache hit.

Cleans up only the row it created, leaving older model_version rows intact.
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

# 2055-A — small text-based PDF; paddle still runs as primary and produces markdown.
FIXTURE_PDF = (
    Path(__file__).resolve().parents[2].parent
    / "fixtures" / "sejm" / "prints" / "2055-A__2055-A.pdf"
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


def test_paddle_primary_extracts_markdown_and_caches(fixture_pdf, monkeypatch):
    """Paddle runs on a text PDF, returns markdown, caches under -primary."""
    sha = _sha256(fixture_pdf)
    _delete_primary_row(sha)
    try:
        # First call — cold start may take 10-30s on first model load.
        r1 = extract_pdf(fixture_pdf)
        assert r1.ocr_used is True
        assert r1.cache_hit is False
        assert r1.model_version == PADDLE_MODEL_VERSION
        assert r1.page_count > 0
        assert len(r1.char_count_per_page) == r1.page_count
        assert len(r1.text) > 100, f"text too short: {len(r1.text)} chars"
        # Markdown markers — paddle output should contain heading or list syntax.
        assert "#" in r1.text or "- " in r1.text, "expected markdown structure in output"

        row = _primary_row(sha)
        assert row is not None
        assert row["ocr_used"] is True
        assert row["model_version"] == PADDLE_MODEL_VERSION
        assert row["page_count"] == r1.page_count

        # Second call — must cache-hit and NOT re-invoke paddle.
        ocr_called = {"n": 0}
        original_extract = pdf_mod.PaddleOcrBackend.extract

        def spy(self, path):
            ocr_called["n"] += 1
            return original_extract(self, path)

        monkeypatch.setattr(pdf_mod.PaddleOcrBackend, "extract", spy)
        r2 = extract_pdf(fixture_pdf)
        assert r2.cache_hit is True
        assert r2.text == r1.text
        assert r2.model_version == PADDLE_MODEL_VERSION
        assert ocr_called["n"] == 0, "paddle was re-invoked despite cache hit"
    finally:
        _delete_primary_row(sha)


def test_db_row_shape(fixture_pdf):
    """Inserted row matches the schema we expect downstream consumers to read."""
    sha = _sha256(fixture_pdf)
    extract_pdf(fixture_pdf)  # ensure row exists
    try:
        r = (
            supabase()
            .table("pdf_extracts")
            .select("sha256, model_version, page_count, ocr_used, char_count_per_page")
            .eq("sha256", sha)
            .eq("model_version", PADDLE_MODEL_VERSION)
            .single()
            .execute()
        )
        row = r.data
        assert row["sha256"] == sha
        assert row["model_version"] == PADDLE_MODEL_VERSION
        assert row["page_count"] >= 1
        assert isinstance(row["ocr_used"], bool)
        assert row["ocr_used"] is True
        assert len(row["char_count_per_page"]) == row["page_count"]
    finally:
        _delete_primary_row(sha)
