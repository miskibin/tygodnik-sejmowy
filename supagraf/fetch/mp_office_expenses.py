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
import time
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

import httpx
from loguru import logger
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

_PERIOD_RE = re.compile(
    r"za okres od dnia\s*(?P<start>\d{1,2}[\s.\-/]\w+[\s.\-/]\d{4}|\d{4}-\d{2}-\d{2})"
    r"\s*do dnia\s*(?P<end>\d{1,2}[\s.\-/]\w+[\s.\-/]\d{4}|\d{4}-\d{2}-\d{2})",
    re.IGNORECASE,
)


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

    # Period
    m_period = _PERIOD_RE.search(text)
    if m_period:
        # Leave date parsing to a later pass — the form text-date can be
        # "1 stycznia 2025" or "01.01.2025"; we don't crash, we just skip.
        out.setdefault("_period_raw", {"start": m_period.group("start"), "end": m_period.group("end")})

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


def _extract_pdf_text(pdf_path: Path) -> str:
    import pymupdf  # imported lazily — pymupdf is a heavy native dep
    doc = pymupdf.open(pdf_path)
    try:
        return "\n".join(page.get_text() for page in doc)
    finally:
        doc.close()


# -------- driver --------

def _fixtures_dir(term: int) -> Path:
    # Flat layout (no term subdir) so the generic stage_resource() reader
    # picks files up with its `*.json` glob. Term lives in the filename to
    # keep future cross-term ingest collision-free.
    return fixtures_root() / "sejm" / "mp_office_expenses"


def _index_path() -> Path:
    return fixtures_root() / "sejm" / "mp_office_expenses" / "_index.json"


REPO_ROOT = Path(__file__).resolve().parents[2]


def fetch_mp_office_expenses(
    term: int = 10,
    *,
    year: int = 2025,
    throttle_s: float = DEFAULT_THROTTLE_S,
    timeout_s: float = DEFAULT_TIMEOUT_S,
    force: bool = False,
) -> FetchReport:
    """Read _index.json, download missing PDFs, parse, write per-MP fixtures.

    Idempotent — fixtures already present on disk are re-parsed only when
    `force=True`. PDF bytes are always cached on disk; re-runs hit the
    cache and only re-parse if the fixture is missing.
    """
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
    headers = {"User-Agent": USER_AGENT, "Accept": "application/pdf,*/*"}

    with httpx.Client(headers=headers, timeout=timeout_s, http2=False, follow_redirects=True) as client:
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            if int(entry.get("term", term)) != term:
                continue
            if int(entry.get("year", year)) != year:
                continue
            report.entries_seen += 1
            mp_id = entry.get("mp_id")
            pdf_url = entry.get("pdf_url")
            if not isinstance(mp_id, int) or not isinstance(pdf_url, str):
                report.errors.append((str(entry), "missing mp_id or pdf_url"))
                continue

            fixture_path = dest_dir / f"t{term}_{mp_id}_{year}.json"
            if fixture_path.exists() and fixture_path.stat().st_size > 0 and not force:
                continue  # already extracted; nothing to do

            try:
                pdf_path, body_sha, from_cache = fetch_pdf(client, pdf_url)
                if from_cache:
                    report.pdf_from_cache += 1
                else:
                    report.pdf_fetched += 1
            except MPOfficeExpenseNotFound:
                report.errors.append((str(mp_id), f"404 {pdf_url}"))
                logger.warning("404 for mp {} pdf {}", mp_id, pdf_url)
                continue
            except MPOfficeExpenseFetchError as e:
                report.errors.append((str(mp_id), str(e)))
                logger.error("mp {} pdf fetch failed: {!r}", mp_id, e)
                continue

            try:
                text = _extract_pdf_text(pdf_path)
                parsed = parse_pdf_text(text)
            except Exception as e:  # noqa: BLE001
                report.errors.append((str(mp_id), f"pdf parse: {e!r}"))
                logger.error("mp {} pdf parse failed: {!r}", mp_id, e)
                continue

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
            # Optional overrides from the index entry — caller may know the
            # publication date the PDF itself doesn't carry.
            for k in ("published_at", "approved_by_presidium_at", "period_start", "period_end"):
                if entry.get(k):
                    payload[k] = entry[k]

            _atomic_write_json(fixture_path, payload)
            report.fixtures_written += 1

            if throttle_s > 0 and not from_cache:
                time.sleep(throttle_s)

    logger.info("fetch_mp_office_expenses: {}", report.to_dict())
    return report
