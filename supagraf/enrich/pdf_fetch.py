"""On-demand PDF fetch with short-term filesystem cache.

Replaces the assume-it's-on-disk pattern of fixtures/sejm/prints/*.pdf. Each
enricher now resolves a print pdf_relpath via resolve_print_pdf(); if the
legacy fixtures path exists it is returned unchanged, otherwise the PDF is
fetched from api.sejm.gov.pl into a short-TTL cache directory and that path
is returned.

paddle markdown stays cached in the pdf_extracts table (DB, sha256-keyed) —
once extracted, second enricher pass on the same print never re-paddles.
The on-disk PDF cache here only protects against re-downloading the same
PDF in a single ETL run.

Cache location: $SUPAGRAF_PDF_CACHE or ~/.cache/supagraf/prints
TTL: $SUPAGRAF_PDF_TTL seconds (default 86400 = 24h)
"""
from __future__ import annotations

import hashlib
import os
import re
import time
from pathlib import Path

import httpx
from loguru import logger

from supagraf.fixtures.storage import fixtures_root

CACHE_DIR = Path(
    os.environ.get(
        "SUPAGRAF_PDF_CACHE",
        str(Path.home() / ".cache" / "supagraf" / "prints"),
    )
)
DEFAULT_TTL_SECONDS = int(os.environ.get("SUPAGRAF_PDF_TTL", "86400"))
DEFAULT_TERM = int(os.environ.get("SUPAGRAF_DEFAULT_TERM", "10"))

# Sejm prints API: /sejm/term{N}/prints/{number}/{filename}
# E.g.  https://api.sejm.gov.pl/sejm/term10/prints/2055-A/2055-A.pdf
SEJM_PRINT_URL = "https://api.sejm.gov.pl/sejm/term{term}/prints/{number}/{filename}"
USER_AGENT = "supagraf/1.0 (etl; +https://github.com/miskibin/sejmograf)"

# pdf_relpath shape produced by cli._resolve_pdf_relpath:
#   "sejm/prints/{number}__{filename}"
# Accepts .pdf and .docx — Sejm prints often have both, .docx is the editable
# source and PDF is the signed scan.
_RELPATH_RE = re.compile(
    r"^sejm/prints/(?P<number>[^/]+?)__(?P<filename>[^/]+\.(?:pdf|docx))$"
)


class PdfFetchError(RuntimeError):
    """PDF could not be fetched from upstream (network / 404 / non-pdf body)."""


def _cache_key(term: int, number: str, filename: str) -> str:
    return hashlib.sha256(
        f"t{term}::{number}::{filename}".encode("utf-8")
    ).hexdigest()[:16]


def _cache_path(term: int, number: str, filename: str) -> Path:
    return CACHE_DIR / f"{_cache_key(term, number, filename)}__{number}__{filename}"


def _is_fresh(path: Path, ttl: int) -> bool:
    if ttl <= 0 or not path.exists():
        return False
    return (time.time() - path.stat().st_mtime) < ttl


def fetch_print_pdf(
    *,
    term: int,
    number: str,
    filename: str,
    ttl: int = DEFAULT_TTL_SECONDS,
) -> Path:
    """Return a local Path to the print PDF, fetching if cache miss or stale.

    Order of attempts:
      1. Legacy fixtures path: fixtures_root()/sejm/prints/{number}__{filename}
      2. Short-term cache (TTL window)
      3. Live HTTP GET against api.sejm.gov.pl

    Raises PdfFetchError on network/HTTP failure.
    """
    legacy = fixtures_root() / "sejm" / "prints" / f"{number}__{filename}"
    if legacy.exists() and legacy.stat().st_size > 0:
        return legacy

    target = _cache_path(term, number, filename)
    if _is_fresh(target, ttl) and target.stat().st_size > 0:
        return target

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    url = SEJM_PRINT_URL.format(term=term, number=number, filename=filename)
    logger.info("fetch_print_pdf: GET {} -> {}", url, target.name)
    try:
        with httpx.Client(
            timeout=60.0,
            headers={"User-Agent": USER_AGENT},
            follow_redirects=True,
        ) as c:
            r = c.get(url)
            r.raise_for_status()
            body = r.content
    except httpx.HTTPError as e:
        raise PdfFetchError(f"failed to fetch {url}: {e!r}") from e

    # Magic-byte check: PDF starts with %PDF, docx (zip) starts with PK\x03\x04.
    is_pdf = body[:4].startswith(b"%PDF")
    is_zip = body[:4] == b"PK\x03\x04"
    expects_docx = filename.lower().endswith(".docx")
    if not body or (expects_docx and not is_zip) or (not expects_docx and not is_pdf):
        # Sejm sometimes returns an HTML error page with 200 — refuse to cache.
        raise PdfFetchError(
            f"unexpected body type from {url} (len={len(body)}, head={body[:16]!r})"
        )

    # Atomic write: write to .part then rename.
    tmp = target.with_suffix(target.suffix + ".part")
    tmp.write_bytes(body)
    os.replace(tmp, target)
    return target


def resolve_print_pdf(
    pdf_relpath: str,
    *,
    term: int = DEFAULT_TERM,
    ttl: int = DEFAULT_TTL_SECONDS,
) -> Path:
    """Resolve a 'sejm/prints/{number}__{filename}' relpath to a local Path.

    This is the single chokepoint that every enricher should use instead of
    `fixtures_root() / pdf_relpath`. Behaviour:
      - If the legacy fixtures path exists, return it (no network).
      - Otherwise parse number+filename out of the relpath and call
        fetch_print_pdf() — using cache when fresh, fetching otherwise.

    Raises:
      ValueError if the relpath shape is not recognised.
      PdfFetchError if the upstream fetch fails.
    """
    legacy = fixtures_root() / pdf_relpath
    if legacy.exists() and legacy.stat().st_size > 0:
        return legacy

    m = _RELPATH_RE.match(pdf_relpath)
    if not m:
        raise ValueError(
            f"unsupported pdf_relpath shape (expected 'sejm/prints/<number>__<file>.{{pdf|docx}}'): "
            f"{pdf_relpath!r}"
        )
    return fetch_print_pdf(
        term=term,
        number=m.group("number"),
        filename=m.group("filename"),
        ttl=ttl,
    )


def cleanup_pdf(path: Path, *, force: bool = False) -> None:
    """Best-effort eviction of a cached PDF.

    Default no-op (TTL-based eviction handles the cache). force=True deletes
    immediately — used by tests / strict no-cache callers. Legacy fixtures paths
    are NEVER deleted: they are user-managed source-of-truth.
    """
    if not force or not path.exists():
        return
    if fixtures_root() in path.parents:
        # Defensive: never delete a fixtures-managed file.
        return
    try:
        path.unlink()
    except OSError:
        pass


def evict_expired(ttl: int = DEFAULT_TTL_SECONDS) -> int:
    """Operator job: clear cache entries older than ttl seconds. Returns count."""
    if not CACHE_DIR.exists():
        return 0
    n = 0
    cutoff = time.time() - ttl
    for p in CACHE_DIR.glob("*.pdf"):
        try:
            if p.stat().st_mtime < cutoff:
                p.unlink()
                n += 1
        except OSError:
            continue
    return n
