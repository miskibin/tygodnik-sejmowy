"""Synchronous, retrying, concurrency-capped client for api.sejm.gov.pl.

The daily is a sequence of I/O-bound steps; threads (not asyncio) keep the
resource modules plain functions that can call the (sync) Supabase client
freely. `SejmApi.map()` fans a callable over items with a bounded pool.

Retry policy: 429 / 5xx / transport errors / timeouts are retried with
exponential backoff (the API is undocumented on limits; none were observed
at 20-way concurrency, but the WAF exists). 404 → None. Other 4xx →
UpstreamError immediately — a malformed request must not be retried into
a WAF block. A 200 whose body is not JSON (the WAF's HTML "Request
Rejected" page) is also UpstreamError, never silently None.
"""
from __future__ import annotations

import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any, Callable, Iterable, TypeVar

import httpx
from loguru import logger
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

SEJM_BASE = "https://api.sejm.gov.pl"
USER_AGENT = "supagraf/2.0 (daily updater; +https://github.com/miskibin/tygodnik-sejmowy)"
DEFAULT_TIMEOUT_S = 60.0
DEFAULT_CONCURRENCY = 8
DEFAULT_ATTEMPTS = 5

T = TypeVar("T")
R = TypeVar("R")


class UpstreamError(RuntimeError):
    """Non-retryable upstream failure (4xx other than 404, non-JSON body)."""


class TransientUpstreamError(RuntimeError):
    """429 / 5xx — retried by tenacity."""


@dataclass
class HttpStats:
    requests: int = 0
    retries: int = 0
    bytes: int = 0
    not_found: int = 0
    seconds: float = 0.0
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def to_dict(self) -> dict:
        return {
            "requests": self.requests, "retries": self.retries,
            "bytes": self.bytes, "not_found": self.not_found,
            "seconds": round(self.seconds, 1),
        }


class SejmApi:
    def __init__(
        self,
        *,
        base_url: str = SEJM_BASE,
        timeout_s: float = DEFAULT_TIMEOUT_S,
        concurrency: int = DEFAULT_CONCURRENCY,
        attempts: int = DEFAULT_ATTEMPTS,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.concurrency = max(1, concurrency)
        self.attempts = max(1, attempts)
        self.stats = HttpStats()
        self._sem = threading.BoundedSemaphore(self.concurrency)
        self._client = httpx.Client(
            timeout=timeout_s,
            follow_redirects=True,
            headers={"User-Agent": USER_AGENT, "Accept": "application/json, text/html;q=0.9, */*;q=0.5"},
            limits=httpx.Limits(max_connections=self.concurrency + 2, max_keepalive_connections=self.concurrency),
            transport=transport,
        )

    # -- lifecycle ----------------------------------------------------------
    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "SejmApi":
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    # -- low level ----------------------------------------------------------
    def url(self, path: str) -> str:
        if path.startswith(("http://", "https://")):
            return path
        return self.base_url + ("/" + path if not path.startswith("/") else path)

    def _once(self, url: str, params: dict | None) -> httpx.Response:
        with self._sem:
            t0 = time.monotonic()
            try:
                r = self._client.get(url, params=params)
            except httpx.HTTPError as e:
                with self.stats._lock:
                    self.stats.requests += 1
                    self.stats.seconds += time.monotonic() - t0
                raise TransientUpstreamError(f"transport: {e!r} ({url})") from e
            with self.stats._lock:
                self.stats.requests += 1
                self.stats.bytes += len(r.content)
                self.stats.seconds += time.monotonic() - t0
        if r.status_code == 429 or 500 <= r.status_code < 600:
            raise TransientUpstreamError(f"{r.status_code} {url}: {r.text[:200]}")
        return r

    def get(self, path: str, params: dict | None = None) -> httpx.Response | None:
        """GET with retries. None on 404; UpstreamError on other 4xx."""
        url = self.url(path)

        def _on_retry(state) -> None:
            with self.stats._lock:
                self.stats.retries += 1
            logger.warning("retry {} for {} ({!r})", state.attempt_number, url,
                           state.outcome.exception() if state.outcome else None)

        @retry(
            retry=retry_if_exception_type(TransientUpstreamError),
            stop=stop_after_attempt(self.attempts),
            wait=wait_exponential(multiplier=1, min=1, max=30),
            before_sleep=_on_retry,
            reraise=True,
        )
        def _go() -> httpx.Response:
            return self._once(url, params)

        r = _go()
        if r.status_code == 404:
            with self.stats._lock:
                self.stats.not_found += 1
            return None
        if r.status_code >= 400:
            raise UpstreamError(f"{r.status_code} {url}: {r.text[:200]}")
        return r

    def get_json(self, path: str, params: dict | None = None) -> Any | None:
        r = self.get(path, params)
        if r is None:
            return None
        if not r.content:
            return None
        try:
            return r.json()
        except ValueError as e:
            raise UpstreamError(f"non-JSON body from {r.url}: {r.text[:120]!r}") from e

    def get_text(self, path: str, params: dict | None = None) -> str | None:
        r = self.get(path, params)
        return None if r is None else r.text

    def get_bytes(self, path: str, params: dict | None = None) -> bytes | None:
        r = self.get(path, params)
        return None if r is None else r.content

    def paginate(self, path: str, params: dict | None = None, *, page_size: int = 500) -> list[dict]:
        """Walk `limit/offset` pages until a short page or X-Total-Count is reached."""
        out: list[dict] = []
        offset = 0
        base = dict(params or {})
        while True:
            r = self.get(path, {**base, "limit": page_size, "offset": offset})
            if r is None:
                break
            page = r.json() if r.content else []
            if not isinstance(page, list) or not page:
                break
            out.extend(page)
            total = r.headers.get("X-Total-Count")
            offset += len(page)
            if len(page) < page_size:
                break
            if total and total.isdigit() and offset >= int(total):
                break
        return out

    # -- fan-out ------------------------------------------------------------
    def map(
        self,
        fn: Callable[[T], R],
        items: Iterable[T],
        *,
        workers: int | None = None,
        label: str = "",
    ) -> list[tuple[T, R | None, Exception | None]]:
        """Run `fn` over `items` with a bounded pool; never raises for one item.

        Returns (item, result, exception) in input order so callers can count
        successes and record failures per item.
        """
        items = list(items)
        if not items:
            return []
        n = max(1, min(workers or self.concurrency, len(items)))

        def _safe(item: T) -> tuple[T, R | None, Exception | None]:
            try:
                return item, fn(item), None
            except Exception as e:  # noqa: BLE001 — surfaced to caller
                return item, None, e

        with ThreadPoolExecutor(max_workers=n, thread_name_prefix=f"sync-{label or 'map'}") as pool:
            results = list(pool.map(_safe, items))
        failed = sum(1 for _, _, e in results if e is not None)
        if failed:
            logger.warning("{}: {}/{} items failed", label or "map", failed, len(items))
        return results
