from __future__ import annotations

import httpx
import pytest

from supagraf.sync.http import SejmApi, UpstreamError


def _api(handler, attempts=3):
    return SejmApi(concurrency=2, attempts=attempts, transport=httpx.MockTransport(handler))


def _fast(api: SejmApi):
    return api


def test_404_is_none_and_counted(routes, api):
    assert api.get_json("/sejm/term10/prints/nope") is None
    assert api.stats.not_found == 1
    assert api.stats.requests == 1


def test_json_and_text(routes, api):
    routes.add("/sejm/term10/x", {"a": 1})
    routes.add("/sejm/term10/t", "<p>hi</p>")
    assert api.get_json("/sejm/term10/x") == {"a": 1}
    assert api.get_text("/sejm/term10/t") == "<p>hi</p>"
    assert api.stats.bytes > 0


def test_5xx_and_429_are_retried(monkeypatch):
    seen = {"n": 0}

    def handler(request):
        seen["n"] += 1
        if seen["n"] == 1:
            return httpx.Response(503, text="busy")
        if seen["n"] == 2:
            return httpx.Response(429, text="slow")
        return httpx.Response(200, json=[1])

    api = _api(handler)
    # no sleeping in tests
    import supagraf.sync.http as h
    monkeypatch.setattr(h, "wait_exponential", lambda **kw: __import__("tenacity").wait_none())
    assert api.get_json("/x") == [1]
    assert seen["n"] == 3
    assert api.stats.retries == 2


def test_5xx_exhausted_raises(monkeypatch):
    import supagraf.sync.http as h
    monkeypatch.setattr(h, "wait_exponential", lambda **kw: __import__("tenacity").wait_none())
    api = _api(lambda r: httpx.Response(500, text="x"), attempts=2)
    with pytest.raises(h.TransientUpstreamError):
        api.get_json("/x")


def test_other_4xx_not_retried():
    n = {"c": 0}

    def handler(request):
        n["c"] += 1
        return httpx.Response(403, text="Request Rejected")

    api = _api(handler)
    with pytest.raises(UpstreamError):
        api.get_json("/x")
    assert n["c"] == 1


def test_waf_html_on_200_is_upstream_error():
    api = _api(lambda r: httpx.Response(200, text="<html>Request Rejected</html>"))
    with pytest.raises(UpstreamError, match="non-JSON"):
        api.get_json("/x")


def test_paginate_uses_total_count_header():
    pages = {0: [1, 2], 2: [3]}

    def handler(request):
        offset = int(request.url.params.get("offset", 0))
        return httpx.Response(200, json=pages.get(offset, []), headers={"X-Total-Count": "3"})

    api = _api(handler)
    assert api.paginate("/list", page_size=2) == [1, 2, 3]
    assert api.stats.requests == 2


def test_paginate_short_page_stops():
    api = _api(lambda r: httpx.Response(200, json=[1]))
    assert api.paginate("/list", page_size=50) == [1]
    assert api.stats.requests == 1


def test_map_collects_exceptions_in_order():
    api = _api(lambda r: httpx.Response(200, json={}))

    def fn(x):
        if x == 2:
            raise ValueError("boom")
        return x * 10

    out = api.map(fn, [1, 2, 3], workers=2)
    assert [(i, r) for i, r, _ in out] == [(1, 10), (2, None), (3, 30)]
    assert isinstance(out[1][2], ValueError)
