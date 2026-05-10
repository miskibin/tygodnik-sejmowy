"""Async HTTP client for Sejm API + ELI. Retry, throttle, sane timeouts."""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Optional

import httpx
from loguru import logger
from tenacity import (
    AsyncRetrying,
    RetryError,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)


SEJM_BASE = "https://api.sejm.gov.pl"


class FetchError(RuntimeError):
    pass


class SejmClient:
    """Thin wrapper around httpx.AsyncClient with retry + concurrency cap.

    Use as async context manager. All methods take an absolute or
    api.sejm.gov.pl-relative path (leading '/' optional).
    """

    def __init__(
        self,
        base_url: str = SEJM_BASE,
        concurrency: int = 5,
        timeout: float = 60.0,
        max_attempts: int = 5,
    ):
        self.base_url = base_url.rstrip("/")
        self._sem = asyncio.Semaphore(concurrency)
        self._timeout = timeout
        self._max_attempts = max_attempts
        self._client: Optional[httpx.AsyncClient] = None

    async def __aenter__(self) -> "SejmClient":
        self._client = httpx.AsyncClient(
            timeout=self._timeout,
            follow_redirects=True,
            headers={"User-Agent": "supagraf/0.1 (fixture-capture)"},
        )
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    def _abs(self, path: str) -> str:
        if path.startswith("http://") or path.startswith("https://"):
            return path
        if not path.startswith("/"):
            path = "/" + path
        return self.base_url + path

    async def _request(self, path: str) -> httpx.Response:
        assert self._client is not None, "use 'async with SejmClient()'"
        url = self._abs(path)

        async def _go() -> httpx.Response:
            async with self._sem:
                resp = await self._client.get(url)
                if resp.status_code == 429 or 500 <= resp.status_code < 600:
                    resp.raise_for_status()
                return resp

        try:
            async for attempt in AsyncRetrying(
                stop=stop_after_attempt(self._max_attempts),
                wait=wait_exponential(multiplier=1, min=1, max=30),
                retry=retry_if_exception_type(
                    (httpx.HTTPStatusError, httpx.TransportError, httpx.TimeoutException)
                ),
                reraise=True,
            ):
                with attempt:
                    return await _go()
        except RetryError as e:  # pragma: no cover
            raise FetchError(f"giving up on {url}: {e}") from e
        raise FetchError(f"unreachable: {url}")  # pragma: no cover

    async def get_json(self, path: str) -> Optional[Any]:
        resp = await self._request(path)
        if resp.status_code == 404:
            logger.debug("404 {}", path)
            return None
        if resp.status_code >= 400:
            raise FetchError(f"{resp.status_code} for {path}")
        if not resp.content:
            return None
        try:
            return resp.json()
        except ValueError as e:
            logger.warning("non-JSON response for {}: {}", path, e)
            return None

    async def get_bytes(self, path: str) -> Optional[bytes]:
        resp = await self._request(path)
        if resp.status_code == 404:
            return None
        if resp.status_code >= 400:
            raise FetchError(f"{resp.status_code} for {path}")
        return resp.content

    async def get_text(self, path: str) -> Optional[str]:
        resp = await self._request(path)
        if resp.status_code == 404:
            return None
        if resp.status_code >= 400:
            raise FetchError(f"{resp.status_code} for {path}")
        return resp.text


@asynccontextmanager
async def open_client(**kwargs) -> AsyncIterator[SejmClient]:
    async with SejmClient(**kwargs) as c:
        yield c
