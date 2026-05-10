"""Fetch HTML statement bodies from api.sejm.gov.pl.

Backfills the `fixtures/sejm/proceedings/{N}__{date}__statements/{num}.html`
tree for proceeding-days that lack on-disk transcript bodies. After running
this fetcher the existing stage_proceedings + load_proceedings pipeline picks
the bodies up automatically (the stager checks for the .html file and copies
into the staged JSON; the loader shreds it into proceeding_statements.body_*).

Idempotent: skips on-disk files that already exist with non-zero size.
Rate-limited (default 5 req/s) and retries 5xx with exponential backoff.
404 is logged + skipped (some statements legitimately have no transcript).
"""
from __future__ import annotations

import json
import os
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path

import httpx
from loguru import logger
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from supagraf.db import supabase
from supagraf.fixtures.storage import fixtures_root

# Endpoint: returns the HTML body for one statement on one proceeding-day.
SEJM_STATEMENT_URL = (
    "https://api.sejm.gov.pl/sejm/term{term}/proceedings/{num}/{date}/transcripts/{snum}"
)
USER_AGENT = "supagraf/1.0 (etl; +https://github.com/miskibin/sejmograf)"
DEFAULT_THROTTLE_S = 0.2  # 5 req/s
DEFAULT_TIMEOUT_S = 30.0


class StatementFetchError(RuntimeError):
    """Transient HTTP/network failure (5xx or transport)."""


class StatementNotFound(Exception):
    """Upstream returned 404. Caller treats as legitimate skip."""


@dataclass
class FetchReport:
    seen: int = 0
    fetched: int = 0
    skipped_existing: int = 0
    skipped_404: int = 0
    errors: list[tuple[str, str]] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "seen": self.seen,
            "fetched": self.fetched,
            "skipped_existing": self.skipped_existing,
            "skipped_404": self.skipped_404,
            "errors": len(self.errors),
        }


def _atomic_write_text(path: Path, text: str, *, retries: int = 5) -> None:
    """Atomic write with PermissionError retry.

    On Windows, antivirus / Search Indexer occasionally scans the .tmp file
    immediately after we close the handle, holding a brief shared lock that
    causes os.replace() to fail with PermissionError. Retry with backoff.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    last_err: Exception | None = None
    for attempt in range(retries):
        fd, tmp = tempfile.mkstemp(prefix=".tmp-", dir=str(path.parent))
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(text.encode("utf-8"))
            # Brief retry around the rename only — write itself never fails
            # mid-stream, only the cross-handle replace.
            for replace_attempt in range(retries):
                try:
                    os.replace(tmp, path)
                    return
                except PermissionError as e:
                    last_err = e
                    time.sleep(0.05 * (replace_attempt + 1))
            # Replace exhausted — fall through to outer cleanup + retry.
        except Exception as e:
            last_err = e
        finally:
            # If tmp still exists at this point the replace either succeeded
            # (no-op) or failed; in failure case unlink it so the next outer
            # iteration starts clean.
            try:
                if os.path.exists(tmp):
                    os.unlink(tmp)
            except OSError:
                pass
        time.sleep(0.1 * (attempt + 1))
    if last_err is not None:
        raise last_err
    raise RuntimeError(f"atomic write to {path} exhausted retries")


@retry(
    retry=retry_if_exception_type((StatementFetchError, httpx.TimeoutException)),
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    reraise=True,
)
def _http_get_text(client: httpx.Client, url: str) -> str:
    try:
        r = client.get(url)
    except httpx.TimeoutException:
        raise
    except httpx.HTTPError as e:
        raise StatementFetchError(f"transport: {e!r}") from e
    if r.status_code == 404:
        raise StatementNotFound(url)
    if 500 <= r.status_code < 600:
        raise StatementFetchError(f"{r.status_code} {url}: {r.text[:200]}")
    if r.status_code >= 400:
        # 4xx (other than 404) is non-retryable but also unexpected. Surface
        # as a "fatal" error for this URL — caller logs + counts.
        raise StatementNotFound(f"{r.status_code} {url}")
    return r.text


def _statements_dir(proc_num: int, date_str: str) -> Path:
    return (
        fixtures_root()
        / "sejm"
        / "proceedings"
        / f"{proc_num}__{date_str}__statements"
    )


def _statement_path(proc_num: int, date_str: str, snum: int) -> Path:
    return _statements_dir(proc_num, date_str) / f"{snum}.html"


def _select_target_days(term: int) -> list[dict]:
    """Find proceeding-days that have at least one statement with NULL body_text.

    Returns rows shaped {proceeding_number, date, statements: [{num, body_text_present}]}.
    The shape is built from PostgREST joins because it is more compact than
    a hand-rolled SQL view.

    Paginates via PostgREST `range()` because the default PostgREST cap is
    1000 rows per request — without explicit pagination, large term-10 runs
    silently truncated to 1000 statements (Phase H morning stall: "700/1000"
    was actually all the fetcher ever saw).
    """
    cli = supabase()
    page = 1000
    offset = 0
    out: list[dict] = []
    while True:
        rows = (
            cli.table("proceeding_statements")
            .select(
                "id, num, body_text, "
                "proceeding_day:proceeding_days("
                "id, date, proceeding:proceedings(number, term)"
                ")"
            )
            .eq("term", term)
            .is_("body_text", "null")
            .order("id")
            .range(offset, offset + page - 1)
            .execute()
            .data
            or []
        )
        if not rows:
            break
        out.extend(rows)
        if len(rows) < page:
            break
        offset += len(rows)
    return out


def fetch_proceeding_bodies(
    term: int = 10,
    *,
    throttle_s: float = DEFAULT_THROTTLE_S,
    timeout_s: float = DEFAULT_TIMEOUT_S,
    limit: int = 0,
) -> dict:
    """Backfill missing statement HTML bodies on disk.

    Args:
      term: Sejm term, default 10.
      throttle_s: sleep between successful HTTP fetches (rate-limit). Default 0.2.
      timeout_s: per-request timeout.
      limit: cap on statements to attempt (0 = no cap).

    Returns:
      FetchReport.to_dict() — counters for fetched / skipped_existing /
      skipped_404 / errors.
    """
    rows = _select_target_days(term)
    if limit > 0:
        rows = rows[:limit]
    report = FetchReport()
    headers = {"User-Agent": USER_AGENT, "Accept": "text/html, */*"}
    with httpx.Client(
        timeout=timeout_s,
        headers=headers,
        follow_redirects=True,
    ) as client:
        for row in rows:
            report.seen += 1
            day = row.get("proceeding_day") or {}
            proc = (day.get("proceeding") or {})
            proc_num = proc.get("number")
            date_obj = day.get("date")
            snum = row.get("num")
            if proc_num is None or not date_obj or snum is None:
                report.errors.append(
                    (str(row.get("id")), f"missing proc/date/num in row: {row!r}")
                )
                continue
            date_str = str(date_obj)[:10]
            target = _statement_path(proc_num, date_str, snum)
            if target.exists() and target.stat().st_size > 0:
                report.skipped_existing += 1
                continue
            url = SEJM_STATEMENT_URL.format(
                term=term, num=proc_num, date=date_str, snum=snum
            )
            try:
                text = _http_get_text(client, url)
            except StatementNotFound:
                logger.info("404 statement: {}", url)
                report.skipped_404 += 1
                # Honor throttle even on 404 — still hit upstream.
                if throttle_s > 0:
                    time.sleep(throttle_s)
                continue
            except Exception as e:  # noqa: BLE001
                report.errors.append((url, repr(e)))
                logger.error("fetch failed: {}: {!r}", url, e)
                continue
            if not text or not text.strip():
                # Empty body — treat as 404-equivalent to avoid creating empty
                # files that the stager would later misread as "loaded".
                logger.warning("empty body: {}", url)
                report.skipped_404 += 1
                if throttle_s > 0:
                    time.sleep(throttle_s)
                continue
            try:
                _atomic_write_text(target, text)
            except Exception as e:  # noqa: BLE001
                report.errors.append((str(target), f"write failed: {e!r}"))
                logger.error("write failed: {}: {!r}", target, e)
                continue
            report.fetched += 1
            if report.fetched % 100 == 0:
                logger.info(
                    "progress: fetched={} skipped_existing={} skipped_404={} errors={} (seen={}/{})",
                    report.fetched,
                    report.skipped_existing,
                    report.skipped_404,
                    len(report.errors),
                    report.seen,
                    len(rows),
                )
            if throttle_s > 0:
                time.sleep(throttle_s)
    logger.info(
        "fetch_proceeding_bodies done: {}",
        json.dumps(report.to_dict()),
    )
    return report.to_dict()
