"""Unit tests for supagraf.enrich.pdf_fetch.

httpx is mocked; the legacy fixtures path is redirected via SUPAGRAF_PDF_CACHE
and a tmp_path fixtures_root override. No real network unless the
SUPAGRAF_TEST_NETWORK env flag is set (separate test file).
"""
from __future__ import annotations

import importlib
import os
import time
from pathlib import Path
from unittest.mock import MagicMock, patch

import httpx
import pytest


@pytest.fixture
def isolated_cache(tmp_path, monkeypatch):
    """Point the PDF cache + fixtures_root at tmp_path so tests don't touch
    the developer's real fixtures dir."""
    cache = tmp_path / "cache"
    fixtures = tmp_path / "fixtures"
    fixtures.mkdir()
    (fixtures / "sejm" / "prints").mkdir(parents=True)
    monkeypatch.setenv("SUPAGRAF_PDF_CACHE", str(cache))
    monkeypatch.setenv("SUPAGRAF_PDF_TTL", "86400")

    # Re-import module so it picks up env vars at import time.
    import supagraf.enrich.pdf_fetch as m
    importlib.reload(m)

    # Override fixtures_root inside the module.
    monkeypatch.setattr(m, "fixtures_root", lambda: fixtures)
    return m, cache, fixtures


def _make_pdf_response(body: bytes = b"%PDF-1.4\n...content...\n%%EOF\n"):
    r = MagicMock(spec=httpx.Response)
    r.content = body
    r.status_code = 200
    r.raise_for_status = MagicMock()
    return r


def _make_error_response(status: int):
    """4xx/5xx response: _get inspects status_code, callers raise_for_status."""
    r = MagicMock(spec=httpx.Response)
    r.status_code = status
    r.raise_for_status = MagicMock(
        side_effect=httpx.HTTPStatusError(
            str(status), request=MagicMock(), response=MagicMock(status_code=status)
        )
    )
    return r


def _patched_client(response):
    """Build a context-manager-friendly httpx.Client mock."""
    client = MagicMock()
    client.__enter__ = MagicMock(return_value=client)
    client.__exit__ = MagicMock(return_value=False)
    client.get = MagicMock(return_value=response)
    return client


def test_legacy_path_short_circuit_no_fetch(isolated_cache):
    m, cache, fixtures = isolated_cache
    # Place a "real" fixture file on disk.
    legacy = fixtures / "sejm" / "prints" / "2055-A__2055-A.pdf"
    legacy.write_bytes(b"%PDF-1.4 legacy\n")

    with patch("supagraf.enrich.pdf_fetch.httpx.Client") as mock_client:
        out = m.resolve_print_pdf("sejm/prints/2055-A__2055-A.pdf", term=10)

    assert out == legacy
    mock_client.assert_not_called()


def test_cache_miss_fetches_and_caches(isolated_cache):
    m, cache, fixtures = isolated_cache
    body = b"%PDF-1.7\nfetched\n"
    with patch(
        "supagraf.enrich.pdf_fetch.httpx.Client",
        return_value=_patched_client(_make_pdf_response(body)),
    ) as mc:
        p1 = m.resolve_print_pdf("sejm/prints/9999__9999.pdf", term=10)
    assert p1.exists()
    assert p1.read_bytes() == body
    assert mc.call_count == 1

    # Second call within TTL: must NOT hit network.
    with patch("supagraf.enrich.pdf_fetch.httpx.Client") as mc2:
        p2 = m.resolve_print_pdf("sejm/prints/9999__9999.pdf", term=10)
    assert p2 == p1
    mc2.assert_not_called()


def test_404_raises_pdf_fetch_error(isolated_cache):
    m, cache, fixtures = isolated_cache
    resp = _make_error_response(404)
    with patch(
        "supagraf.enrich.pdf_fetch.httpx.Client",
        return_value=_patched_client(resp),
    ):
        with pytest.raises(m.PdfFetchError):
            m.resolve_print_pdf("sejm/prints/0000__0000.pdf", term=10)


def test_non_pdf_body_rejected(isolated_cache):
    """Sejm 200-with-HTML-error case must not be cached as a PDF."""
    m, cache, fixtures = isolated_cache
    bad = _make_pdf_response(body=b"<html>error</html>")
    with patch(
        "supagraf.enrich.pdf_fetch.httpx.Client",
        return_value=_patched_client(bad),
    ):
        with pytest.raises(m.PdfFetchError, match="unexpected body type"):
            m.resolve_print_pdf("sejm/prints/0001__0001.pdf", term=10)


def test_url_segments_are_percent_encoded(isolated_cache):
    """Numbers/filenames carry spaces upstream — raw interpolation makes httpx
    reject the URL."""
    m, cache, fixtures = isolated_cache
    assert m._print_url(10, "1090 -001", "opinia 1090.pdf") == (
        "https://api.sejm.gov.pl/sejm/term10/prints/1090%20-001/opinia%201090.pdf"
    )
    # Stray whitespace from upstream is trimmed, not encoded.
    assert m._print_url(10, "1041-004\n", "1041-004.pdf") == (
        "https://api.sejm.gov.pl/sejm/term10/prints/1041-004/1041-004.pdf"
    )


def test_404_falls_back_to_upstream_attachment(isolated_cache):
    """print_attachments can be stale (1816-001 lists 1849-001.pdf upstream).
    A 404 must trigger a metadata re-read and retry, not a hard failure."""
    m, cache, fixtures = isolated_cache
    body = b"%PDF-1.7\nreal doc\n"

    def fake_get(url, *args, **kwargs):
        if url.endswith("/1816-001/1816-001.pdf"):
            return _make_error_response(404)
        if url.endswith("/prints/1816-001"):
            r = MagicMock(spec=httpx.Response)
            r.status_code = 200
            r.raise_for_status = MagicMock()
            r.json = MagicMock(return_value={"attachments": ["1849-001.pdf"]})
            return r
        return _make_pdf_response(body)

    client = MagicMock()
    client.__enter__ = MagicMock(return_value=client)
    client.__exit__ = MagicMock(return_value=False)
    client.get = MagicMock(side_effect=fake_get)

    with patch("supagraf.enrich.pdf_fetch.httpx.Client", return_value=client):
        out = m.resolve_print_pdf("sejm/prints/1816-001__1816-001.pdf", term=10)

    assert out.read_bytes() == body
    assert out.name.endswith("1816-001__1849-001.pdf")


def test_evict_expired(isolated_cache):
    m, cache, fixtures = isolated_cache
    cache.mkdir(parents=True, exist_ok=True)
    old1 = cache / "aa__1__1.pdf"
    old2 = cache / "bb__2__2.pdf"
    fresh = cache / "cc__3__3.pdf"
    for p in (old1, old2, fresh):
        p.write_bytes(b"%PDF-1.4")
    past = time.time() - 7200
    os.utime(old1, (past, past))
    os.utime(old2, (past, past))

    n = m.evict_expired(ttl=3600)
    assert n == 2
    assert not old1.exists() and not old2.exists()
    assert fresh.exists()


def test_ttl_zero_always_refetches(isolated_cache):
    m, cache, fixtures = isolated_cache
    body1 = b"%PDF-1.4 v1\n"
    body2 = b"%PDF-1.4 v2\n"

    with patch(
        "supagraf.enrich.pdf_fetch.httpx.Client",
        return_value=_patched_client(_make_pdf_response(body1)),
    ):
        m.resolve_print_pdf("sejm/prints/77__77.pdf", term=10, ttl=0)
    with patch(
        "supagraf.enrich.pdf_fetch.httpx.Client",
        return_value=_patched_client(_make_pdf_response(body2)),
    ) as mc:
        p2 = m.resolve_print_pdf("sejm/prints/77__77.pdf", term=10, ttl=0)
    assert p2.read_bytes() == body2
    assert mc.call_count == 1


def test_unsupported_relpath_shape_raises(isolated_cache):
    m, cache, fixtures = isolated_cache
    with pytest.raises(ValueError, match="unsupported pdf_relpath shape"):
        m.resolve_print_pdf("not/a/print/path.pdf", term=10)


def test_cleanup_pdf_force(isolated_cache):
    m, cache, fixtures = isolated_cache
    cache.mkdir(parents=True, exist_ok=True)
    p = cache / "abc__1__1.pdf"
    p.write_bytes(b"%PDF-1.4")
    m.cleanup_pdf(p, force=True)
    assert not p.exists()


def test_cleanup_pdf_protects_fixtures(isolated_cache):
    """Even with force=True, never delete a file under fixtures/."""
    m, cache, fixtures = isolated_cache
    legacy = fixtures / "sejm" / "prints" / "9__9.pdf"
    legacy.write_bytes(b"%PDF-1.4")
    m.cleanup_pdf(legacy, force=True)
    assert legacy.exists()


def test_metadata_404_raises_print_gone(isolated_cache):
    """A print that 404s on its own metadata endpoint (withdrawn/renumbered)
    is a permanent skip, not a nightly failure."""
    m, cache, fixtures = isolated_cache

    def fake_get(url, *args, **kwargs):
        return _make_error_response(404)

    client = MagicMock()
    client.__enter__ = MagicMock(return_value=client)
    client.__exit__ = MagicMock(return_value=False)
    client.get = MagicMock(side_effect=fake_get)

    with patch("supagraf.enrich.pdf_fetch.httpx.Client", return_value=client):
        with pytest.raises(m.PrintGoneError):
            m.resolve_print_pdf("sejm/prints/1041-004__1041-004.pdf", term=10)


def test_read_timeout_is_retried(isolated_cache):
    """api.sejm.gov.pl times out in bursts; one slow response must not
    permanently fail the print for the whole run."""
    m, cache, fixtures = isolated_cache
    body = b"%PDF-1.7\nslow but fine\n"
    calls = {"n": 0}

    def flaky_get(url, *args, **kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            raise httpx.ReadTimeout("The read operation timed out")
        return _make_pdf_response(body)

    client = MagicMock()
    client.__enter__ = MagicMock(return_value=client)
    client.__exit__ = MagicMock(return_value=False)
    client.get = MagicMock(side_effect=flaky_get)

    with patch("supagraf.enrich.pdf_fetch.httpx.Client", return_value=client):
        out = m.resolve_print_pdf("sejm/prints/2670__2670.pdf", term=10)

    assert out.read_bytes() == body
    assert calls["n"] == 2
