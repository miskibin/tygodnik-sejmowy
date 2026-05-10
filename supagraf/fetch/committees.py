"""Fetch Sejm committees roster from api.sejm.gov.pl.

Endpoint shape (verified live):
  list:   GET /sejm/term{N}/committees      -> list[ {code, name, ...} ]
  detail: GET /sejm/term{N}/committees/{code} -> single object incl. members[]

There is NO `/members` sub-endpoint — the roster ships embedded in the
detail JSON, so one detail GET per committee is sufficient. Subcommittees
appear as bare code strings in `subCommittees[]`; we trust the load
function to stub-resolve them (mig 0020) rather than fetching them as
first-class committees.

Persists each committee detail JSON as
    fixtures/sejm/committees/{code}.json
matching the existing `capture_committees` layout in fixtures/sources/sejm.py
so the same `stage_committees` reader keeps working.

Idempotent: skips on-disk files that already exist with non-zero size unless
`force=True`. Throttled (1.0s default — committees are tiny in count and the
Sejm API is generous, but the P1.4 lesson stands). 404 logged + skipped
(legitimate gap, e.g. dissolved committee).
"""
from __future__ import annotations

import json
import os
import tempfile
import time
from dataclasses import dataclass, field
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

LIST_URL = "https://api.sejm.gov.pl/sejm/term{term}/committees"
DETAIL_URL = "https://api.sejm.gov.pl/sejm/term{term}/committees/{code}"
USER_AGENT = "supagraf/1.0 (etl; +https://github.com/miskibin/sejmograf)"
DEFAULT_THROTTLE_S = 1.0  # committees are ~40 codes; stay polite per P1.4
DEFAULT_TIMEOUT_S = 30.0


class CommitteeFetchError(RuntimeError):
    """Transient HTTP/network failure (5xx or transport)."""


class CommitteeNotFound(Exception):
    """Upstream returned 404. Legitimate skip."""


@dataclass
class FetchReport:
    term: int = 10
    list_seen: int = 0
    detail_fetched: int = 0
    detail_skipped_existing: int = 0
    detail_skipped_404: int = 0
    errors: list[tuple[str, str]] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "term": self.term,
            "list_seen": self.list_seen,
            "detail_fetched": self.detail_fetched,
            "detail_skipped_existing": self.detail_skipped_existing,
            "detail_skipped_404": self.detail_skipped_404,
            "errors": len(self.errors),
        }


def _atomic_write_json(path: Path, payload: Any, *, retries: int = 5) -> None:
    """Atomic write with PermissionError retry (Windows AV/indexer hygiene).

    Mirrors fetch/acts.py — same OneDrive/Defender wrestling applies here.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    last_err: Exception | None = None
    serialized = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
    for attempt in range(retries):
        fd, tmp = tempfile.mkstemp(prefix=".tmp-", dir=str(path.parent))
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(serialized)
            os.replace(tmp, path)
            return
        except PermissionError as e:
            last_err = e
            try:
                os.unlink(tmp)
            except OSError:
                pass
            time.sleep(0.2 * (attempt + 1))
    raise PermissionError(f"failed atomic write to {path}: {last_err!r}")


@retry(
    retry=retry_if_exception_type(CommitteeFetchError),
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    reraise=True,
)
def _get_json(client: httpx.Client, url: str) -> Any:
    try:
        r = client.get(url)
    except httpx.HTTPError as e:
        raise CommitteeFetchError(f"transport error: {e!r}") from e
    if r.status_code == 404:
        raise CommitteeNotFound(url)
    if r.status_code >= 500:
        raise CommitteeFetchError(f"{r.status_code} {url}")
    r.raise_for_status()
    return r.json()


def _committees_dir() -> Path:
    return fixtures_root() / "sejm" / "committees"


def fetch_committees(
    term: int = 10,
    *,
    force: bool = False,
    throttle_s: float = DEFAULT_THROTTLE_S,
    timeout_s: float = DEFAULT_TIMEOUT_S,
) -> FetchReport:
    """Refresh fixtures/sejm/committees/{code}.json for every committee in term.

    Re-fetch is per-committee idempotent: a non-empty existing file is
    skipped unless `force=True`. Always reads the list endpoint (cheap)
    so newly-created committees mid-term are picked up.
    """
    report = FetchReport(term=term)
    dest_dir = _committees_dir()
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}

    with httpx.Client(headers=headers, timeout=timeout_s, http2=False) as client:
        try:
            listing = _get_json(client, LIST_URL.format(term=term))
        except CommitteeNotFound:
            logger.warning("committees list 404 for term {}", term)
            return report
        except CommitteeFetchError as e:
            report.errors.append(("list", str(e)))
            logger.error("committees list fetch failed: {!r}", e)
            return report

        if not isinstance(listing, list):
            report.errors.append(("list", f"non-list payload: {type(listing).__name__}"))
            return report
        report.list_seen = len(listing)

        for entry in listing:
            code = (entry or {}).get("code")
            if not code:
                continue
            target = dest_dir / f"{code}.json"
            if not force and target.exists() and target.stat().st_size > 0:
                report.detail_skipped_existing += 1
                continue
            url = DETAIL_URL.format(term=term, code=code)
            try:
                payload = _get_json(client, url)
            except CommitteeNotFound:
                report.detail_skipped_404 += 1
                logger.info("committees detail 404: {}", code)
                continue
            except CommitteeFetchError as e:
                report.errors.append((code, str(e)))
                logger.error("committee detail {} failed: {!r}", code, e)
                continue
            _atomic_write_json(target, payload)
            report.detail_fetched += 1
            if throttle_s > 0:
                time.sleep(throttle_s)

    logger.info("fetch_committees report: {}", report.to_dict())
    return report
