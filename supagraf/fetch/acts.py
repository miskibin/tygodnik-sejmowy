"""Fetch ELI acts metadata from api.sejm.gov.pl/eli.

Endpoint shape (verified live 2026-05-05):
  list:   GET /eli/acts/{publisher}/{year}      -> {count, totalCount, items[]}
  detail: GET /eli/acts/{publisher}/{year}/{pos} -> full act incl. references

Persists each act detail JSON as
    fixtures/sejm/eli/{publisher}/{year}/{pos}.json
Idempotent: skips on-disk files that already exist with non-zero size.
Rate-limited (default 5 req/s) and retries 5xx with exponential backoff.
404 is logged + skipped (legitimate gap, e.g. retracted positions).
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
from supagraf.schema.acts import ActIn, ActListPage

ELI_LIST_URL = "https://api.sejm.gov.pl/eli/acts/{publisher}/{year}"
ELI_DETAIL_URL = "https://api.sejm.gov.pl/eli/acts/{publisher}/{year}/{position}"
USER_AGENT = "supagraf/1.0 (etl; +https://github.com/miskibin/sejmograf)"
DEFAULT_THROTTLE_S = 0.2  # 5 req/s
DEFAULT_TIMEOUT_S = 30.0


class ActFetchError(RuntimeError):
    """Transient HTTP/network failure (5xx or transport)."""


class ActNotFound(Exception):
    """Upstream returned 404. Legitimate skip."""


@dataclass
class FetchReport:
    years: list[int] = field(default_factory=list)
    publisher: str = "DU"
    list_seen: int = 0          # items returned by list endpoint(s)
    detail_fetched: int = 0
    detail_skipped_existing: int = 0
    detail_skipped_404: int = 0
    errors: list[tuple[str, str]] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "publisher": self.publisher,
            "years": self.years,
            "list_seen": self.list_seen,
            "detail_fetched": self.detail_fetched,
            "detail_skipped_existing": self.detail_skipped_existing,
            "detail_skipped_404": self.detail_skipped_404,
            "errors": len(self.errors),
        }


def _atomic_write_json(path: Path, payload: Any, *, retries: int = 5) -> None:
    """Atomic write with PermissionError retry (Windows AV/indexer hygiene)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    last_err: Exception | None = None
    serialized = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
    for attempt in range(retries):
        fd, tmp = tempfile.mkstemp(prefix=".tmp-", dir=str(path.parent))
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(serialized)
            for replace_attempt in range(retries):
                try:
                    os.replace(tmp, path)
                    return
                except PermissionError as e:
                    last_err = e
                    time.sleep(0.05 * (replace_attempt + 1))
        except Exception as e:
            last_err = e
        finally:
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
    retry=retry_if_exception_type((ActFetchError, httpx.TimeoutException)),
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    reraise=True,
)
def _http_get_json(client: httpx.Client, url: str) -> Any:
    try:
        r = client.get(url)
    except httpx.TimeoutException:
        raise
    except httpx.HTTPError as e:
        raise ActFetchError(f"transport: {e!r}") from e
    if r.status_code == 404:
        raise ActNotFound(url)
    if 500 <= r.status_code < 600:
        raise ActFetchError(f"{r.status_code} {url}: {r.text[:200]}")
    if r.status_code >= 400:
        raise ActNotFound(f"{r.status_code} {url}")
    return r.json()


def _detail_path(publisher: str, year: int, position: int) -> Path:
    return fixtures_root() / "sejm" / "eli" / publisher / str(year) / f"{position}.json"


def _list_year(client: httpx.Client, publisher: str, year: int) -> list[dict]:
    """Fetch the full list of acts for a year. The endpoint returns all items
    in one response (no pagination required at our scale; live api returns
    the full year array — count==totalCount==len(items))."""
    url = ELI_LIST_URL.format(publisher=publisher, year=year)
    data = _http_get_json(client, url)
    page = ActListPage.model_validate(data)
    return [item.model_dump(by_alias=True) for item in page.items]


SUPPORTED_PUBLISHERS = ("DU", "MP")
SEJM_PROCESS_URL = "https://api.sejm.gov.pl/sejm/term{term}/processes/{number}"


def _resolve_publishers(publisher: str) -> list[str]:
    """Normalize the `publisher` arg into an ordered list of upstream codes.

    Accepts 'DU', 'MP', 'both' (case-insensitive). 'both' fetches DU then MP.
    """
    p = (publisher or "").strip().upper()
    if p == "BOTH":
        return list(SUPPORTED_PUBLISHERS)
    if p in SUPPORTED_PUBLISHERS:
        return [p]
    raise ValueError(
        f"unsupported publisher {publisher!r}; expected one of "
        f"{SUPPORTED_PUBLISHERS} or 'both'"
    )


def fetch_acts(
    *,
    years: list[int],
    publisher: str = "both",
    throttle_s: float = DEFAULT_THROTTLE_S,
    timeout_s: float = DEFAULT_TIMEOUT_S,
    limit_per_year: int = 0,
) -> dict:
    """Fetch ELI act metadata for the given years. Idempotent on disk.

    Args:
      years: list of integer years to fetch.
      publisher: 'DU' (Dziennik Ustaw), 'MP' (Monitor Polski), or 'both'
        (default — fetches DU then MP). Some Sejm processes culminate in
        MP entries (signed acts published in Monitor Polski rather than
        Dz.U.) so 'both' is the safe default for full coverage.
      throttle_s: sleep between successful detail fetches.
      timeout_s: per-request timeout.
      limit_per_year: cap on detail fetches per year (0 = no cap). Applied
        per (publisher, year).

    Returns:
      Combined report dict. When `publisher='both'`, includes a
      `per_publisher` map alongside the aggregate counters.
    """
    publishers = _resolve_publishers(publisher)
    aggregate = FetchReport(years=list(years), publisher=publisher)
    per_publisher: dict[str, dict] = {}
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    with httpx.Client(timeout=timeout_s, headers=headers, follow_redirects=True) as client:
        for pub in publishers:
            sub_report = _fetch_acts_for_publisher(
                client=client,
                years=list(years),
                publisher=pub,
                throttle_s=throttle_s,
                limit_per_year=limit_per_year,
            )
            per_publisher[pub] = sub_report.to_dict()
            aggregate.list_seen += sub_report.list_seen
            aggregate.detail_fetched += sub_report.detail_fetched
            aggregate.detail_skipped_existing += sub_report.detail_skipped_existing
            aggregate.detail_skipped_404 += sub_report.detail_skipped_404
            aggregate.errors.extend(sub_report.errors)
            logger.info(
                "fetch_acts publisher={} summary: list_seen={} fetched={} "
                "skipped_existing={} skipped_404={} errors={}",
                pub,
                sub_report.list_seen,
                sub_report.detail_fetched,
                sub_report.detail_skipped_existing,
                sub_report.detail_skipped_404,
                len(sub_report.errors),
            )

    out = aggregate.to_dict()
    out["per_publisher"] = per_publisher
    logger.info("fetch_acts done: {}", json.dumps(out, ensure_ascii=False))
    return out


def _fetch_acts_for_publisher(
    *,
    client: httpx.Client,
    years: list[int],
    publisher: str,
    throttle_s: float,
    limit_per_year: int,
) -> FetchReport:
    """Per-publisher inner loop. Extracted from fetch_acts so the outer
    iterates publishers cleanly. Same shape as before for one publisher."""
    report = FetchReport(years=list(years), publisher=publisher)
    for year in years:
        try:
            items = _list_year(client, publisher, year)
        except ActNotFound:
            logger.warning("eli list 404: {} {}", publisher, year)
            continue
        except Exception as e:  # noqa: BLE001
            report.errors.append((f"list:{publisher}/{year}", repr(e)))
            logger.error("list fetch failed for {} {}: {!r}", publisher, year, e)
            continue
        if throttle_s > 0:
            time.sleep(throttle_s)

        if limit_per_year > 0:
            items = items[:limit_per_year]
        report.list_seen += len(items)
        logger.info(
            "eli list {} {}: {} items (limit={})",
            publisher, year, len(items), limit_per_year or "none",
        )

        for item in items:
            pos = item.get("pos")
            if pos is None:
                continue
            target = _detail_path(publisher, year, pos)
            if target.exists() and target.stat().st_size > 0:
                report.detail_skipped_existing += 1
                continue
            url = ELI_DETAIL_URL.format(publisher=publisher, year=year, position=pos)
            try:
                data = _http_get_json(client, url)
            except ActNotFound:
                logger.info("404 detail: {}", url)
                report.detail_skipped_404 += 1
                if throttle_s > 0:
                    time.sleep(throttle_s)
                continue
            except Exception as e:  # noqa: BLE001
                report.errors.append((url, repr(e)))
                logger.error("detail fetch failed: {}: {!r}", url, e)
                continue

            # Validate via Pydantic so drift is surfaced loudly. Failures are
            # recorded but the file is still written so we don't lose the
            # raw payload (re-fetch is wasteful).
            try:
                ActIn.model_validate(data)
            except Exception as e:  # noqa: BLE001
                report.errors.append((url, f"schema: {e!r}"))
                logger.warning("schema drift at {}: {!r}", url, e)

            try:
                _atomic_write_json(target, data)
            except Exception as e:  # noqa: BLE001
                report.errors.append((str(target), f"write failed: {e!r}"))
                logger.error("write failed: {}: {!r}", target, e)
                continue

            report.detail_fetched += 1
            if report.detail_fetched % 100 == 0:
                logger.info(
                    "progress: fetched={} skipped_existing={} skipped_404={} errors={} (year={})",
                    report.detail_fetched,
                    report.detail_skipped_existing,
                    report.detail_skipped_404,
                    len(report.errors),
                    year,
                )
            if throttle_s > 0:
                time.sleep(throttle_s)

    return report


# ---------------------------------------------------------------------------
# Stale-ELI refresh
# ---------------------------------------------------------------------------
#
# Real-world timing problem: a Sejm bill passes day N, the President signs day
# N+30, Dz.U. (or Monitor Polski) publishes day N+45. Our initial process
# fetch + acts/{year} sweep happens *before* publication, so processes.eli is
# null (or set, but the matching act row doesn't exist yet) and eli_act_id
# stays null indefinitely until the next full-year resweep.
#
# `refresh_stale_eli` plugs that gap with a targeted, narrow re-pull:
#   1. find passed processes whose eli_act_id is still null
#   2. re-fetch the upstream process JSON (cheap; ~20-100 records)
#   3. for any process that *now* has a non-null `eli`, fetch that single
#      act detail and write it under fixtures/sejm/eli/{publisher}/{year}/
#   4. stage + load acts, then call backfill_process_act_links()
#
# Idempotent. Safe to run daily.


def _parse_eli_string(eli: str) -> tuple[str, int, int] | None:
    """Parse 'DU/2025/123' or 'MP/2026/76' into (publisher, year, pos).

    Returns None on malformed input — callers log + skip."""
    if not eli or "/" not in eli:
        return None
    parts = eli.strip().split("/")
    if len(parts) != 3:
        return None
    pub, year_s, pos_s = parts
    pub = pub.upper()
    if pub not in SUPPORTED_PUBLISHERS:
        return None
    try:
        return pub, int(year_s), int(pos_s)
    except ValueError:
        return None


def fetch_one_act(
    *,
    eli: str,
    throttle_s: float = DEFAULT_THROTTLE_S,
    timeout_s: float = DEFAULT_TIMEOUT_S,
) -> Path | None:
    """Fetch a single ELI act detail by its eli string ('DU/2026/123').

    Writes to fixtures/sejm/eli/{publisher}/{year}/{pos}.json. Returns the
    fixture Path on success, None on 404 or parse failure. Idempotent —
    skips and returns the existing path if already on disk.
    """
    parsed = _parse_eli_string(eli)
    if parsed is None:
        logger.warning("fetch_one_act: cannot parse eli {!r}", eli)
        return None
    publisher, year, pos = parsed
    target = _detail_path(publisher, year, pos)
    if target.exists() and target.stat().st_size > 0:
        return target

    url = ELI_DETAIL_URL.format(publisher=publisher, year=year, position=pos)
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    with httpx.Client(timeout=timeout_s, headers=headers, follow_redirects=True) as client:
        try:
            data = _http_get_json(client, url)
        except ActNotFound:
            logger.info("fetch_one_act 404: {}", url)
            return None
        except Exception as e:  # noqa: BLE001
            logger.error("fetch_one_act failed {}: {!r}", url, e)
            return None
    try:
        ActIn.model_validate(data)
    except Exception as e:  # noqa: BLE001
        logger.warning("fetch_one_act schema drift at {}: {!r}", url, e)
    try:
        _atomic_write_json(target, data)
    except Exception as e:  # noqa: BLE001
        logger.error("fetch_one_act write failed {}: {!r}", target, e)
        return None
    if throttle_s > 0:
        time.sleep(throttle_s)
    return target


def refresh_stale_eli(
    term: int = 10,
    max_age_days: int = 21,
    timeout_s: float = DEFAULT_TIMEOUT_S,
    throttle_s: float = 1.0,
) -> dict:
    """Re-pull acts for processes that passed but lack eli_act_id linkage.

    Scenario: Sejm passes a bill on day N, President signs day N+30, Dz.U.
    publishes day N+45. Our initial fetch happens before publication so
    eli_act_id stays null. This function:

      1. Selects processes WHERE term=p_term AND passed=true AND
         eli_act_id IS NULL.
      2. For each, re-fetches the upstream process JSON to get fresh `eli`
         (a Dz.U./MP address may have appeared since last pull).
      3. Triggers a one-shot single-act fetch for the freshly-populated
         `eli` strings (DU/{year}/{pos} or MP/{year}/{pos}).
      4. Re-stages + re-loads acts so new fixtures land in the acts table.
      5. Calls backfill_process_act_links() RPC to set eli_act_id.

    `max_age_days` is accepted for forward compatibility with a future
    `processes.last_refreshed_at` column (migration 0047, owned elsewhere).
    Right now we just refresh every passed-but-unlinked process — the
    upstream API call is cheap and the result set is tiny.

    Returns counts dict.
    """
    # Late imports — avoid circular dependencies and keep the fetch module
    # importable in environments without supabase creds (e.g. pure unit tests).
    from supagraf.db import supabase
    from supagraf.load import _rpc_int  # type: ignore[attr-defined]
    from supagraf.stage.acts import stage as stage_acts_fn

    client = supabase()

    # Some columns may not exist yet (e.g. last_refreshed_at lands in 0047).
    # Select defensively and ignore missing-column errors.
    select_cols = "number, eli, eli_act_id, passed"
    rows = (
        client.table("processes")
        .select(select_cols)
        .eq("term", term)
        .eq("passed", True)
        .is_("eli_act_id", "null")
        .execute()
        .data
        or []
    )
    logger.info(
        "refresh_stale_eli: term={} candidates (passed=true, eli_act_id null) = {}",
        term, len(rows),
    )

    refreshed_processes = 0
    fetched_acts = 0
    process_eli_seen: list[str] = []
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}

    refreshed_numbers: list[str] = []  # processes whose row needs last_refreshed_at write

    with httpx.Client(timeout=timeout_s, headers=headers, follow_redirects=True) as http:
        for idx, row in enumerate(rows):
            number = row.get("number")
            if number is None:
                continue
            # Throttle BEFORE each call (skipping the first) so peak QPS to
            # api.sejm.gov.pl stays under 1/s. Sejm has no documented limit
            # but bursting hundreds of requests is rude.
            if idx > 0 and throttle_s > 0:
                time.sleep(throttle_s)
            url = SEJM_PROCESS_URL.format(term=term, number=number)
            try:
                proc = _http_get_json(http, url)
            except ActNotFound:
                logger.info("refresh_stale_eli: process {} 404", number)
                continue
            except Exception as e:  # noqa: BLE001
                logger.error("refresh_stale_eli: process {} fetch failed: {!r}", number, e)
                continue

            # Mark this process as touched regardless of whether ELI changed —
            # we did re-pull the upstream JSON, so last_refreshed_at should
            # advance even when ELI is still null (so we don't re-hit the
            # API on the same row every daily run after publication lag).
            refreshed_numbers.append(str(number))

            new_eli = proc.get("ELI") or proc.get("eli")
            if not new_eli:
                # Still pre-publication; skip silently — try again tomorrow.
                continue
            refreshed_processes += 1
            process_eli_seen.append(new_eli)

            target = _detail_path(*_parse_eli_string(new_eli)) if _parse_eli_string(new_eli) else None
            if target is not None and target.exists() and target.stat().st_size > 0:
                # Act fixture already on disk — backfill alone will pick it up.
                continue

            parsed = _parse_eli_string(new_eli)
            if parsed is None:
                logger.warning(
                    "refresh_stale_eli: process {} has malformed ELI {!r}",
                    number, new_eli,
                )
                continue
            publisher, year, pos = parsed
            act_url = ELI_DETAIL_URL.format(publisher=publisher, year=year, position=pos)
            try:
                act_data = _http_get_json(http, act_url)
            except ActNotFound:
                logger.info(
                    "refresh_stale_eli: act {} 404 (process {} reports it but upstream "
                    "hasn't published yet)",
                    new_eli, number,
                )
                continue
            except Exception as e:  # noqa: BLE001
                logger.error("refresh_stale_eli: act {} fetch failed: {!r}", new_eli, e)
                continue
            try:
                ActIn.model_validate(act_data)
            except Exception as e:  # noqa: BLE001
                logger.warning("refresh_stale_eli: schema drift at {}: {!r}", act_url, e)
            try:
                _atomic_write_json(target, act_data)
                fetched_acts += 1
            except Exception as e:  # noqa: BLE001
                logger.error("refresh_stale_eli: write failed {}: {!r}", target, e)

    # Re-stage + load both publishers so any newly-written fixtures land in
    # acts and backfill_process_act_links can resolve them.
    if fetched_acts > 0:
        for pub in SUPPORTED_PUBLISHERS:
            try:
                stage_acts_fn(term=term, publisher=pub)
            except Exception as e:  # noqa: BLE001
                logger.error("refresh_stale_eli: stage_acts {} failed: {!r}", pub, e)
        try:
            n = _rpc_int(client, "load_acts", term)
            logger.info("refresh_stale_eli: load_acts affected={}", n)
        except Exception as e:  # noqa: BLE001
            logger.error("refresh_stale_eli: load_acts failed: {!r}", e)

    # Backfill regardless — new acts may have arrived through the regular
    # daily fetch even when we wrote 0 fixtures here.
    linked_after = 0
    try:
        r = client.rpc(
            "backfill_process_act_links", {"p_term": term}
        ).execute()
        linked_after = int(r.data or 0)
        logger.info("refresh_stale_eli: backfill_process_act_links affected={}", linked_after)
    except Exception as e:  # noqa: BLE001
        logger.error("refresh_stale_eli: backfill failed: {!r}", e)

    # Stamp last_refreshed_at on every process we re-pulled. Used by future
    # max_age_days filtering — daily runs skip rows refreshed within the
    # window so we don't re-hit api.sejm.gov.pl for the same stuck row.
    if refreshed_numbers:
        try:
            from datetime import datetime, timezone
            now_iso = datetime.now(timezone.utc).isoformat()
            client.table("processes").update(
                {"last_refreshed_at": now_iso}
            ).eq("term", term).in_("number", refreshed_numbers).execute()
            logger.info(
                "refresh_stale_eli: stamped last_refreshed_at on {} processes",
                len(refreshed_numbers),
            )
        except Exception as e:  # noqa: BLE001
            logger.error("refresh_stale_eli: last_refreshed_at write failed: {!r}", e)

    out = {
        "term": term,
        "max_age_days": max_age_days,
        "candidates": len(rows),
        "refreshed_processes": refreshed_processes,
        "fetched_acts": fetched_acts,
        "linked_after": linked_after,
        "stamped_processes": len(refreshed_numbers),
        "sample_eli": process_eli_seen[:10],
    }
    logger.info("refresh_stale_eli done: {}", out)
    return out
