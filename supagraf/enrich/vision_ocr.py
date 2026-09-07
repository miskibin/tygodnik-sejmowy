"""Scanned-PDF transcription with the DeepSeek vision model.

Roughly a quarter of Sejm prints are scans (signed transmittal letters,
opinions, Senate resolutions) with no text layer. Historically those went
through Tesseract+`pol` (fine on clean typewriter pages, poor on stamps,
handwriting, tables and faxed copies). `deepseek-v4-flash-vision-exp` reads
them as images at flash prices, so it is now the primary OCR path; Tesseract
stays as the fallback when the vision call fails or is disabled.

Token budget facts that shape this module (api-docs.deepseek.com/guides/vision):
  * every image is resized to ~640k pixels and costs at most 384 tokens —
    a whole A4 page collapses to ~110 DPI, too coarse for 10-pt Polish text;
  * up to 600 images per request.
So each page is rasterized at `VISION_DPI` and cut into `STRIPS_PER_PAGE`
horizontal strips with a small overlap. Three strips ≈ 1150 tokens/page and
~140 DPI effective resolution — comfortably legible for typed legal text.

One request per page keeps outputs short and gives exact per-page char
counts for the `pdf_extracts` cache row (`model_version` =
`VISION_OCR_MODEL_VERSION`). Long scans are trimmed head+tail
(`MAX_HEAD_PAGES` + `MAX_TAIL_PAGES`) with an omission marker — the same
strategy the paddle path used.
"""
from __future__ import annotations

import io
import os
from pathlib import Path

from loguru import logger

from supagraf.enrich import DEFAULT_LLM_BACKEND, LLM_MODELS
from supagraf.enrich.llm import LLMHTTPError, LLMResponseError, call_vision_text

VISION_OCR_MODEL = os.environ.get("SUPAGRAF_VISION_OCR_MODEL", LLM_MODELS["vision"])
VISION_OCR_MODEL_VERSION = f"{VISION_OCR_MODEL}-ocr-v1"
VISION_OCR_ENABLED = os.environ.get("SUPAGRAF_VISION_OCR", "1") not in ("0", "false", "")
VISION_DPI = int(os.environ.get("SUPAGRAF_VISION_DPI", "200"))
STRIPS_PER_PAGE = int(os.environ.get("SUPAGRAF_VISION_STRIPS", "3"))
STRIP_OVERLAP_PX = 48
MAX_HEAD_PAGES = int(os.environ.get("SUPAGRAF_VISION_MAX_HEAD_PAGES", "20"))
MAX_TAIL_PAGES = 4
# A transcript is never longer than a few thousand tokens per page; 6k leaves
# headroom for dense tables without letting a looping model run away.
MAX_TOKENS_PER_PAGE = 6000

SYSTEM_PROMPT = (
    "Jesteś silnikiem OCR dla dokumentów Sejmu RP. Otrzymujesz jedną stronę "
    "zeskanowanego dokumentu pociętą na poziome paski (od góry do dołu, paski "
    "lekko na siebie zachodzą). Przepisz DOKŁADNIE cały tekst strony w kolejności "
    "czytania jako markdown: nagłówki jako `##`, listy jako `-`, tabele jako "
    "tabele markdown, pogrubienia jako `**`. Zachowaj polskie znaki diakrytyczne, "
    "numerację artykułów i paragrafów, daty, kwoty i podpisy (zapisz jako "
    "`(-) Imię Nazwisko`). Pieczątki i nieczytelne fragmenty oznacz `[nieczytelne]`. "
    "Tekst powtórzony na zakładce pasków przepisz tylko raz. Nie streszczaj, nie "
    "komentuj, nie dodawaj niczego od siebie — zwróć wyłącznie przepisany tekst."
)


class VisionOcrUnavailable(RuntimeError):
    """Vision OCR is disabled or the backend cannot serve it (config, not a page)."""


def vision_ocr_available() -> bool:
    if not VISION_OCR_ENABLED:
        return False
    if DEFAULT_LLM_BACKEND.lower() != "deepseek":
        return False
    if not os.environ.get("DEEPSEEK_API_KEY"):
        from supagraf.db import load_dotenv
        load_dotenv()
    return bool(os.environ.get("DEEPSEEK_API_KEY"))


def choose_pages(page_count: int) -> tuple[list[int], bool]:
    """Indexes to transcribe and whether the middle was omitted."""
    if page_count <= MAX_HEAD_PAGES + MAX_TAIL_PAGES:
        return list(range(page_count)), False
    head = list(range(MAX_HEAD_PAGES))
    tail = list(range(page_count - MAX_TAIL_PAGES, page_count))
    return head + tail, True


def render_page_strips(page, *, dpi: int = VISION_DPI, strips: int = STRIPS_PER_PAGE) -> list[bytes]:
    """Rasterize one pymupdf page and cut it into overlapping PNG strips."""
    import fitz  # type: ignore[import-not-found]

    zoom = dpi / 72.0
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
    if strips <= 1:
        return [pix.tobytes("png")]
    from PIL import Image

    img = Image.open(io.BytesIO(pix.tobytes("png")))
    w, h = img.size
    step = h / strips
    out: list[bytes] = []
    for i in range(strips):
        top = max(0, int(i * step) - (STRIP_OVERLAP_PX if i else 0))
        bottom = min(h, int((i + 1) * step) + (STRIP_OVERLAP_PX if i < strips - 1 else 0))
        buf = io.BytesIO()
        img.crop((0, top, w, bottom)).save(buf, format="PNG", optimize=True)
        out.append(buf.getvalue())
    return out


def transcribe_page(images: list[bytes], *, page_no: int, page_total: int) -> str:
    text, usage = call_vision_text(
        model=VISION_OCR_MODEL,
        system=SYSTEM_PROMPT,
        user_text=(
            f"Strona {page_no} z {page_total}. Paski od góry do dołu: {len(images)}. "
            "Zwróć przepisany tekst tej strony."
        ),
        images=images,
        thinking="off",
        max_tokens=MAX_TOKENS_PER_PAGE,
    )
    logger.debug(
        "vision-ocr page {}/{}: in={} out={} cache_hit={}",
        page_no, page_total, usage.input_tokens, usage.output_tokens, usage.cache_hit_tokens,
    )
    return text.strip()


def transcribe_pdf(path: Path) -> tuple[str, list[int]]:
    """OCR a scanned PDF page by page. Returns (markdown, chars_per_page).

    `chars_per_page` has one entry per *source* page (omitted middle pages
    report 0) so the pdf_extracts CHECK on array length holds.
    Raises VisionOcrUnavailable (a RuntimeError) when the path is disabled and
    RuntimeError when a page fails, so the caller can fall back to Tesseract.
    """
    if not vision_ocr_available():
        raise VisionOcrUnavailable("vision OCR disabled or DEEPSEEK_API_KEY missing")
    import fitz  # type: ignore[import-not-found]

    parts: list[str] = []
    with fitz.open(path) as doc:
        page_count = doc.page_count
        wanted, omitted = choose_pages(page_count)
        per_page = [0] * page_count
        for idx in wanted:
            if omitted and idx == page_count - MAX_TAIL_PAGES:
                parts.append(
                    f"\n\n<!-- pages {MAX_HEAD_PAGES + 1}..{page_count - MAX_TAIL_PAGES} omitted; "
                    f"first {MAX_HEAD_PAGES} + last {MAX_TAIL_PAGES} only ({VISION_OCR_MODEL_VERSION}) -->\n\n"
                )
            strips = render_page_strips(doc.load_page(idx))
            try:
                text = transcribe_page(strips, page_no=idx + 1, page_total=page_count)
            except (LLMHTTPError, LLMResponseError) as e:
                raise RuntimeError(f"vision OCR failed on page {idx + 1} of {path.name}: {e}") from e
            per_page[idx] = len(text)
            parts.append(f"<!-- page {idx + 1} -->\n{text}")
    if sum(per_page) == 0:
        raise RuntimeError(f"vision OCR returned 0 chars across {page_count} pages for {path.name}")
    return "\n\n".join(parts), per_page
