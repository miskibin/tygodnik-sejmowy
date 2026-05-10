import asyncio
from typing import Any, Iterable

import httpx
import pytest

from supagraf.fixtures.client import SejmClient


class _Sequence:
    def __init__(self, responses: Iterable[Any]):
        self._iter = iter(responses)
        self.calls = 0

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.calls += 1
        nxt = next(self._iter)
        if isinstance(nxt, Exception):
            raise nxt
        return nxt


@pytest.fixture
def make_client():
    """Build a SejmClient whose underlying httpx.AsyncClient is mocked."""

    def _build(responses: Iterable[Any]) -> tuple[SejmClient, _Sequence]:
        seq = _Sequence(responses)
        transport = httpx.MockTransport(seq)
        client = SejmClient(concurrency=2, max_attempts=4)
        # Pre-build the inner client so we can inject MockTransport
        client._client = httpx.AsyncClient(
            transport=transport,
            timeout=5,
            follow_redirects=True,
        )
        return client, seq

    return _build


@pytest.mark.asyncio
async def test_get_json_happy(make_client):
    client, seq = make_client(
        [httpx.Response(200, json={"ok": True})]
    )
    try:
        result = await client.get_json("/sejm/term10/MP/1")
    finally:
        await client._client.aclose()
    assert result == {"ok": True}
    assert seq.calls == 1


@pytest.mark.asyncio
async def test_get_json_404_returns_none(make_client):
    client, _ = make_client([httpx.Response(404)])
    try:
        assert await client.get_json("/missing") is None
    finally:
        await client._client.aclose()


@pytest.mark.asyncio
async def test_retries_on_500(make_client):
    client, seq = make_client(
        [
            httpx.Response(500),
            httpx.Response(500),
            httpx.Response(200, json={"ok": 1}),
        ]
    )
    try:
        out = await client.get_json("/x")
    finally:
        await client._client.aclose()
    assert out == {"ok": 1}
    assert seq.calls == 3


@pytest.mark.asyncio
async def test_retries_on_429(make_client):
    client, seq = make_client(
        [httpx.Response(429), httpx.Response(200, json=[1, 2, 3])]
    )
    try:
        out = await client.get_json("/y")
    finally:
        await client._client.aclose()
    assert out == [1, 2, 3]
    assert seq.calls == 2


@pytest.mark.asyncio
async def test_get_bytes(make_client):
    client, _ = make_client(
        [httpx.Response(200, content=b"PDFDATA")]
    )
    try:
        out = await client.get_bytes("/x.pdf")
    finally:
        await client._client.aclose()
    assert out == b"PDFDATA"
