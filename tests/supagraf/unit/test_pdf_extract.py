"""Unit tests for PDF extraction layer (paddle-primary flow).

Mocks `supabase()` and uses a tiny in-memory PDF created via pypdf so we don't
need reportlab or external fixtures. Cache behavior + paddle/pypdf ordering
are the central concerns: paddle is primary, pypdf is fallback only when paddle
raises.
"""
from __future__ import annotations

import io
from pathlib import Path

import pytest
from pypdf import PdfWriter

from supagraf.enrich import pdf as pdf_mod
from supagraf.enrich.pdf import (
    PADDLE_MODEL_VERSION,
    PYPDF_FALLBACK_VERSION,
    PaddleOcrBackend,
    _resolve_ocr_backend,
    _sha256,
    extract_pdf,
)


def _make_empty_pdf() -> bytes:
    """Minimal valid PDF with one blank page (no text content)."""
    writer = PdfWriter()
    writer.add_blank_page(width=612, height=792)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def _write_pdf(tmp_path: Path, name: str, data: bytes) -> Path:
    p = tmp_path / name
    p.write_bytes(data)
    return p


# ---------- pure helpers ----------

def test_sha256_deterministic(tmp_path: Path):
    p1 = _write_pdf(tmp_path, "a.pdf", b"hello")
    p2 = _write_pdf(tmp_path, "b.pdf", b"hello")
    assert _sha256(p1) == _sha256(p2)


def test_sha256_differs_on_content(tmp_path: Path):
    p1 = _write_pdf(tmp_path, "a.pdf", b"hello")
    p2 = _write_pdf(tmp_path, "b.pdf", b"world")
    assert _sha256(p1) != _sha256(p2)


def test_resolve_paddle_backend_default(monkeypatch):
    """Default (env unset) must wire PaddleOCR-VL — no None, no NotImplementedError."""
    monkeypatch.delenv("SUPAGRAF_OCR_BACKEND", raising=False)
    backend = _resolve_ocr_backend()
    assert isinstance(backend, PaddleOcrBackend)


def test_resolve_ocr_backend_explicit_none(monkeypatch):
    monkeypatch.setenv("SUPAGRAF_OCR_BACKEND", "none")
    assert _resolve_ocr_backend() is None


def test_resolve_ocr_backend_explicit_paddle(monkeypatch):
    monkeypatch.setenv("SUPAGRAF_OCR_BACKEND", "paddle")
    assert isinstance(_resolve_ocr_backend(), PaddleOcrBackend)


def test_resolve_ocr_backend_unwired(monkeypatch):
    monkeypatch.setenv("SUPAGRAF_OCR_BACKEND", "vision-llm")
    with pytest.raises(NotImplementedError, match="vision-llm"):
        _resolve_ocr_backend()


def test_paddle_backend_import_error_guidance(monkeypatch):
    """When paddleocr lib is missing, _get_model surfaces actionable guidance."""
    import sys
    # Reset singleton so the import path runs.
    monkeypatch.setattr(PaddleOcrBackend, "_model", None)
    # Putting None in sys.modules makes `from paddleocr import X` raise ImportError.
    monkeypatch.setitem(sys.modules, "paddleocr", None)
    backend = PaddleOcrBackend()
    with pytest.raises(ImportError, match="uv add paddleocr"):
        backend._get_model()


def test_missing_file_raises(tmp_path: Path):
    with pytest.raises(FileNotFoundError):
        extract_pdf(tmp_path / "nope.pdf")


# ---------- fake backends ----------

class _FakePaddleOk:
    """Stub paddle backend that succeeds with given (text, per_page)."""

    def __init__(self, text: str = "# Heading\n\n- item one\n- item two", pages: int = 2):
        self.calls = 0
        self._text = text
        self._pages = pages

    def extract(self, pdf_path: Path) -> tuple[str, list[int]]:
        self.calls += 1
        per_page = [len(self._text)] * self._pages
        return self._text, per_page


class _FakePaddleRaise:
    """Stub paddle backend that always raises the given exception class."""

    def __init__(self, exc: Exception):
        self.calls = 0
        self._exc = exc

    def extract(self, pdf_path: Path) -> tuple[str, list[int]]:
        self.calls += 1
        raise self._exc


class _FakePaddleZero:
    """Stub paddle backend that returns empty text / zero per_page."""

    def __init__(self):
        self.calls = 0

    def extract(self, pdf_path: Path) -> tuple[str, list[int]]:
        self.calls += 1
        return "", [0, 0]


def _patch_db(monkeypatch, lookup_returns: list[dict | None] | None = None):
    """Install a fake supabase() returning chainable mocks.

    `lookup_returns` is a queue of return values for `_cache_lookup` (one per call).
    Insert calls are tracked on the returned dict under `inserts`.
    """
    state = {"inserts": [], "lookup_calls": 0}
    queue = list(lookup_returns or [])

    def fake_lookup(sha, model_version):
        state["lookup_calls"] += 1
        if not queue:
            return None
        return queue.pop(0)

    def fake_insert(sha, model_version, text, page_count, ocr_used, per_page):
        state["inserts"].append({
            "sha256": sha, "model_version": model_version,
            "page_count": page_count, "ocr_used": ocr_used,
            "per_page_len": len(per_page),
            "text": text,
        })

    monkeypatch.setattr(pdf_mod, "_cache_lookup", fake_lookup)
    monkeypatch.setattr(pdf_mod, "_cache_insert", fake_insert)
    return state


# ---------- extract_pdf flow ----------

def test_paddle_primary_used(tmp_path: Path, monkeypatch):
    """Every PDF — text or scanned — goes through paddle as primary."""
    pdf = _write_pdf(tmp_path, "txt.pdf", _make_empty_pdf())
    state = _patch_db(monkeypatch)
    paddle = _FakePaddleOk(text="# Title\n\n- a\n- b", pages=2)
    res = extract_pdf(pdf, ocr_backend=paddle)
    assert paddle.calls == 1
    assert res.ocr_used is True
    assert res.cache_hit is False
    assert res.model_version == PADDLE_MODEL_VERSION
    assert "#" in res.text
    assert len(state["inserts"]) == 1
    assert state["inserts"][0]["model_version"] == PADDLE_MODEL_VERSION
    assert state["inserts"][0]["ocr_used"] is True


def test_cache_hit_avoids_paddle(tmp_path: Path, monkeypatch):
    """Lookup hit short-circuits — paddle backend is never invoked."""
    pdf = _write_pdf(tmp_path, "x.pdf", _make_empty_pdf())
    cached = {
        "text": "# cached markdown",
        "page_count": 2,
        "ocr_used": True,
        "char_count_per_page": [50, 50],
    }
    state = _patch_db(monkeypatch, lookup_returns=[cached])
    paddle = _FakePaddleOk()
    res = extract_pdf(pdf, ocr_backend=paddle)
    assert res.cache_hit is True
    assert res.text == "# cached markdown"
    assert res.model_version == PADDLE_MODEL_VERSION
    assert paddle.calls == 0
    assert state["inserts"] == []


def test_cache_miss_then_hit(tmp_path: Path, monkeypatch):
    """First call: lookup miss → paddle runs → row inserted. Second: hit, paddle skipped."""
    pdf = _write_pdf(tmp_path, "x.pdf", _make_empty_pdf())
    cached = {
        "text": "# extracted",
        "page_count": 1,
        "ocr_used": True,
        "char_count_per_page": [40],
    }
    state = _patch_db(monkeypatch, lookup_returns=[None, cached])
    paddle = _FakePaddleOk(text="# extracted", pages=1)
    r1 = extract_pdf(pdf, ocr_backend=paddle)
    r2 = extract_pdf(pdf, ocr_backend=paddle)
    assert r1.cache_hit is False
    assert r2.cache_hit is True
    assert paddle.calls == 1  # only first call
    assert len(state["inserts"]) == 1


def test_paddle_failure_falls_back_to_pypdf(tmp_path: Path, monkeypatch):
    """When paddle raises, pypdf runs and the row is tagged as fallback."""
    pdf = _write_pdf(tmp_path, "x.pdf", _make_empty_pdf())
    state = _patch_db(monkeypatch)
    paddle = _FakePaddleRaise(RuntimeError("paddle OOM"))
    monkeypatch.setattr(pdf_mod, "_extract_pypdf",
                        lambda p: ("plain pypdf body", [800]))
    res = extract_pdf(pdf, ocr_backend=paddle)
    assert paddle.calls == 1
    assert res.ocr_used is False
    assert res.model_version == PYPDF_FALLBACK_VERSION
    assert res.text == "plain pypdf body"
    assert len(state["inserts"]) == 1
    assert state["inserts"][0]["model_version"] == PYPDF_FALLBACK_VERSION
    assert state["inserts"][0]["ocr_used"] is False


def test_both_fail_reraise_paddle(tmp_path: Path, monkeypatch):
    """Both backends raise → final exception is paddle's (primary)."""
    pdf = _write_pdf(tmp_path, "x.pdf", _make_empty_pdf())
    _patch_db(monkeypatch)

    class PaddleBoom(RuntimeError):
        pass

    class PypdfBoom(ValueError):
        pass

    paddle = _FakePaddleRaise(PaddleBoom("paddle exploded"))

    def pypdf_explode(_p):
        raise PypdfBoom("pypdf also broken")

    monkeypatch.setattr(pdf_mod, "_extract_pypdf", pypdf_explode)
    with pytest.raises(PaddleBoom, match="paddle exploded"):
        extract_pdf(pdf, ocr_backend=paddle)


def test_zero_chars_across_pages_raises(tmp_path: Path, monkeypatch):
    """Paddle returns 0 chars across all pages → RuntimeError, no cache row."""
    pdf = _write_pdf(tmp_path, "x.pdf", _make_empty_pdf())
    state = _patch_db(monkeypatch)
    # Paddle "succeeds" but yields nothing; pypdf also empty so we don't accidentally
    # cover the failure with a fallback success.
    paddle = _FakePaddleZero()
    monkeypatch.setattr(pdf_mod, "_extract_pypdf", lambda p: ("", [0, 0]))
    with pytest.raises(RuntimeError):
        extract_pdf(pdf, ocr_backend=paddle)
    assert state["inserts"] == [], "no cache row may be written for zero-char extraction"


def test_cache_invalidation_on_version_bump(tmp_path: Path, monkeypatch):
    """Old paddle-vl-1.5-default rows must NOT serve a current paddle-primary lookup.

    Lookup is keyed by (sha, PADDLE_MODEL_VERSION). An old row stored under a
    different model_version simply doesn't match — we model that as the lookup
    returning None — so paddle re-runs and inserts under the new version.
    """
    pdf = _write_pdf(tmp_path, "x.pdf", _make_empty_pdf())
    state = _patch_db(monkeypatch, lookup_returns=[None])
    paddle = _FakePaddleOk(text="# fresh", pages=1)
    res = extract_pdf(pdf, ocr_backend=paddle)
    assert paddle.calls == 1
    assert res.cache_hit is False
    assert res.model_version == PADDLE_MODEL_VERSION
    assert len(state["inserts"]) == 1
    assert state["inserts"][0]["model_version"] == PADDLE_MODEL_VERSION
