"""Unit tests for the ELI acts fetcher: rate limit, retry on 5xx, skip on 404,
atomic write, and idempotency on existing files."""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import httpx
import pytest

from supagraf.fetch import acts as fetch_mod


_LIST_PAGE = {
    "count": 2,
    "totalCount": 2,
    "offset": 0,
    "items": [
        {"ELI": "DU/2025/1", "publisher": "DU", "year": 2025, "pos": 1,
         "title": "Ustawa A", "type": "Ustawa", "status": "obowiązujący"},
        {"ELI": "DU/2025/2", "publisher": "DU", "year": 2025, "pos": 2,
         "title": "Ustawa B", "type": "Ustawa", "status": "obowiązujący"},
    ],
}

_DETAIL_TPL = {
    "publisher": "DU", "year": 2025, "type": "Ustawa", "title": "Ustawa A",
    "references": {}, "prints": [], "texts": [], "keywords": [],
}


def _resp(status: int, json_body=None, text: str = "") -> httpx.Response:
    if json_body is not None:
        return httpx.Response(
            status_code=status,
            json=json_body,
            request=httpx.Request("GET", "https://example.com"),
        )
    return httpx.Response(
        status_code=status,
        content=text.encode("utf-8") if text else b"",
        request=httpx.Request("GET", "https://example.com"),
    )


def test_fetch_writes_and_skips_existing(tmp_path: Path):
    """Two-item list: first detail fetched & written; second pre-exists -> skipped."""
    fixtures = tmp_path / "fixtures"
    fixtures.mkdir()
    # Pre-create fixture for pos=2 to test idempotent skip
    (fixtures / "sejm" / "eli" / "DU" / "2025").mkdir(parents=True)
    pre_existing = fixtures / "sejm" / "eli" / "DU" / "2025" / "2.json"
    pre_existing.write_text(json.dumps({"pre": True}), encoding="utf-8")

    calls: list[str] = []

    def fake_get(self, url, *args, **kwargs):  # noqa: ARG001
        calls.append(url)
        if url.endswith("/eli/acts/DU/2025"):
            return _resp(200, json_body=_LIST_PAGE)
        if url.endswith("/eli/acts/DU/2025/1"):
            return _resp(200, json_body={**_DETAIL_TPL, "ELI": "DU/2025/1", "pos": 1})
        return _resp(404, text="not found")

    with patch("httpx.Client.get", new=fake_get), \
         patch("supagraf.fetch.acts.fixtures_root", return_value=fixtures):
        report = fetch_mod.fetch_acts(years=[2025], throttle_s=0.0)

    assert report["detail_fetched"] == 1
    assert report["detail_skipped_existing"] == 1
    assert report["detail_skipped_404"] == 0
    assert report["errors"] == 0
    # Newly written file
    out = fixtures / "sejm" / "eli" / "DU" / "2025" / "1.json"
    assert out.exists() and out.stat().st_size > 0
    saved = json.loads(out.read_text(encoding="utf-8"))
    assert saved["ELI"] == "DU/2025/1"
    # Pre-existing untouched
    assert json.loads(pre_existing.read_text(encoding="utf-8")) == {"pre": True}


def test_fetch_skips_404_detail(tmp_path: Path):
    """404 on detail -> counted as skipped_404, no file written, no error raised."""
    fixtures = tmp_path / "fixtures"
    fixtures.mkdir()

    def fake_get(self, url, *args, **kwargs):  # noqa: ARG001
        if url.endswith("/eli/acts/DU/2025"):
            return _resp(200, json_body=_LIST_PAGE)
        return _resp(404, text="not found")

    with patch("httpx.Client.get", new=fake_get), \
         patch("supagraf.fetch.acts.fixtures_root", return_value=fixtures):
        report = fetch_mod.fetch_acts(years=[2025], throttle_s=0.0)

    assert report["detail_fetched"] == 0
    assert report["detail_skipped_404"] == 2
    assert not (fixtures / "sejm" / "eli" / "DU" / "2025" / "1.json").exists()


def test_fetch_retries_on_5xx_then_succeeds(tmp_path: Path):
    """Detail returns 503 once, then 200 — fetcher retries and writes the file."""
    fixtures = tmp_path / "fixtures"
    fixtures.mkdir()

    state = {"detail_calls": 0}

    def fake_get(self, url, *args, **kwargs):  # noqa: ARG001
        if url.endswith("/eli/acts/DU/2025"):
            return _resp(200, json_body={**_LIST_PAGE, "items": _LIST_PAGE["items"][:1]})
        # detail
        state["detail_calls"] += 1
        if state["detail_calls"] == 1:
            return _resp(503, text="bad gateway")
        return _resp(200, json_body={**_DETAIL_TPL, "ELI": "DU/2025/1", "pos": 1})

    with patch("httpx.Client.get", new=fake_get), \
         patch("supagraf.fetch.acts.fixtures_root", return_value=fixtures):
        report = fetch_mod.fetch_acts(years=[2025], throttle_s=0.0)

    assert state["detail_calls"] >= 2
    assert report["detail_fetched"] == 1
    assert report["errors"] == 0
    out = fixtures / "sejm" / "eli" / "DU" / "2025" / "1.json"
    assert out.exists()


def test_fetch_atomic_write_no_partial_files(tmp_path: Path):
    """After a successful write there must be no .tmp- residue in the dir."""
    fixtures = tmp_path / "fixtures"
    fixtures.mkdir()

    def fake_get(self, url, *args, **kwargs):  # noqa: ARG001
        if url.endswith("/eli/acts/DU/2025"):
            return _resp(200, json_body={**_LIST_PAGE, "items": _LIST_PAGE["items"][:1]})
        return _resp(200, json_body={**_DETAIL_TPL, "ELI": "DU/2025/1", "pos": 1})

    with patch("httpx.Client.get", new=fake_get), \
         patch("supagraf.fetch.acts.fixtures_root", return_value=fixtures):
        report = fetch_mod.fetch_acts(years=[2025], throttle_s=0.0)

    assert report["detail_fetched"] == 1
    out_dir = fixtures / "sejm" / "eli" / "DU" / "2025"
    files = sorted(p.name for p in out_dir.iterdir())
    assert files == ["1.json"]


def test_fetch_throttle_called(tmp_path: Path):
    """Throttle sleep is invoked between successful detail fetches."""
    fixtures = tmp_path / "fixtures"
    fixtures.mkdir()

    def fake_get(self, url, *args, **kwargs):  # noqa: ARG001
        if url.endswith("/eli/acts/DU/2025"):
            return _resp(200, json_body=_LIST_PAGE)
        return _resp(200, json_body={**_DETAIL_TPL, "ELI": url.split("/")[-1], "pos": int(url.split("/")[-1])})

    sleeps: list[float] = []

    def fake_sleep(s):
        sleeps.append(s)

    with patch("httpx.Client.get", new=fake_get), \
         patch("supagraf.fetch.acts.fixtures_root", return_value=fixtures), \
         patch("supagraf.fetch.acts.time.sleep", new=fake_sleep):
        report = fetch_mod.fetch_acts(years=[2025], throttle_s=0.5)

    assert report["detail_fetched"] == 2
    # 1 sleep after list + 2 after each detail = 3 total
    assert sum(1 for s in sleeps if s == 0.5) >= 3
