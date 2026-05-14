"""Fetch committee sittings (posiedzenia komisji) from api.sejm.gov.pl.

Endpoint shape (verified live):
  GET /sejm/term{N}/committees/{code}/sittings -> list[sitting]

Each sitting carries: num, date, startDateTime, endDateTime, room, city,
status (FINISHED|ONGOING|PLANNED), closed, remote, agenda (HTML), code,
comments, notes, jointWith[], video[].

One GET per committee — sittings ship inline. Fixture layout:
  fixtures/sejm/committee_sittings/{code}.json
Stored wrapped as {"code": "ASW", "sittings": [...]} so stage_resource()
can key the staging row on the committee code (one row per committee).

**Idempotency:** ALWAYS re-fetches. Unlike the roster fetcher, sittings
are mutable mid-day (status PLANNED→ONGOING→FINISHED, agenda edits).
Daily volume ~31 committees × 1.0s throttle ≈ ~31s — cheap.
"""
from __future__ import annotations

import json
import os
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

import httpx
from loguru import logger
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from supagraf.fixtures.storage import fixtures_root

RecordCallback = Callable[[str, dict, str], None]

LIST_URL = "https://api.sejm.gov.pl/sejm/term{term}/committees"
SITTINGS_URL = "https://api.sejm.gov.pl/sejm/term{term}/committees/{code}/sittings"
USER_AGENT = "supagraf/1.0 (etl; +https://github.com/miskibin/sejmograf)"
DEFAULT_THROTTLE_S = 1.0
DEFAULT_TIMEOUT_S = 30.0


class SittingsFetchError(RuntimeError):
    """Transient HTTP/network failure (5xx or transport)."""


class SittingsNotFound(Exception):
    """Upstream returned 404. Legitimate skip (no sittings yet, or dissolved)."""


@dataclass
class FetchReport:
    term: int = 10
    committees_seen: int = 0
    bundles_fetched: int = 0
    bundles_skipped_404: int = 0
    sittings_total: int = 0
    errors: list[tuple[str, str]] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "term": self.term,
            "committees_seen": self.committees_seen,
            "bundles_fetched": self.bundles_fetched,
            "bundles_skipped_404": self.bundles_skipped_404,
            "sittings_total": self.sittings_total,
            "errors": len(self.errors),
        }


def _atomic_write_json(path: Path, payload: Any, *, retries: int = 5) -> None:
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
    retry=retry_if_exception_type(SittingsFetchError),
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    reraise=True,
)
def _get_json(client: httpx.Client, url: str) -> Any:
    try:
        r = client.get(url)
    except httpx.HTTPError as e:
        raise SittingsFetchError(f"transport error: {e!r}") from e
    if r.status_code == 404:
        raise SittingsNotFound(url)
    # 429 = transient rate-limit. Route through retry instead of bubbling
    # up as HTTPStatusError which would abort the full committee sweep.
    if r.status_code == 429 or r.status_code >= 500:
        raise SittingsFetchError(f"{r.status_code} {url}")
    r.raise_for_status()
    return r.json()


def _sittings_dir() -> Path:
    return fixtures_root() / "sejm" / "committee_sittings"


def fetch_committee_sittings(
    term: int = 10,
    *,
    only_code: str | None = None,
    on_record: RecordCallback | None = None,
    throttle_s: float = DEFAULT_THROTTLE_S,
    timeout_s: float = DEFAULT_TIMEOUT_S,
) -> FetchReport:
    """Refresh fixtures/sejm/committee_sittings/{code}.json for every committee.

    Pulls the committees list from the API (same source of truth used by
    fetch_committees) rather than the DB so this works even on a cold cache.

    `only_code` (uppercase committee code) limits to a single committee — useful
    for the spot-verification step and CLI backfill.

    `on_record(code, bundle, source_path)` (optional) fires after each fixture
    is written. Bundle shape matches the staged payload: `{"code": ..., "sittings": [...]}`.
    Callback exceptions are caught + logged here, never re-raised — the
    fixture is the durable cache; the DB write is best-effort.
    """
    report = FetchReport(term=term)
    dest_dir = _sittings_dir()
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}

    with httpx.Client(headers=headers, timeout=timeout_s, http2=False) as client:
        try:
            listing = _get_json(client, LIST_URL.format(term=term))
        except SittingsNotFound:
            logger.warning("committees list 404 for term {}", term)
            return report
        except SittingsFetchError as e:
            report.errors.append(("list", str(e)))
            logger.error("committees list fetch failed: {!r}", e)
            return report

        if not isinstance(listing, list):
            report.errors.append(("list", f"non-list payload: {type(listing).__name__}"))
            return report

        import re
        _CODE_RE = re.compile(r"^[A-Z0-9]{2,20}$")
        codes: list[str] = []
        for entry in listing:
            code = (entry or {}).get("code")
            if not code:
                continue
            # Guard: `code` is interpolated into the request URL. Reject
            # non-canonical values so a poisoned upstream listing can't
            # redirect traffic via path traversal.
            if not _CODE_RE.match(code):
                logger.warning("skip suspicious committee code: {!r}", code)
                continue
            if only_code and code != only_code:
                continue
            codes.append(code)
        report.committees_seen = len(codes)

        for code in codes:
            url = SITTINGS_URL.format(term=term, code=code)
            try:
                payload = _get_json(client, url)
            except SittingsNotFound:
                report.bundles_skipped_404 += 1
                logger.info("sittings 404: {}", code)
                continue
            except SittingsFetchError as e:
                report.errors.append((code, str(e)))
                logger.error("sittings {} failed: {!r}", code, e)
                continue

            if not isinstance(payload, list):
                report.errors.append((code, f"non-list payload: {type(payload).__name__}"))
                continue

            bundle = {"code": code, "sittings": payload}
            target = dest_dir / f"{code}.json"
            _atomic_write_json(target, bundle)
            report.bundles_fetched += 1
            report.sittings_total += len(payload)
            if on_record is not None:
                try:
                    rel_path = f"fixtures/sejm/committee_sittings/{code}.json"
                    on_record(code, bundle, rel_path)
                except Exception as e:  # noqa: BLE001
                    report.errors.append((code, f"stage callback: {e!r}"))
                    logger.warning("stage callback failed for {}: {!r}", code, e)
            if throttle_s > 0:
                time.sleep(throttle_s)

    logger.info("fetch_committee_sittings report: {}", report.to_dict())
    return report
