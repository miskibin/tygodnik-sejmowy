"""Fetch + extract MP office expense reports (sprawozdania wydatków biur poselskich).

The Sejm API has NO endpoint for these — they are published as PDFs hosted on
`orka.sejm.gov.pl/BOP_info.nsf/...`. The form is standardized (Załącznik nr 1
do zarządzenia nr 2 Marszałka Sejmu z 31 marca 2017 r.), so we can extract the
4 header amounts + 23 category rows + 2 footer totals via regex over pymupdf
text output.

Inputs are read from a manually-curated index file:
    fixtures/sejm/mp_office_expenses/_index.json
shape:
    [
      {
        "term": 10,
        "mp_id": 123,
        "year": 2025,
        "pdf_url": "https://orka.sejm.gov.pl/BOP_info.nsf/0/<HASH>/$file/za%C5%82%201.pdf",
        "published_at": "2026-05-19",          // optional
        "approved_by_presidium_at": "2026-05-15"   // optional
      },
      ...
    ]

For each entry we:
  1) GET the PDF (browser-style User-Agent — `supagraf/1.0` is rejected by orka.sejm.gov.pl)
  2) cache to ~/.cache/supagraf/mp_office_expenses/{sha256}.pdf
  3) extract text via pymupdf
  4) parse the standardized form (regex over Lp.|amount rows)
  5) write fixtures/sejm/mp_office_expenses/{term}/{mp_id}_{year}.json

The Pydantic-validated fixture JSON is what `stage_mp_office_expenses` later
upserts into _stage_mp_office_expenses. Parsing is best-effort: if a row is
unreadable, item.amount falls to 0 (numeric) and the report still loads —
better partial data than nothing.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

import httpx
from loguru import logger
from pydantic import BaseModel, Field
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from supagraf.fixtures.storage import fixtures_root

# orka.sejm.gov.pl rejects HEAD and short UAs (e.g. "supagraf/1.0"). A
# browser-style UA is required to get a 200 on GET. This is publicly-available
# data, just behind a basic bot filter.
USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0 Safari/537.36"
)
DEFAULT_THROTTLE_S = 1.0
DEFAULT_TIMEOUT_S = 60.0

PDF_CACHE_DIR = Path(
    os.environ.get(
        "SUPAGRAF_MP_OFFICE_EXPENSES_CACHE",
        str(Path.home() / ".cache" / "supagraf" / "mp_office_expenses"),
    )
)


class MPOfficeExpenseFetchError(RuntimeError):
    """Transient HTTP/network failure (5xx or transport)."""


class MPOfficeExpenseNotFound(Exception):
    """Upstream returned 404. Logged + skipped."""


@dataclass
class FetchReport:
    term: int = 10
    year: int = 2025
    entries_seen: int = 0
    pdf_fetched: int = 0
    pdf_from_cache: int = 0
    fixtures_written: int = 0
    errors: list[tuple[str, str]] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "term": self.term,
            "year": self.year,
            "entries_seen": self.entries_seen,
            "pdf_fetched": self.pdf_fetched,
            "pdf_from_cache": self.pdf_from_cache,
            "fixtures_written": self.fixtures_written,
            "errors": len(self.errors),
        }


# -------- atomic write --------

def _atomic_write_bytes(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".tmp-", dir=str(path.parent))
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        os.replace(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def _atomic_write_json(path: Path, payload: Any) -> None:
    body = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True, default=str).encode("utf-8")
    _atomic_write_bytes(path, body)


# -------- PDF fetch + cache --------

@retry(
    retry=retry_if_exception_type(MPOfficeExpenseFetchError),
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    reraise=True,
)
def _get_pdf(client: httpx.Client, url: str) -> bytes:
    try:
        r = client.get(url)
    except httpx.HTTPError as e:
        raise MPOfficeExpenseFetchError(f"transport error: {e!r}") from e
    if r.status_code == 404:
        raise MPOfficeExpenseNotFound(url)
    if r.status_code >= 500:
        raise MPOfficeExpenseFetchError(f"{r.status_code} {url}")
    r.raise_for_status()
    body = r.content
    if not body.startswith(b"%PDF"):
        raise MPOfficeExpenseFetchError(f"non-PDF body from {url} (first bytes: {body[:8]!r})")
    return body


def _cached_pdf_path(sha: str) -> Path:
    return PDF_CACHE_DIR / f"{sha}.pdf"


def fetch_pdf(client: httpx.Client, url: str) -> tuple[Path, str, bool]:
    """Returns (cache_path, sha256, from_cache_flag).

    Cache key is the sha256 of the URL (stable, lets us also retain bytes
    if URL changes — the bytes themselves get a second sha256 below).
    """
    url_sha = hashlib.sha256(url.encode("utf-8")).hexdigest()
    url_cache = PDF_CACHE_DIR / f"url-{url_sha[:16]}.pdf"
    if url_cache.exists() and url_cache.stat().st_size > 0:
        body_sha = hashlib.sha256(url_cache.read_bytes()).hexdigest()
        return url_cache, body_sha, True
    body = _get_pdf(client, url)
    body_sha = hashlib.sha256(body).hexdigest()
    _atomic_write_bytes(url_cache, body)
    return url_cache, body_sha, False


# -------- form parsing --------

# Row 1..23 amounts. The pymupdf text layout for the BOP form puts each row's
# Lp. number at the start of a line (or after the "Lp. Rodzaj wydatków Kwota
# Uwagi" header), then the category text wraps over a few lines, and the
# amount sits in its own line as e.g. "12 345,67" or "0,00" or "0" or blank.
#
# This regex finds the amount that ends a row block: a numeric like
# "12 345,67" / "1234,00" / "0" optionally followed by "zł". We map rows by
# the Lp. anchor (1..23) scanning text from top to bottom.
#
# Caveat: matches bare integers too (e.g. stray "2025" year, page number,
# telephone fragment). parse_pdf_text below takes the LAST numeric in each
# block, which on a row wrapping into "(2025 r.)" can pick up the year.
# Mitigated downstream: if all 23 amounts come out 0/low, _items_all_zero
# triggers the LLM fallback which sees the whole text and re-categorises.
_AMOUNT_RE = re.compile(
    r"(?P<amount>-?\d{1,3}(?:[\s ]\d{3})*(?:[,.]\d{1,2})?|0)"
)

# Polish-locale decimal: "12 345,67" → Decimal("12345.67")
def _parse_pl_decimal(s: str) -> Decimal | None:
    if s is None:
        return None
    s = s.strip()
    if not s:
        return None
    # strip "zł", non-breaking spaces, regular spaces, dots used as thousands
    s = s.replace(" ", "").replace(" ", "").replace("zł", "").replace("PLN", "")
    # If comma present, treat as decimal sep; if only dots, ambiguous — assume thousands
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    try:
        return Decimal(s)
    except InvalidOperation:
        return None


_HEADER_LINE_RE = re.compile(
    r"^\s*(?P<lp>\d{1,2})\s*[.)]?\s+(?P<rest>.+)$"
)

# Top of form: "Środki finansowe przekazane w okresie od dnia ... do dnia ... roku ............... zł"
_FUNDS_LINE_RE = {
    "funds_allocated": re.compile(
        r"\b(?:1\.|Środki finansowe przekazane).{0,200}?(?P<amount>-?[\d\s .,]+?)\s*zł",
        re.IGNORECASE | re.DOTALL,
    ),
    "funds_carryover": re.compile(
        r"\b(?:2\.|Środki finansowe niewykorzystane).{0,200}?(?P<amount>-?[\d\s .,]+?)\s*zł",
        re.IGNORECASE | re.DOTALL,
    ),
    "funds_interest": re.compile(
        r"\b(?:3\.|Odsetki).{0,200}?(?P<amount>-?[\d\s .,]+?)\s*zł",
        re.IGNORECASE | re.DOTALL,
    ),
    "funds_total": re.compile(
        r"\b(?:4\.|Środki finansowe do rozliczenia ogółem).{0,200}?(?P<amount>-?[\d\s .,]+?)\s*zł",
        re.IGNORECASE | re.DOTALL,
    ),
}


def parse_pdf_text(text: str) -> dict[str, Any]:
    """Best-effort parse of the standardized BOP form.

    Returns a partial dict with whatever fields we could read. The caller fills
    in mp_id/year/source_url from the index entry.

    Heuristic: split into lines, look for `^Lp.` lines for the 23 categories
    table, and use the dedicated header regexes for the 4 top funds + 2 footer
    totals. Missing amounts → not present in items list (caller fills 0 if
    needed). This is sufficient for the standardized digital PDFs; scans
    (rare for this resource) would need OCR.
    """
    out: dict[str, Any] = {"items": []}

    # funds_* — best-effort via labels
    for key, rx in _FUNDS_LINE_RE.items():
        m = rx.search(text)
        if m:
            val = _parse_pl_decimal(m.group("amount"))
            if val is not None:
                out[key] = str(val)

    # Footer "wydatkowano" / "pozostało"
    m_spent = re.search(
        r"wydatkowano\s+wg\s+powy\w+szego\s+zestawienia.{0,400}?(?P<amount>-?[\d\s .,]+?)\s*zł",
        text, re.IGNORECASE | re.DOTALL,
    )
    if m_spent:
        v = _parse_pl_decimal(m_spent.group("amount"))
        if v is not None:
            out["funds_spent"] = str(v)
    m_remain = re.search(
        r"pozosta\w+\s*[:.]?\s*(?P<amount>-?[\d\s .,]+?)\s*zł",
        text, re.IGNORECASE,
    )
    if m_remain:
        v = _parse_pl_decimal(m_remain.group("amount"))
        if v is not None:
            out["funds_remaining"] = str(v)

    # 23 category rows. We split text into "row blocks" by the Lp. anchors
    # 1..23, then take the first numeric amount in each block. The form has
    # exactly 23 fixed rows, so this is deterministic when the PDF is digital.
    lines = [ln.strip() for ln in text.splitlines()]
    # Find anchor positions: indices of lines whose first non-space token is
    # an integer 1..23 followed by '.' or whitespace. Filter the table region
    # by waiting for the header "Lp." line first.
    in_table = False
    anchors: list[tuple[int, int]] = []  # (lp, line_idx)
    for idx, ln in enumerate(lines):
        if not in_table:
            if re.match(r"^\s*Lp\.?\s+Rodzaj\s+wydatk", ln, re.IGNORECASE):
                in_table = True
            continue
        m = re.match(r"^(\d{1,2})\.\s*$", ln) or re.match(r"^(\d{1,2})\.\s+\S", ln)
        if m:
            lp = int(m.group(1))
            if 1 <= lp <= 23:
                # Only count the first occurrence of each Lp. (some forms
                # repeat headers across pages).
                if not any(existing == lp for existing, _ in anchors):
                    anchors.append((lp, idx))

    # Iterate anchors, grab amount text between anchor i and anchor i+1.
    # If our final anchor is 23 and form ends after it, slice till end-of-text
    # or till the "Ze środków finansowych do rozliczenia" footer.
    end_marker_idx = next(
        (i for i, ln in enumerate(lines) if "Ze środków finansowych do rozliczenia" in ln),
        len(lines),
    )

    for i, (lp, start_idx) in enumerate(anchors):
        next_idx = anchors[i + 1][1] if i + 1 < len(anchors) else end_marker_idx
        block = "\n".join(lines[start_idx:next_idx])
        # Take the LAST numeric in the block — column ordering puts amount
        # near the end (right column on the form).
        nums = _AMOUNT_RE.findall(block)
        amount: Decimal | None = None
        for cand in reversed(nums):
            # Skip the Lp. itself
            if cand.strip().isdigit() and 1 <= int(cand.strip()) <= 23 and cand.strip() == str(lp):
                continue
            parsed = _parse_pl_decimal(cand)
            if parsed is not None:
                amount = parsed
                break
        out["items"].append({
            "category_code": lp,
            "amount": str(amount if amount is not None else Decimal("0")),
        })

    # Pad missing categories with 0 so every report has all 23 items
    seen_codes = {it["category_code"] for it in out["items"]}
    for code in range(1, 24):
        if code not in seen_codes:
            out["items"].append({"category_code": code, "amount": "0"})
    out["items"].sort(key=lambda it: it["category_code"])
    return out


# Max pages to OCR on a single report. The BOP form table fits across pages 1-2;
# pages 3+ are just totals + signatures + optional "Inne wydatki" sub-list.
# Capping prevents wasted tesseract time on multi-page signature appendices.
MAX_OCR_PAGES = int(os.environ.get("SUPAGRAF_MP_EXPENSES_OCR_MAX_PAGES", "3"))
OCR_DPI = int(os.environ.get("SUPAGRAF_MP_EXPENSES_OCR_DPI", "220"))

def _ensure_omp_single_threaded() -> None:
    """Tesseract spawns a multi-threaded subprocess per call. With our 4
    workers in parallel that oversubscribes the 4 CPU cores massively
    (single-page OCR went from 1.4 s → 2.5 min empirically). Pinning per-
    instance to 1 thread lets the 4 workers map cleanly to 4 cores. Called
    from `fetch_mp_office_expenses()` so importing this module doesn't
    silently mutate global OMP env for unrelated workloads.
    """
    os.environ.setdefault("OMP_THREAD_LIMIT", "1")
    os.environ.setdefault("OMP_NUM_THREADS", "1")


def _extract_pdf_text(pdf_path: Path) -> str:
    """Get text from a PDF. Digital PDFs use pymupdf directly; scans (real
    BOP reports are MP-signed scans) auto-fallback to tesseract `pol`.

    DPI defaults to 220 (Polish form is readable at this resolution; ~2x faster
    than 300). First MAX_OCR_PAGES pages only — pages 3+ are signatures.
    """
    import pymupdf  # imported lazily — pymupdf is a heavy native dep
    doc = pymupdf.open(pdf_path)
    try:
        parts = []
        for i, page in enumerate(doc):
            if i >= MAX_OCR_PAGES:
                break
            t = page.get_text()
            if len(t.strip()) > 30:
                parts.append(t)
            else:
                parts.append(_ocr_page(page))
        return "\n".join(parts)
    finally:
        doc.close()


def _ocr_page(page) -> str:
    """OCR one pymupdf page via tesseract + Polish traineddata.

    Raises RuntimeError if tesseract or pytesseract is missing — install via
    `apt-get install tesseract-ocr tesseract-ocr-pol` and `uv add pytesseract pillow`.
    """
    try:
        import io
        import pytesseract
        from PIL import Image
    except ImportError as e:
        raise RuntimeError(
            "scan-PDF OCR requires `pytesseract` + `Pillow` (Python) and the "
            "`tesseract-ocr` + `tesseract-ocr-pol` system packages"
        ) from e
    pix = page.get_pixmap(dpi=OCR_DPI)
    img = Image.open(io.BytesIO(pix.tobytes("png")))
    # psm 4: single column of text of variable sizes — works well for BOP form
    return pytesseract.image_to_string(img, lang="pol", config="--psm 4")


# -------- LLM fallback for OCR'd reports --------
# Heuristic regex on OCR text is unreliable — column layout gets scrambled.
# We use deepseek-v4-flash (per CLAUDE.md: short structured outputs, ~10% of
# pro cost) to parse the standardized form. Invoked only when regex parser
# returns all-zeros (the digital-PDF template path stays fast and offline).

class _LLMExtractItem(BaseModel):
    category_code: int = Field(ge=1, le=23)
    amount: str
    notes: str | None = None


class _LLMExtractResult(BaseModel):
    funds_allocated: str | None = None
    funds_carryover: str | None = None
    funds_interest: str | None = None
    funds_total: str | None = None
    funds_spent: str | None = None
    funds_remaining: str | None = None
    items: list[_LLMExtractItem]


def llm_extract(text: str) -> dict[str, Any]:
    """Pass OCR text through deepseek-v4-flash → 23 categories + 6 funds fields.

    Returns dict shaped like parse_pdf_text() output. Falls back to all-zeros if
    DEEPSEEK_API_KEY is missing (caller will then ship raw report with empty
    items rather than failing the whole pipeline).
    """
    if not os.environ.get("DEEPSEEK_API_KEY"):
        logger.warning("DEEPSEEK_API_KEY missing — skipping LLM extract, items will be all-zero")
        return {"items": [{"category_code": c, "amount": "0"} for c in range(1, 24)]}

    from supagraf.enrich.llm import call_structured

    model = os.environ.get(
        "SUPAGRAF_MP_OFFICE_EXPENSES_LLM_MODEL",
        os.environ.get("SUPAGRAF_LLM_MODEL_FLASH", "deepseek-v4-flash"),
    )
    call = call_structured(
        model=model,
        prompt_name="mp_office_expense_extract",
        user_input=text,
        output_model=_LLMExtractResult,
    )
    result: _LLMExtractResult = call.parsed  # type: ignore[assignment]
    out: dict[str, Any] = {"items": []}
    for fld in ("funds_allocated", "funds_carryover", "funds_interest",
                "funds_total", "funds_spent", "funds_remaining"):
        v = getattr(result, fld)
        if v is not None:
            out[fld] = v
    # Ensure 23 items, sorted by category_code
    by_code = {it.category_code: it for it in result.items}
    for code in range(1, 24):
        it = by_code.get(code)
        out["items"].append({
            "category_code": code,
            "amount": (it.amount if it else "0"),
            "notes": (it.notes if it else None),
        })
    return out


def _items_all_zero(parsed: dict[str, Any]) -> bool:
    items = parsed.get("items") or []
    if not items:
        return True
    for it in items:
        try:
            if Decimal(str(it.get("amount", "0"))) > 0:
                return False
        except InvalidOperation:
            continue
    return True


# -------- driver --------

def _fixtures_dir(term: int) -> Path:
    # Flat layout (no term subdir) so the generic stage_resource() reader
    # picks files up with its `*.json` glob. Term lives in the filename to
    # keep future cross-term ingest collision-free.
    return fixtures_root() / "sejm" / "mp_office_expenses"


def _index_path() -> Path:
    return fixtures_root() / "sejm" / "mp_office_expenses" / "_index.json"


REPO_ROOT = Path(__file__).resolve().parents[2]


def _process_one(
    entry: dict,
    *,
    term: int,
    year: int,
    dest_dir: Path,
    headers: dict,
    timeout_s: float,
    force: bool,
) -> tuple[str, dict | None, str | None]:
    """Process one entry. Returns (status, payload_or_none, error_or_none).

    status: 'skip-existing' | 'fetched' | 'cached' | '404' | 'fetch-err' | 'parse-err'
    payload: written-to-disk dict on 'fetched'/'cached', None otherwise.
    """
    if not isinstance(entry, dict):
        return ("skip-bad", None, "non-dict entry")
    if int(entry.get("term", term)) != term:
        return ("skip-term", None, None)
    if int(entry.get("year", year)) != year:
        return ("skip-year", None, None)
    mp_id = entry.get("mp_id")
    pdf_url = entry.get("pdf_url")
    if not isinstance(mp_id, int) or not isinstance(pdf_url, str):
        return ("skip-bad", None, "missing mp_id or pdf_url")

    fixture_path = dest_dir / f"t{term}_{mp_id}_{year}.json"
    if fixture_path.exists() and fixture_path.stat().st_size > 0 and not force:
        return ("skip-existing", None, None)

    # Per-thread httpx client — connection pooling not worth the complexity.
    with httpx.Client(headers=headers, timeout=timeout_s, http2=False, follow_redirects=True) as client:
        try:
            pdf_path, body_sha, from_cache = fetch_pdf(client, pdf_url)
        except MPOfficeExpenseNotFound:
            return ("404", None, f"404 {pdf_url}")
        except MPOfficeExpenseFetchError as e:
            return ("fetch-err", None, str(e))

    try:
        text = _extract_pdf_text(pdf_path)
        parsed = parse_pdf_text(text)
        if _items_all_zero(parsed) and len(text.strip()) > 50:
            parsed = llm_extract(text)
    except Exception as e:  # noqa: BLE001
        return ("parse-err", None, f"pdf parse: {e!r}")

    payload = {
        "term": term,
        "mp_id": mp_id,
        "year": year,
        "source_url": pdf_url,
        "source_sha256": body_sha,
        "items": parsed.get("items", []),
    }
    for k in ("funds_allocated", "funds_carryover", "funds_interest",
              "funds_total", "funds_spent", "funds_remaining"):
        if k in parsed:
            payload[k] = parsed[k]
    for k in ("published_at", "approved_by_presidium_at", "period_start", "period_end"):
        if entry.get(k):
            payload[k] = entry[k]

    _atomic_write_json(fixture_path, payload)
    return (("cached" if from_cache else "fetched"), payload, None)


def fetch_mp_office_expenses(
    term: int = 10,
    *,
    year: int = 2025,
    throttle_s: float = DEFAULT_THROTTLE_S,
    timeout_s: float = DEFAULT_TIMEOUT_S,
    force: bool = False,
    workers: int = 1,
) -> FetchReport:
    """Read _index.json, download missing PDFs, parse, write per-MP fixtures.

    Idempotent — fixtures already present on disk are re-parsed only when
    `force=True`. PDF bytes are always cached on disk; re-runs hit the
    cache and only re-parse if the fixture is missing.

    `workers>1` parallelises with a ThreadPoolExecutor. Each worker handles
    fetch + OCR + LLM end-to-end for one MP. Note: OCR is CPU-bound so the
    GIL releases inside tesseract C code; LLM is API-bound. orka.sejm.gov.pl
    tolerates ~5 concurrent connections without hitting 503; deepseek API
    handles 10+ concurrent requests fine. Recommended: 4–6 workers.
    Throttle is best-effort between submission, not per-worker.
    """
    _ensure_omp_single_threaded()
    report = FetchReport(term=term, year=year)
    index_path = _index_path()
    if not index_path.exists():
        logger.error("missing index file: {}", index_path)
        report.errors.append(("_index.json", "missing"))
        return report

    try:
        entries = json.loads(index_path.read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        report.errors.append(("_index.json", f"parse: {e!r}"))
        return report

    if not isinstance(entries, list):
        report.errors.append(("_index.json", "expected list"))
        return report

    dest_dir = _fixtures_dir(term)
    dest_dir.mkdir(parents=True, exist_ok=True)
    headers = {"User-Agent": USER_AGENT, "Accept": "application/pdf,*/*"}

    workers = max(1, int(workers))
    lock = threading.Lock()

    def _account(mp_id_str: str, status: str, err: str | None) -> None:
        with lock:
            if status in ("fetched", "cached"):
                report.fixtures_written += 1
                if status == "fetched":
                    report.pdf_fetched += 1
                else:
                    report.pdf_from_cache += 1
            elif status == "404":
                report.errors.append((mp_id_str, err or "404"))
            elif status in ("fetch-err", "parse-err", "skip-bad"):
                if err:
                    report.errors.append((mp_id_str, err))

    if workers == 1:
        for entry in entries:
            if isinstance(entry, dict) and int(entry.get("term", term)) == term and int(entry.get("year", year)) == year:
                report.entries_seen += 1
            try:
                status, _payload, err = _process_one(
                    entry, term=term, year=year, dest_dir=dest_dir,
                    headers=headers, timeout_s=timeout_s, force=force,
                )
            except Exception as e:  # noqa: BLE001
                _account(str(entry.get("mp_id") if isinstance(entry, dict) else entry),
                         "fetch-err", f"unexpected: {e!r}")
                continue
            _account(str(entry.get("mp_id") if isinstance(entry, dict) else entry), status, err)
            if throttle_s > 0 and status == "fetched":
                time.sleep(throttle_s)
    else:
        # Pre-count valid entries
        for entry in entries:
            if isinstance(entry, dict) and int(entry.get("term", term)) == term and int(entry.get("year", year)) == year:
                report.entries_seen += 1
        with ThreadPoolExecutor(max_workers=workers) as ex:
            futures = []
            for entry in entries:
                f = ex.submit(
                    _process_one,
                    entry, term=term, year=year, dest_dir=dest_dir,
                    headers=headers, timeout_s=timeout_s, force=force,
                )
                futures.append((entry, f))
                # Stagger submissions slightly so we don't hammer all at once
                if throttle_s > 0:
                    time.sleep(throttle_s / workers)
            done = 0
            for entry, f in futures:
                try:
                    status, _payload, err = f.result()
                except Exception as e:  # noqa: BLE001
                    status, err = "fetch-err", f"unexpected: {e!r}"
                _account(str(entry.get("mp_id") if isinstance(entry, dict) else entry), status, err)
                done += 1
                if done % 20 == 0:
                    logger.info("progress: {}/{} done ({} written, {} errors)",
                                done, len(futures), report.fixtures_written, len(report.errors))

    logger.info("fetch_mp_office_expenses: {}", report.to_dict())
    return report
