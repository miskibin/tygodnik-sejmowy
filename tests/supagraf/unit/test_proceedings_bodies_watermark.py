"""Watermark integration for supagraf.fetch.proceedings_bodies.

Verifies:
  - `_select_target_days` filters out rows whose proceeding is sealed
    (watermark `proceeding_body` set contains `term{T}__proc{N}`).
  - After all NULL-body statements of a proceeding are fetched in one
    `fetch_proceeding_bodies` run, the proceeding is sealed exactly once
    with source `predicate_all_bodies_present`.
  - Sealing does NOT happen for a proceeding that still has unfetched
    statements (e.g. one 404 and one success — the 404 leaves a gap).
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import httpx
import pytest
from tenacity import wait_none

import supagraf.fetch.proceedings_bodies as mod
from supagraf.etl import watermark


# Reuse the row helper and httpx-Client patcher from the sibling test file.
def _row(stmt_id: int, snum: int, proc_num: int, date: str, body_text=None):
    return {
        "id": stmt_id,
        "num": snum,
        "body_text": body_text,
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
    client = MagicMock()
    client.__enter__ = MagicMock(return_value=client)
    client.__exit__ = MagicMock(return_value=False)
    if isinstance(get_responses, list):
        client.get = MagicMock(side_effect=get_responses)
    else:
        client.get = MagicMock(return_value=get_responses)
    return client


@pytest.fixture
def isolated_fixtures(tmp_path, monkeypatch):
    fixtures = tmp_path / "fixtures"
    fixtures.mkdir()
    (fixtures / "sejm" / "proceedings").mkdir(parents=True)
    monkeypatch.setattr(mod, "fixtures_root", lambda: fixtures)
    return fixtures


@pytest.fixture(autouse=True)
def no_retry_sleep(monkeypatch):
    monkeypatch.setattr(mod._http_get_text.retry, "wait", wait_none())


@pytest.fixture
def empty_watermark_cache(monkeypatch):
    watermark._SEALED_CACHE.clear()
    seals: list[tuple[str, str, str]] = []

    def _fake_seal(entity, key, source="predicate"):
        seals.append((entity, key, source))
        watermark.load_sealed(entity).add(key)

    def _fake_load_sealed(entity):
        watermark._SEALED_CACHE.setdefault(entity, set())
        return watermark._SEALED_CACHE[entity]

    monkeypatch.setattr(watermark, "seal", _fake_seal)
    monkeypatch.setattr(watermark, "load_sealed", _fake_load_sealed)
    # Also patch the names imported into the fetcher module (if it does
    # `from supagraf.etl.watermark import ...`).
    monkeypatch.setattr(mod, "seal", _fake_seal, raising=False)
    monkeypatch.setattr(mod, "load_sealed", _fake_load_sealed, raising=False)
    return seals


# --------------- _select_target_days filters sealed proceedings ---------------

def test_select_target_days_skips_sealed_proceeding(monkeypatch, empty_watermark_cache):
    """Rows whose proceeding_number is in watermark cache must be filtered out."""
    # Seed cache: proceeding 51 is sealed, proceeding 52 is not.
    watermark._SEALED_CACHE["proceeding_body"] = {"term10__proc51"}

    # The DB query returns both proceedings' NULL-body rows.
    raw_rows = [
        _row(stmt_id=10, snum=0, proc_num=51, date="2026-02-10"),
        _row(stmt_id=20, snum=1, proc_num=52, date="2026-02-11"),
    ]

    # Patch the supabase client used inside _select_target_days. The query
    # chain is: supabase().table(...).select(...).eq(...).is_(...).order(...).range(...).execute().data
    cli = MagicMock()
    query = MagicMock()
    # Every chain method returns the same MagicMock so .a().b().c() keeps working.
    query.select.return_value = query
    query.eq.return_value = query
    query.is_.return_value = query
    query.order.return_value = query
    query.range.return_value = query

    page = MagicMock(); page.data = raw_rows
    empty = MagicMock(); empty.data = []
    query.execute.side_effect = [page, empty]
    cli.table.return_value = query
    monkeypatch.setattr(mod, "supabase", lambda: cli)

    out = mod._select_target_days(term=10)

    assert [r["id"] for r in out] == [20]  # only proceeding 52 row survives


# --------------- seal on completion of a proceeding ---------------

def test_seals_proceeding_when_all_bodies_fetched(isolated_fixtures, monkeypatch, empty_watermark_cache):
    """A proceeding with all-fetched-OK rows should be sealed once."""
    monkeypatch.setattr(mod, "_select_target_days", lambda term: [
        _row(stmt_id=1, snum=0, proc_num=51, date="2026-02-10"),
        _row(stmt_id=2, snum=1, proc_num=51, date="2026-02-10"),
    ])
    with patch.object(mod.httpx, "Client", return_value=_patched_client(_fake_response(200, "body"))):
        rep = mod.fetch_proceeding_bodies(term=10, throttle_s=0)

    assert rep["fetched"] == 2
    # Sealed once for proceeding 51, source identifies the predicate.
    assert empty_watermark_cache == [
        ("proceeding_body", "term10__proc51", "predicate_all_bodies_present"),
    ]


def test_does_not_seal_proceeding_with_unfetched_gap(isolated_fixtures, monkeypatch, empty_watermark_cache):
    """A 404 leaves a gap — proceeding must NOT be sealed."""
    monkeypatch.setattr(mod, "_select_target_days", lambda term: [
        _row(stmt_id=1, snum=0, proc_num=51, date="2026-02-10"),
        _row(stmt_id=2, snum=1, proc_num=51, date="2026-02-10"),
    ])
    responses = [_fake_response(200, "ok"), _fake_response(404)]
    with patch.object(mod.httpx, "Client", return_value=_patched_client(responses)):
        rep = mod.fetch_proceeding_bodies(term=10, throttle_s=0)

    assert rep["fetched"] == 1
    assert rep["skipped_404"] == 1
    # Proceeding 51 is NOT sealed because statement num=1 is missing.
    assert empty_watermark_cache == []


def test_does_not_seal_proceeding_with_write_error(isolated_fixtures, monkeypatch, empty_watermark_cache):
    """A write failure leaves the proceeding incomplete — must NOT seal."""
    monkeypatch.setattr(mod, "_select_target_days", lambda term: [
        _row(stmt_id=1, snum=0, proc_num=51, date="2026-02-10"),
    ])

    def _boom(target, text):
        raise OSError("disk full")

    monkeypatch.setattr(mod, "_atomic_write_text", _boom)
    with patch.object(mod.httpx, "Client", return_value=_patched_client(_fake_response(200, "body"))):
        rep = mod.fetch_proceeding_bodies(term=10, throttle_s=0)

    assert rep["fetched"] == 0
    assert rep["errors"] >= 1  # to_dict reduces errors to a count
    assert empty_watermark_cache == []
