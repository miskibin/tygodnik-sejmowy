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
    r.raise_for_status = MagicMock()
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
    resp = MagicMock(spec=httpx.Response)
    resp.raise_for_status = MagicMock(
        side_effect=httpx.HTTPStatusError(
            "404", request=MagicMock(), response=MagicMock(status_code=404)
        )
    )
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
        with pytest.raises(m.PdfFetchError, match="non-PDF body"):
            m.resolve_print_pdf("sejm/prints/0001__0001.pdf", term=10)


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
