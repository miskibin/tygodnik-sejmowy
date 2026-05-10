"""Unit tests for supagraf.fetch.proceedings_bodies.

httpx + supabase mocked. Verifies:
  - happy fetch writes atomically
  - 404 counts as skipped_404 not error
  - 5xx retries (via tenacity), eventually succeeds
  - existing files are not refetched (idempotency)
  - throttle is honored
"""
from __future__ import annotations

import time
from pathlib import Path
from unittest.mock import MagicMock, patch

import httpx
import pytest
from tenacity import wait_none

import supagraf.fetch.proceedings_bodies as mod


@pytest.fixture
def isolated_fixtures(tmp_path, monkeypatch):
    """Redirect fixtures_root() to tmp_path so we don't touch the real tree."""
    fixtures = tmp_path / "fixtures"
    fixtures.mkdir()
    (fixtures / "sejm" / "proceedings").mkdir(parents=True)
    monkeypatch.setattr(mod, "fixtures_root", lambda: fixtures)
    return fixtures


@pytest.fixture(autouse=True)
def no_retry_sleep(monkeypatch):
    monkeypatch.setattr(mod._http_get_text.retry, "wait", wait_none())


def _row(stmt_id: int, snum: int, proc_num: int, date: str):
    return {
        "id": stmt_id,
        "num": snum,
        "body_text": None,
        "proceeding_day": {
            "id": 1,
            "date": date,
            "proceeding": {"number": proc_num, "term": 10},
        },
    }


def _fake_response(status_code: int, text: str = ""):
    r = MagicMock(spec=httpx.Response)
    r.status_code = status_code
    r.text = text
    return r


def _patched_client(get_responses):
    """Returns a context-managed httpx.Client mock that yields responses in order."""
    client = MagicMock()
    client.__enter__ = MagicMock(return_value=client)
    client.__exit__ = MagicMock(return_value=False)
    if isinstance(get_responses, list):
        client.get = MagicMock(side_effect=get_responses)
    else:
        client.get = MagicMock(return_value=get_responses)
    return client


def test_happy_writes_file_atomically(isolated_fixtures, monkeypatch):
    fixtures = isolated_fixtures
    monkeypatch.setattr(mod, "_select_target_days", lambda term: [
        _row(stmt_id=1, snum=0, proc_num=51, date="2026-02-10"),
    ])
    body = "<html><body>statement body</body></html>"
    with patch.object(mod.httpx, "Client", return_value=_patched_client(_fake_response(200, body))):
        rep = mod.fetch_proceeding_bodies(term=10, throttle_s=0)
    assert rep["fetched"] == 1
    assert rep["skipped_404"] == 0
    assert rep["errors"] == 0
    target = fixtures / "sejm" / "proceedings" / "51__2026-02-10__statements" / "0.html"
    assert target.exists()
    assert target.read_text(encoding="utf-8") == body
    # No leftover .tmp files (atomic write)
    assert not list(target.parent.glob(".tmp-*"))


def test_404_counts_as_skip_not_error(isolated_fixtures, monkeypatch):
    monkeypatch.setattr(mod, "_select_target_days", lambda term: [
        _row(stmt_id=1, snum=7, proc_num=51, date="2026-02-10"),
    ])
    with patch.object(mod.httpx, "Client", return_value=_patched_client(_fake_response(404))):
        rep = mod.fetch_proceeding_bodies(term=10, throttle_s=0)
    assert rep["fetched"] == 0
    assert rep["skipped_404"] == 1
    assert rep["errors"] == 0


def test_5xx_retries_then_succeeds(isolated_fixtures, monkeypatch):
    monkeypatch.setattr(mod, "_select_target_days", lambda term: [
        _row(stmt_id=1, snum=0, proc_num=51, date="2026-02-10"),
    ])
    responses = [
        _fake_response(503, "down"),
        _fake_response(503, "down"),
        _fake_response(200, "ok body"),
    ]
    with patch.object(mod.httpx, "Client", return_value=_patched_client(responses)):
        rep = mod.fetch_proceeding_bodies(term=10, throttle_s=0)
    assert rep["fetched"] == 1
    assert rep["errors"] == 0


def test_existing_file_skipped_idempotent(isolated_fixtures, monkeypatch):
    fixtures = isolated_fixtures
    target_dir = fixtures / "sejm" / "proceedings" / "51__2026-02-10__statements"
    target_dir.mkdir(parents=True)
    target = target_dir / "0.html"
    target.write_text("already there", encoding="utf-8")
    monkeypatch.setattr(mod, "_select_target_days", lambda term: [
        _row(stmt_id=1, snum=0, proc_num=51, date="2026-02-10"),
    ])
    fake_client = _patched_client(_fake_response(200, "should not be used"))
    with patch.object(mod.httpx, "Client", return_value=fake_client):
        rep = mod.fetch_proceeding_bodies(term=10, throttle_s=0)
    # Client may be opened (context manager) but GET must never run.
    fake_client.get.assert_not_called()
    assert rep["fetched"] == 0
    assert rep["skipped_existing"] == 1
    assert target.read_text(encoding="utf-8") == "already there"


def test_throttle_honored(isolated_fixtures, monkeypatch):
    monkeypatch.setattr(mod, "_select_target_days", lambda term: [
        _row(stmt_id=1, snum=0, proc_num=51, date="2026-02-10"),
        _row(stmt_id=2, snum=1, proc_num=51, date="2026-02-10"),
        _row(stmt_id=3, snum=2, proc_num=51, date="2026-02-10"),
    ])
    sleeps: list[float] = []
    monkeypatch.setattr(mod.time, "sleep", lambda s: sleeps.append(s))
    with patch.object(
        mod.httpx, "Client",
        return_value=_patched_client(_fake_response(200, "x")),
    ):
        mod.fetch_proceeding_bodies(term=10, throttle_s=0.42)
    # Three fetches => three sleeps of 0.42
    assert sleeps == [0.42, 0.42, 0.42]


def test_empty_body_skipped(isolated_fixtures, monkeypatch):
    monkeypatch.setattr(mod, "_select_target_days", lambda term: [
        _row(stmt_id=1, snum=0, proc_num=51, date="2026-02-10"),
    ])
    with patch.object(mod.httpx, "Client", return_value=_patched_client(_fake_response(200, "   "))):
        rep = mod.fetch_proceeding_bodies(term=10, throttle_s=0)
    assert rep["fetched"] == 0
    assert rep["skipped_404"] == 1


def test_limit_caps_attempts(isolated_fixtures, monkeypatch):
    rows = [_row(stmt_id=i, snum=i, proc_num=51, date="2026-02-10") for i in range(5)]
    monkeypatch.setattr(mod, "_select_target_days", lambda term: rows)
    with patch.object(mod.httpx, "Client", return_value=_patched_client(_fake_response(200, "x"))):
        rep = mod.fetch_proceeding_bodies(term=10, throttle_s=0, limit=2)
    assert rep["seen"] == 2
    assert rep["fetched"] == 2
