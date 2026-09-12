"""Vision OCR: page selection, strip rendering, and the pdf.py dispatch."""
from __future__ import annotations

from pathlib import Path

import pytest

from supagraf.enrich import vision_ocr


def test_choose_pages_short_doc_is_full():
    assert vision_ocr.choose_pages(3) == ([0, 1, 2], False)


def test_choose_pages_long_doc_head_tail():
    pages, omitted = vision_ocr.choose_pages(40)
    assert omitted
    assert pages[: vision_ocr.MAX_HEAD_PAGES] == list(range(vision_ocr.MAX_HEAD_PAGES))
    assert pages[-vision_ocr.MAX_TAIL_PAGES:] == [36, 37, 38, 39]


def _scan_pdf(path: Path) -> Path:
    """A one-page PDF whose only content is a raster image (no text layer)."""
    import fitz

    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 200, 200), False)
    pix.clear_with(255)
    page.insert_image(fitz.Rect(50, 50, 250, 250), pixmap=pix)
    doc.save(str(path))
    doc.close()
    return path


def test_render_page_strips_overlap_and_count(tmp_path):
    import fitz

    pdf = _scan_pdf(tmp_path / "scan.pdf")
    with fitz.open(pdf) as doc:
        strips = vision_ocr.render_page_strips(doc.load_page(0), dpi=72, strips=3)
    assert len(strips) == 3
    assert all(s.startswith(b"\x89PNG") for s in strips)


def test_transcribe_pdf_one_call_per_page_and_per_page_counts(tmp_path, monkeypatch):
    from supagraf.enrich.llm import TokenUsage

    pdf = _scan_pdf(tmp_path / "scan.pdf")
    monkeypatch.setattr(vision_ocr, "vision_ocr_available", lambda: True)
    seen: list[tuple[int, int | None]] = []

    def fake_call(*, model, system, user_text, images, timeout_s=0, thinking="off", max_tokens=None):
        seen.append((len(images), max_tokens))
        return "Druk nr 123\nPodpisali: (-) Jan Kowalski", TokenUsage(input_tokens=10, output_tokens=20)

    monkeypatch.setattr(vision_ocr, "call_vision_text", fake_call)
    text, per_page = vision_ocr.transcribe_pdf(pdf)
    assert per_page == [len("Druk nr 123\nPodpisali: (-) Jan Kowalski")]
    assert "<!-- page 1 -->" in text
    assert seen == [(vision_ocr.STRIPS_PER_PAGE, vision_ocr.MAX_TOKENS_PER_PAGE)]


def test_transcribe_pdf_raises_when_unavailable(tmp_path, monkeypatch):
    monkeypatch.setattr(vision_ocr, "vision_ocr_available", lambda: False)
    with pytest.raises(vision_ocr.VisionOcrUnavailable):
        vision_ocr.transcribe_pdf(_scan_pdf(tmp_path / "s.pdf"))


def test_extract_pdf_routes_scan_to_vision_then_caches(tmp_path, monkeypatch):
    from supagraf.enrich import pdf as pdf_mod

    scan = _scan_pdf(tmp_path / "scan.pdf")
    inserted: list[tuple] = []
    monkeypatch.setattr(pdf_mod, "_cache_lookup", lambda sha, ver: None)
    monkeypatch.setattr(pdf_mod, "_cache_insert", lambda *a: inserted.append(a))
    monkeypatch.setattr(vision_ocr, "vision_ocr_available", lambda: True)
    monkeypatch.setattr(vision_ocr, "transcribe_pdf", lambda p: ("<!-- page 1 -->\nOCR", [3]))

    res = pdf_mod.extract_pdf(scan)
    assert res.model_version == vision_ocr.VISION_OCR_MODEL_VERSION
    assert res.ocr_used and res.text.endswith("OCR")
    assert inserted and inserted[0][1] == vision_ocr.VISION_OCR_MODEL_VERSION


def test_extract_pdf_falls_back_to_tesseract_when_vision_fails(tmp_path, monkeypatch):
    from supagraf.enrich import pdf as pdf_mod

    scan = _scan_pdf(tmp_path / "scan.pdf")
    monkeypatch.setattr(pdf_mod, "_cache_lookup", lambda sha, ver: None)
    monkeypatch.setattr(pdf_mod, "_cache_insert", lambda *a: None)
    monkeypatch.setattr(pdf_mod, "TESSERACT_ENABLED", True)
    monkeypatch.setattr(vision_ocr, "vision_ocr_available", lambda: True)

    def boom(p):
        raise RuntimeError("vision down")

    monkeypatch.setattr(vision_ocr, "transcribe_pdf", boom)
    monkeypatch.setattr(pdf_mod, "_extract_tesseract", lambda p: ("tess", [4]))
    res = pdf_mod.extract_pdf(scan)
    assert res.model_version == pdf_mod.TESSERACT_MODEL_VERSION
    assert res.text == "tess"


def test_mixed_pdf_preserves_native_text_and_only_pays_for_scan(tmp_path, monkeypatch):
    import fitz
    from supagraf.enrich.llm import TokenUsage
    path = tmp_path / "mixed.pdf"
    with fitz.open() as doc:
        doc.new_page().insert_text((72, 72), "Native legal text")
        doc.new_page()
        doc.save(path)
    monkeypatch.setattr(vision_ocr, "vision_ocr_available", lambda: True)
    calls = []
    def fake_call(**kwargs):
        calls.append(kwargs)
        return "Scanned attachment", TokenUsage(input_tokens=10, output_tokens=4)
    monkeypatch.setattr(vision_ocr, "call_vision_text", fake_call)
    text, counts = vision_ocr.transcribe_pdf(path, native_pages=["Native legal text", ""])
    assert len(calls) == 1
    assert counts == [len("Native legal text"), len("Scanned attachment")]
    assert text.index("Native legal text") < text.index("Scanned attachment")


def test_layout_failure_uses_source_text_without_implicit_ocr(tmp_path, monkeypatch):
    import fitz
    import pymupdf4llm
    from supagraf.enrich import pdf as pdf_mod
    path = tmp_path / "text.pdf"
    with fitz.open() as doc:
        doc.new_page().insert_text((72, 72), "Article 1: verified source text")
        doc.save(path)
    def fail(*args, **kwargs):
        assert kwargs["use_ocr"] is False
        raise RuntimeError("broken layout")
    monkeypatch.setattr(pymupdf4llm, "to_markdown", fail)
    # Exercise the pure worker implementation so the monkeypatch stays local.
    text, counts = pdf_mod._extract_pymupdf.__wrapped__(path)
    assert "Article 1: verified source text" in text
    assert counts == [len(text)]


def test_incomplete_legacy_extract_is_not_reused(tmp_path, monkeypatch):
    from supagraf.enrich import pdf as pdf_mod
    path = tmp_path / "mixed.pdf"
    path.write_bytes(b"test source identity")
    old = {"text": "cover", "page_count": 2, "ocr_used": False, "char_count_per_page": [5, 0]}
    monkeypatch.setattr(pdf_mod, "_cache_lookup", lambda sha, ver: old if ver == pdf_mod.LEGACY_PYMUPDF_MODEL_VERSION else None)
    monkeypatch.setattr(pdf_mod, "_cache_insert", lambda *args: None)
    monkeypatch.setattr(pdf_mod, "_extract_pymupdf", lambda path: ("cover", [5, 0]))
    monkeypatch.setattr(pdf_mod, "_native_pages", lambda path: ["cover", ""])
    monkeypatch.setattr(pdf_mod, "_extract_scan", lambda path, native_pages: ("cover and attachment", [5, 14], vision_ocr.VISION_OCR_MODEL_VERSION))
    result = pdf_mod.extract_pdf(path)
    assert result.ocr_used and not result.cache_hit
    assert result.text == "cover and attachment"
    assert result.model_version.endswith("-mixed")
