"""Print document → text, cached in `pdf_extracts` by (sha256, model_version).

Dispatch:
  .docx                → python-docx                 DOCX_MODEL_VERSION
  .pdf with text layer → pymupdf4llm markdown        PYMUPDF_MODEL_VERSION
  .pdf scan            → DeepSeek vision transcript  vision_ocr.VISION_OCR_MODEL_VERSION
  .pdf scan, no vision → Tesseract + pol             TESSERACT_MODEL_VERSION

Cache rows are append-only: a new model_version adds a row, old ones stay
for audit.
"""
from __future__ import annotations

import hashlib
import io
import os
from pathlib import Path

import fitz  # pymupdf
from loguru import logger
from pydantic import BaseModel
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from supagraf.db import DB_RETRY_EXC, supabase
from supagraf.enrich.pdf_worker import pdf_task

LEGACY_PYMUPDF_MODEL_VERSION = f"pymupdf-{fitz.__version__}-md-primary"
PYMUPDF_MODEL_VERSION = f"pymupdf-{fitz.__version__}-md-text-fallback-v3"
DOCX_MODEL_VERSION = "python-docx-1.2-primary"
TESSERACT_MODEL_VERSION = "tesseract-5.5-pol-fallback"
TESSERACT_DPI = int(os.environ.get("SUPAGRAF_TESSERACT_DPI", "300"))
TESSERACT_LANG = os.environ.get("SUPAGRAF_TESSERACT_LANG", "pol")
TESSERACT_ENABLED = os.environ.get("SUPAGRAF_TESSERACT_ENABLED", "1") not in ("0", "false", "")

_COVER_KEYWORDS = ("wnioskodawc", "podpisał", "podpisali", "wniosek poselski wnoszą",
                   "poselski projekt ustawy wnoszą", "(-)")


class ExtractionResult(BaseModel):
    sha256: str
    text: str
    page_count: int
    ocr_used: bool
    char_count_per_page: list[int]
    model_version: str
    cache_hit: bool


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


@retry(retry=retry_if_exception_type(DB_RETRY_EXC), stop=stop_after_attempt(4),
       wait=wait_exponential(multiplier=1, min=1, max=8), reraise=True)
def _cache_lookup(sha: str, model_version: str) -> dict | None:
    r = (supabase().table("pdf_extracts").select("text, page_count, ocr_used, char_count_per_page")
         .eq("sha256", sha).eq("model_version", model_version).limit(1).execute())
    return (r.data or [None])[0]


@retry(retry=retry_if_exception_type(DB_RETRY_EXC), stop=stop_after_attempt(4),
       wait=wait_exponential(multiplier=1, min=1, max=8), reraise=True)
def _cache_insert(sha: str, model_version: str, text: str, ocr_used: bool, per_page: list[int]) -> None:
    supabase().table("pdf_extracts").upsert(
        {"sha256": sha, "model_version": model_version, "text": text, "page_count": len(per_page),
         "ocr_used": ocr_used, "char_count_per_page": per_page},
        on_conflict="sha256,model_version").execute()


def _extract_docx(path: Path) -> tuple[str, list[int]]:
    import docx

    d = docx.Document(str(path))
    parts = [p.text for p in d.paragraphs if p.text]
    for table in d.tables:
        for row in table.rows:
            cells = [c.text.strip() for c in row.cells]
            if any(cells):
                parts.append(" | ".join(cells))
    text = "\n\n".join(parts).strip()
    if not text:
        raise RuntimeError(f"docx returned 0 chars for {path.name}")
    return text, [len(text)]


@pdf_task
def _extract_pymupdf(path: Path) -> tuple[str, list[int]]:
    """Markdown for text-layer pages; ('', per_page) when the PDF is a scan."""
    import pymupdf4llm

    with fitz.open(path) as doc:
        native_pages = [p.get_text("text").strip() for p in doc]
        per_page = [len(p) for p in native_pages]
    if not sum(per_page):
        return "", per_page
    text_pages = [i for i, n in enumerate(per_page) if n]
    try:
        text = pymupdf4llm.to_markdown(str(path), pages=text_pages, show_progress=False, use_ocr=False)
        if text.strip():
            return text, per_page
    except Exception as exc:
        logger.warning("PDF layout extraction failed for {}: {}; using native text", path.name, exc)
    return "\n\n".join(native_pages), per_page


@pdf_task
def _native_pages(path: Path) -> list[str]:
    with fitz.open(path) as doc:
        return [p.get_text("text").strip() for p in doc]


@pdf_task
def _extract_tesseract(path: Path, native_pages: list[str] | None = None) -> tuple[str, list[int]]:
    import pytesseract
    from PIL import Image

    matrix = fitz.Matrix(TESSERACT_DPI / 72, TESSERACT_DPI / 72)
    pages: list[str] = []
    with fitz.open(path) as doc:
        for idx, page in enumerate(doc):
            if native_pages and native_pages[idx]:
                pages.append(native_pages[idx])
                continue
            png = page.get_pixmap(matrix=matrix, alpha=False).tobytes("png")
            pages.append(pytesseract.image_to_string(Image.open(io.BytesIO(png)), lang=TESSERACT_LANG).strip())
    if not any(pages):
        raise RuntimeError(f"tesseract OCR returned 0 chars for {path.name}")
    return "\n\n".join(pages), [len(p) for p in pages]


def _extract_scan(path: Path, native_pages: list[str] | None = None) -> tuple[str, list[int], str]:
    """Vision OCR first (cheap, best on stamps/tables), Tesseract fallback."""
    from supagraf.enrich import vision_ocr

    if vision_ocr.vision_ocr_available():
        try:
            text, per_page = (vision_ocr.transcribe_pdf(path, native_pages=native_pages)
                              if native_pages else vision_ocr.transcribe_pdf(path))
            return text, per_page, vision_ocr.VISION_OCR_MODEL_VERSION
        except RuntimeError as e:  # transcription failed after retries
            logger.warning("vision OCR failed for {}: {} — falling back", path.name, e)
    if not TESSERACT_ENABLED:
        raise RuntimeError(f"{path.name} has no text layer and no OCR path is enabled")
    text, per_page = (_extract_tesseract(path, native_pages=native_pages)
                      if native_pages else _extract_tesseract(path))
    return text, per_page, TESSERACT_MODEL_VERSION


def extract_pdf(path: Path) -> ExtractionResult:
    """Extract every available source page, reusing complete cached results."""
    if not path.exists():
        raise FileNotFoundError(path)
    sha = _sha256(path)
    is_docx = path.suffix.lower() == ".docx"
    version = DOCX_MODEL_VERSION if is_docx else PYMUPDF_MODEL_VERSION
    if cached := _cache_lookup(sha, version):
        return ExtractionResult(sha256=sha, model_version=version, cache_hit=True, **cached)
    if not is_docx:
        # Older mixed PDFs silently omitted scans. Reuse complete text-only
        # caches while allowing incomplete documents to be repaired.
        legacy = _cache_lookup(sha, LEGACY_PYMUPDF_MODEL_VERSION)
        if legacy and legacy.get("char_count_per_page") and all(legacy["char_count_per_page"]):
            return ExtractionResult(sha256=sha, model_version=LEGACY_PYMUPDF_MODEL_VERSION,
                                    cache_hit=True, **legacy)
    if is_docx:
        text, per_page, ocr = *_extract_docx(path), False
    else:
        text, per_page = _extract_pymupdf(path)
        ocr = False
        if not text or any(n == 0 for n in per_page):
            from supagraf.enrich import vision_ocr

            mixed = bool(text)
            def scan_version(model):
                return f"{PYMUPDF_MODEL_VERSION}+{model}-mixed" if mixed else model
            for model in (vision_ocr.VISION_OCR_MODEL_VERSION, TESSERACT_MODEL_VERSION):
                if cached := _cache_lookup(sha, scan_version(model)):
                    return ExtractionResult(sha256=sha, model_version=scan_version(model),
                                            cache_hit=True, **cached)
            text, per_page, model = (_extract_scan(path, native_pages=_native_pages(path))
                                     if mixed else _extract_scan(path))
            version = scan_version(model)
            ocr = True
    _cache_insert(sha, version, text, ocr, per_page)
    return ExtractionResult(sha256=sha, text=text, page_count=len(per_page), ocr_used=ocr,
                            char_count_per_page=per_page, model_version=version, cache_hit=False)


@pdf_task
def extract_pdf_cover(pdf_path: Path, max_pages: int = 2) -> str:
    """Plain text of the first pages — the signers list of a poselski projekt.

    If the requested depth misses the signers block, look two pages deeper
    once (a long preamble can push "Wnioskodawcy" past page 2)."""
    if not pdf_path.exists():
        return ""
    with fitz.open(pdf_path) as doc:
        text = "\n\n".join(doc.load_page(i).get_text("text") for i in range(min(max_pages, doc.page_count))).strip()
        deeper = doc.page_count > max_pages
    if text and max_pages < 4 and deeper and not any(k in text.lower() for k in _COVER_KEYWORDS):
        return extract_pdf_cover(pdf_path, max_pages=4)
    return text
