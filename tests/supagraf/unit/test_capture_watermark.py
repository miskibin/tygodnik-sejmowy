"""Watermark integration for capture_* fetchers.

Verifies:
  - `capture_votings` skips detail GET for sealed `(proc, num)` pairs.
  - `capture_votings` seals each newly-captured voting with non-empty `votes`.
  - `capture_votings` does NOT seal a voting whose detail returns no `votes`
    (e.g. upstream returned a stub before the result was published).
"""
from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

import pytest

from supagraf.etl import watermark
from supagraf.fixtures.sources import sejm as sejm_src


class _StubClient:
    def __init__(self, responses: dict[str, Any]):
        self.responses = responses
        self.calls: list[str] = []

    @staticmethod
    def _strip_qs(path: str) -> str:
        return path.split("?", 1)[0]

    async def get_json(self, path: str) -> Any:
        self.calls.append(path)
        return self.responses.get(self._strip_qs(path))

    async def get_bytes(self, path: str) -> bytes | None:
        return b"\x00"

    async def get_text(self, path: str) -> str | None:
        return ""


def _run(coro):
    return asyncio.run(coro)


@pytest.fixture
def captured_seals(monkeypatch):
    watermark._SEALED_CACHE.clear()
    seals: list[tuple[str, str, str]] = []

    def _fake_seal(entity, key, source="predicate"):
        seals.append((entity, key, source))
        watermark._SEALED_CACHE.setdefault(entity, set()).add(key)

    def _fake_load_sealed(entity):
        return watermark._SEALED_CACHE.setdefault(entity, set())

    def _fake_bulk_seal(entity, keys, source):
        n = 0
        for k in keys:
            _fake_seal(entity, k, source)
            n += 1
        return n

    monkeypatch.setattr(watermark, "seal", _fake_seal)
    monkeypatch.setattr(watermark, "load_sealed", _fake_load_sealed)
    monkeypatch.setattr(watermark, "bulk_seal", _fake_bulk_seal)
    monkeypatch.setattr(sejm_src, "seal", _fake_seal, raising=False)
    monkeypatch.setattr(sejm_src, "load_sealed", _fake_load_sealed, raising=False)
    # Some fetchers import seal/bulk_seal/load_sealed at module load time —
    # patch the names bound on those modules too.
    import supagraf.fetch.committee_sittings as csmod
    import supagraf.fetch.acts as actsmod
    import supagraf.fetch.proceedings_bodies as bodiesmod
    monkeypatch.setattr(csmod, "bulk_seal", _fake_bulk_seal, raising=False)
    monkeypatch.setattr(actsmod, "seal", _fake_seal, raising=False)
    monkeypatch.setattr(actsmod, "bulk_seal", _fake_bulk_seal, raising=False)
    monkeypatch.setattr(actsmod, "load_sealed", _fake_load_sealed, raising=False)
    monkeypatch.setattr(bodiesmod, "seal", _fake_seal, raising=False)
    monkeypatch.setattr(bodiesmod, "load_sealed", _fake_load_sealed, raising=False)
    return seals


# --------------------- capture_votings: skip + seal ---------------------

def test_capture_votings_skips_sealed_voting(tmp_path: Path, captured_seals):
    """Sealed `(proc, num)` should not trigger detail GET."""
    watermark._SEALED_CACHE["voting"] = {"term10__28__1"}

    base = "/sejm/term10"
    client = _StubClient({
        f"{base}/votings": [{"proceeding": 28, "date": "2026-02-10"}],
        f"{base}/votings/28": [
            {"votingNumber": 1, "date": "2026-02-10T10:00:00", "votes": [1, 2]},
            {"votingNumber": 2, "date": "2026-02-10T11:00:00", "votes": [3, 4]},
        ],
        f"{base}/votings/28/1": {"votingNumber": 1, "votes": [1, 2]},
        f"{base}/votings/28/2": {"votingNumber": 2, "votes": [3, 4]},
    })

    ids = _run(sejm_src.capture_votings(
        client, tmp_path, term=10, year=2026,
        refresh=False, no_binaries=True, limit=None,
    ))

    # Only voting 2 should be captured; voting 1 was sealed.
    assert ids == ["28__2"]
    assert f"{base}/votings/28/1" not in client.calls
    assert f"{base}/votings/28/2" in client.calls


def test_capture_votings_seals_after_capture_with_votes(tmp_path: Path, captured_seals):
    """A voting whose detail contains a non-empty `votes` array must be sealed."""
    base = "/sejm/term10"
    client = _StubClient({
        f"{base}/votings": [{"proceeding": 28, "date": "2026-02-10"}],
        f"{base}/votings/28": [
            {"votingNumber": 1, "date": "2026-02-10T10:00:00", "votes": [1]},
        ],
        f"{base}/votings/28/1": {"votingNumber": 1, "votes": [1, 2, 3]},
    })

    _run(sejm_src.capture_votings(
        client, tmp_path, term=10, year=2026,
        refresh=False, no_binaries=True, limit=None,
    ))

    assert ("voting", "term10__28__1", "predicate_votes_captured") in captured_seals


def test_fetch_committee_sittings_seals_finished_status(tmp_path, captured_seals, monkeypatch):
    """Each committee bundle write should seal sittings whose status='FINISHED'."""
    from unittest.mock import MagicMock, patch
    import supagraf.fetch.committee_sittings as csmod

    monkeypatch.setattr(csmod, "fixtures_root", lambda: tmp_path)
    (tmp_path / "sejm" / "committee_sittings").mkdir(parents=True)

    # Bundle: 2 finished, 1 planned -> 2 seals.
    listing = [{"code": "ASW"}]
    sittings = [
        {"num": 10, "status": "FINISHED"},
        {"num": 11, "status": "FINISHED"},
        {"num": 12, "status": "PLANNED"},
    ]

    def _get_json(client, url):
        if url.endswith("/committees"):
            return listing
        if url.endswith("/committees/ASW/sittings"):
            return sittings
        return None

    monkeypatch.setattr(csmod, "_get_json", _get_json)
    fake_client = MagicMock()
    fake_client.__enter__ = MagicMock(return_value=fake_client)
    fake_client.__exit__ = MagicMock(return_value=False)
    with patch.object(csmod.httpx, "Client", return_value=fake_client):
        csmod.fetch_committee_sittings(term=10, throttle_s=0)

    finished_keys = {s[1] for s in captured_seals if s[0] == "committee_sitting"}
    assert finished_keys == {"term10__ASW__10", "term10__ASW__11"}


def test_fetch_acts_seals_settled_acts(tmp_path, captured_seals, monkeypatch):
    """Acts whose announcement_date < today-14d should be sealed; recent ones not."""
    from datetime import date, timedelta
    from unittest.mock import MagicMock, patch
    import supagraf.fetch.acts as actsmod

    monkeypatch.setattr(actsmod, "fixtures_root", lambda: tmp_path)

    settled = (date.today() - timedelta(days=60)).isoformat()
    recent = (date.today() - timedelta(days=3)).isoformat()

    listing = [
        {"ELI": "DU/2026/100", "publisher": "DU", "year": 2026, "pos": 100,
         "title": "Old", "type": "ustawa"},
        {"ELI": "DU/2026/200", "publisher": "DU", "year": 2026, "pos": 200,
         "title": "New", "type": "ustawa"},
    ]
    detail_settled = {
        "ELI": "DU/2026/100", "publisher": "DU", "year": 2026, "pos": 100,
        "type": "ustawa", "title": "Old", "address": "DU/2026/100",
        "displayAddress": "Dz.U. 2026 poz. 100", "announcementDate": settled,
        "changeDate": settled + "T00:00:00",
    }
    detail_recent = {
        "ELI": "DU/2026/200", "publisher": "DU", "year": 2026, "pos": 200,
        "type": "ustawa", "title": "New", "address": "DU/2026/200",
        "displayAddress": "Dz.U. 2026 poz. 200", "announcementDate": recent,
        "changeDate": recent + "T00:00:00",
    }

    def _fake_http_get(client, url):
        if url.endswith("/eli/acts/DU/2026"):
            return {"count": 2, "totalCount": 2, "items": listing}
        if url.endswith("/eli/acts/DU/2026/100"):
            return detail_settled
        if url.endswith("/eli/acts/DU/2026/200"):
            return detail_recent
        raise AssertionError(f"unexpected URL: {url}")

    monkeypatch.setattr(actsmod, "_http_get_json", _fake_http_get)
    fake_client = MagicMock()
    fake_client.__enter__ = MagicMock(return_value=fake_client)
    fake_client.__exit__ = MagicMock(return_value=False)
    with patch.object(actsmod.httpx, "Client", return_value=fake_client):
        actsmod.fetch_acts(years=[2026], publisher="DU", throttle_s=0)

    act_seals = {s[1] for s in captured_seals if s[0] == "act"}
    assert "DU__2026__100" in act_seals
    assert "DU__2026__200" not in act_seals


def test_capture_votings_does_not_seal_when_votes_missing(tmp_path: Path, captured_seals):
    """If the detail payload has no `votes` array, the voting is incomplete — no seal."""
    base = "/sejm/term10"
    client = _StubClient({
        f"{base}/votings": [{"proceeding": 28, "date": "2026-02-10"}],
        f"{base}/votings/28": [
            {"votingNumber": 1, "date": "2026-02-10T10:00:00"},
        ],
        # Detail returns a stub with no votes (still being tallied upstream).
        f"{base}/votings/28/1": {"votingNumber": 1, "title": "tbd"},
    })

    _run(sejm_src.capture_votings(
        client, tmp_path, term=10, year=2026,
        refresh=False, no_binaries=True, limit=None,
    ))

    assert all(s[0] != "voting" for s in captured_seals)
