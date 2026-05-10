"""Unit tests for long-PDF slicing in supagraf.enrich.pdf.

Covers:
* Pure ``_slice_pages`` helper across boundary cases (1, 9, 10, 11, 50 pages).
* End-to-end ``extract_pdf`` flow with a fake paddle backend, asserting:
  - short docs use full strategy and cache under PADDLE_MODEL_VERSION
  - long docs use first8_last2 and cache under PADDLE_MODEL_VERSION_SLICED
  - the markdown carries the omission marker + header comment
  - the temp sliced PDF actually contains 10 pages (verified by counting what
    the fake backend was fed)
"""
from __future__ import annotations

import io
from pathlib import Path

import pytest
from pypdf import PdfReader, PdfWriter

from supagraf.enrich import pdf as pdf_mod
from supagraf.enrich.pdf import (
    PADDLE_MODEL_VERSION,
    PADDLE_MODEL_VERSION_SLICED,
    SLICE_HEAD_PAGES,
    SLICE_TAIL_PAGES,
    SLICE_THRESHOLD_PAGES,
    _should_slice,
    _slice_pages,
    extract_pdf,
)


# ---------- _slice_pages pure helper ----------

@pytest.mark.parametrize("n", [1, 5, 9, 10])
def test_slice_pages_short_returns_full(n: int):
    pages = list(range(n))
    out, label = _slice_pages(pages, n)
    assert out == pages
    assert label == "full"
    assert _should_slice(n) is False


def test_slice_pages_threshold_boundary_is_full():
    """page_count == SLICE_THRESHOLD_PAGES must NOT trigger slice (strict ``>``)."""
    n = SLICE_THRESHOLD_PAGES
    pages = list(range(n))
    out, label = _slice_pages(pages, n)
    assert label == "full"
    assert out == pages


def test_slice_pages_just_over_threshold():
    """11-page doc → first 8 + last 2, label first8_last2."""
    n = SLICE_THRESHOLD_PAGES + 1  # 11
    pages = list(range(n))
    out, label = _slice_pages(pages, n)
    assert label == "first8_last2"
    assert out == [0, 1, 2, 3, 4, 5, 6, 7, 9, 10]
    assert len(out) == SLICE_HEAD_PAGES + SLICE_TAIL_PAGES


def test_slice_pages_long_doc():
    """50-page doc → still 10 pages (first 8 + last 2)."""
    n = 50
    pages = list(range(n))
    out, label = _slice_pages(pages, n)
    assert label == "first8_last2"
    assert out == [0, 1, 2, 3, 4, 5, 6, 7, 48, 49]
    assert len(out) == 10


def test_slice_pages_very_long():
    """219-page doc (real eli/DU/2026/592 fixture has this many)."""
    n = 219
    pages = list(range(n))
    out, label = _slice_pages(pages, n)
    assert label == "first8_last2"
    assert out[:SLICE_HEAD_PAGES] == list(range(8))
    assert out[-SLICE_TAIL_PAGES:] == [217, 218]


# ---------- _should_slice ----------

def test_should_slice_boundaries():
    assert _should_slice(0) is False
    assert _should_slice(1) is False
    assert _should_slice(SLICE_THRESHOLD_PAGES) is False  # 10 → False
    assert _should_slice(SLICE_THRESHOLD_PAGES + 1) is True  # 11 → True
    assert _should_slice(100) is True


# ---------- helpers for end-to-end ----------

def _make_pdf(n_pages: int) -> bytes:
    writer = PdfWriter()
    for _ in range(n_pages):
        writer.add_blank_page(width=612, height=792)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def _write_pdf(tmp_path: Path, name: str, data: bytes) -> Path:
    p = tmp_path / name
    p.write_bytes(data)
    return p


class _FakePaddleCountingPages:
    """Fake paddle backend — records the page count of whatever PDF it sees.

    Returns one ``"page <i>"`` chunk per page so downstream splice logic has a
    realistic per-page text to work with.
    """

    def __init__(self):
        self.calls: list[int] = []  # page count seen on each call

    def extract(self, pdf_path: Path) -> tuple[str, list[int]]:
        n = len(PdfReader(str(pdf_path)).pages)
        self.calls.append(n)
        chunks = [f"# page {i}\n\nbody {i}" for i in range(n)]
        text = "\n\n".join(chunks)
        per_page = [len(c) for c in chunks]
        return text, per_page


def _patch_db(monkeypatch):
    """Same as the in-tree test_pdf_extract helper — minimal stub."""
    state = {"inserts": [], "lookup_calls": 0}

    def fake_lookup(sha, model_version):
        state["lookup_calls"] += 1
        state.setdefault("lookup_versions", []).append(model_version)
        return None

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


# ---------- end-to-end extract_pdf with slicing ----------

def test_short_pdf_uses_full_strategy(tmp_path: Path, monkeypatch):
    """5-page PDF: full extract, classic model_version, no marker in markdown."""
    pdf = _write_pdf(tmp_path, "short.pdf", _make_pdf(5))
    state = _patch_db(monkeypatch)
    paddle = _FakePaddleCountingPages()
    res = extract_pdf(pdf, ocr_backend=paddle)
    assert paddle.calls == [5], "paddle should have seen the original 5-page PDF"
    assert res.model_version == PADDLE_MODEL_VERSION
    assert res.page_count == 5
    assert "omitted" not in res.text
    assert "strategy=" not in res.text
    assert state["inserts"][0]["model_version"] == PADDLE_MODEL_VERSION
    assert state["lookup_versions"] == [PADDLE_MODEL_VERSION]


def test_threshold_boundary_pdf_uses_full_strategy(tmp_path: Path, monkeypatch):
    """10-page PDF (= threshold): still full, NO slicing."""
    pdf = _write_pdf(tmp_path, "ten.pdf", _make_pdf(10))
    _patch_db(monkeypatch)
    paddle = _FakePaddleCountingPages()
    res = extract_pdf(pdf, ocr_backend=paddle)
    assert paddle.calls == [10]
    assert res.model_version == PADDLE_MODEL_VERSION
    assert res.page_count == 10
    assert "omitted" not in res.text


def test_long_pdf_triggers_slice(tmp_path: Path, monkeypatch):
    """50-page PDF: paddle sees only 10 pages (sliced temp PDF)."""
    pdf = _write_pdf(tmp_path, "long.pdf", _make_pdf(50))
    state = _patch_db(monkeypatch)
    paddle = _FakePaddleCountingPages()
    res = extract_pdf(pdf, ocr_backend=paddle)
    # Paddle was given a 10-page PDF, never the original 50.
    assert paddle.calls == [SLICE_HEAD_PAGES + SLICE_TAIL_PAGES]
    assert res.model_version == PADDLE_MODEL_VERSION_SLICED
    assert res.page_count == 10
    # Header comment + omission marker present.
    assert "strategy=first8_last2" in res.text
    assert "source_pages=50" in res.text
    assert "pages 9..48 omitted" in res.text
    # Cache row tagged with sliced model_version.
    assert state["inserts"][0]["model_version"] == PADDLE_MODEL_VERSION_SLICED
    assert state["lookup_versions"] == [PADDLE_MODEL_VERSION_SLICED]


def test_just_over_threshold_pdf_triggers_slice(tmp_path: Path, monkeypatch):
    """11-page PDF: still slices (boundary check)."""
    pdf = _write_pdf(tmp_path, "eleven.pdf", _make_pdf(11))
    _patch_db(monkeypatch)
    paddle = _FakePaddleCountingPages()
    res = extract_pdf(pdf, ocr_backend=paddle)
    assert paddle.calls == [10]
    assert res.model_version == PADDLE_MODEL_VERSION_SLICED
    assert "source_pages=11" in res.text
    assert "pages 9..9 omitted" in res.text


def test_sliced_cache_row_separate_from_full(tmp_path: Path, monkeypatch):
    """A sliced extract MUST cache under the sliced model_version key, not the
    full one. Lookup also must query the sliced key — verifying that a stale
    full-extract row would not satisfy a slice request (the cache key family
    is what isolates them)."""
    pdf = _write_pdf(tmp_path, "long2.pdf", _make_pdf(20))
    state = _patch_db(monkeypatch)
    paddle = _FakePaddleCountingPages()
    extract_pdf(pdf, ocr_backend=paddle)
    assert state["lookup_versions"] == [PADDLE_MODEL_VERSION_SLICED], (
        "lookup must query the sliced model_version, not the full one"
    )
    assert state["inserts"][0]["model_version"] == PADDLE_MODEL_VERSION_SLICED


# ---------- real fixture (long PDF) ----------

LONG_FIXTURE = Path(__file__).resolve().parents[3] / "fixtures" / "sejm" / "prints" / "2082-A__2082-A.pdf"


@pytest.mark.skipif(not LONG_FIXTURE.exists(), reason="long fixture not present")
def test_real_long_fixture_slices_to_ten_pages(tmp_path: Path, monkeypatch):
    """End-to-end on the 61-page 2082-A fixture: faked paddle, real slicing."""
    state = _patch_db(monkeypatch)
    paddle = _FakePaddleCountingPages()
    res = extract_pdf(LONG_FIXTURE, ocr_backend=paddle)
    # Paddle saw exactly 10 pages from the sliced temp PDF.
    assert paddle.calls == [10]
    assert res.model_version == PADDLE_MODEL_VERSION_SLICED
    assert res.page_count == 10
    assert "strategy=first8_last2" in res.text
    # Real source has 61 pages → header records source_pages=61.
    assert "source_pages=61" in res.text
    assert state["inserts"][0]["per_page_len"] == 10
