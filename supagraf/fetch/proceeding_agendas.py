"""Refetch plenary proceeding JSON (containing agenda_html) for `current=true` sittings.

Why this exists: `capture_proceedings` (supagraf/fixtures/sources/sejm.py) uses
`_maybe_save_json` which skips if the file is already on disk. That's correct
for finished sittings — agenda is immutable post-fact — but breaks for the
current sitting: Marshal adds drugi czytanie / sprawozdania mid-day, and our
cached fixture from when the sitting was first announced never sees them.

Mirror of the `committee_sittings.py` fetcher pattern (CLAUDE.md: "ALWAYS
re-fetches because status PLANNED → ONGOING → FINISHED, agenda edits
mid-day"). Same threat model applies to plenary agendas.

Scope is intentionally narrow: only `current=true` proceedings, and only the
top-level `{id}.json` (which carries `agenda` + `agenda_html`). Transcripts
and statement HTML stay on the existing cache-on-disk path — those grow only
forward in time and our existing `fetch_proceeding_bodies` handles them.
"""
from __future__ import annotations

import json
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path

import httpx
from loguru import logger
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from supagraf.fixtures.storage import fixtures_root

SEJM_LIST_URL = "https://api.sejm.gov.pl/sejm/term{term}/proceedings"
SEJM_DETAIL_URL = "https://api.sejm.gov.pl/sejm/term{term}/proceedings/{num}"
USER_AGENT = "supagraf/1.0 (etl; +https://github.com/miskibin/sejmograf)"
DEFAULT_TIMEOUT_S = 30.0


class AgendaFetchError(RuntimeError):
    """Transient HTTP/network failure (5xx or transport)."""


@dataclass
class AgendaRefreshReport:
    listed: int = 0
    current: int = 0
    refreshed: int = 0
    errors: list[tuple[int, str]] = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if self.errors is None:
            self.errors = []


@retry(
    retry=retry_if_exception_type((AgendaFetchError, httpx.TimeoutException)),
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    reraise=True,
)
def _http_get_json(client: httpx.Client, url: str):
    try:
        r = client.get(url)
    except httpx.TimeoutException:
        raise
    except httpx.HTTPError as e:
        raise AgendaFetchError(f"transport: {e!r}") from e
    if 500 <= r.status_code < 600:
        raise AgendaFetchError(f"{r.status_code} {url}: {r.text[:200]}")
    if r.status_code >= 400:
        raise AgendaFetchError(f"{r.status_code} {url}: {r.text[:200]}")
    return r.json()


def _atomic_write_json(path: Path, data) -> None:
    """Write JSON atomically — tmp file in same dir, then rename. Prevents
    partial-write corruption if the process is killed mid-write while the
    daily run is parallel with other stagers reading the same file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=".agenda-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        os.replace(tmp, path)
    except Exception:
        try:
            if os.path.exists(tmp):
                os.unlink(tmp)
        except OSError:
            pass
        raise


def fetch_current_proceeding_agendas(term: int = 10) -> AgendaRefreshReport:
    """Re-pull the `/proceedings/{id}` JSON for every `current=true` sitting.

    Overwrites the on-disk fixture so the next `stage_proceedings` run picks
    up new agenda points + their `print_refs`. Finished sittings are skipped
    (their fixture is already terminal).
    """
    report = AgendaRefreshReport()
    out_dir = fixtures_root() / "sejm" / "proceedings"
    out_dir.mkdir(parents=True, exist_ok=True)

    with httpx.Client(
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
        timeout=DEFAULT_TIMEOUT_S,
        follow_redirects=True,
    ) as client:
        list_url = SEJM_LIST_URL.format(term=term)
        try:
            listed = _http_get_json(client, list_url)
        except Exception as e:
            logger.error("proceeding agenda list fetch failed: {!r}", e)
            return report
        if not isinstance(listed, list):
            logger.warning("proceeding list returned non-list payload, skipping refresh")
            return report
        report.listed = len(listed)

        for p in listed:
            if not p.get("current"):
                continue
            pid = p.get("number") or p.get("id")
            if pid is None:
                continue
            report.current += 1
            url = SEJM_DETAIL_URL.format(term=term, num=pid)
            try:
                detail = _http_get_json(client, url)
            except Exception as e:
                report.errors.append((int(pid), repr(e)))
                logger.error("proceeding {} agenda refresh failed: {!r}", pid, e)
                continue
            _atomic_write_json(out_dir / f"{pid}.json", detail)
            report.refreshed += 1
            logger.info("refreshed agenda for proceeding {} (term {})", pid, term)

    return report
