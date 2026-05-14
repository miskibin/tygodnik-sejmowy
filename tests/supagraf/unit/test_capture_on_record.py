"""Capture functions must invoke `on_record(natural_id, payload, source_path)`
once per saved entity when the callback is supplied.

Stubs the SejmClient.get_json so each capture_* runs offline. Verifies:
  - one callback per entity
  - natural_id matches the staging layer's key derivation
  - source_path is a POSIX-style fixture path
  - default `on_record=None` is back-compatible (legacy CLI path)
"""
from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

import pytest

from supagraf.fixtures.sources import sejm as sejm_src


class _StubClient:
    """Minimal SejmClient stand-in: routes `get_json(path)` from a fixture map.

    Path query strings are stripped before lookup so paginated callers (which
    append `?limit=N&offset=K`) hit the same key as direct callers.
    """

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


def _collector() -> tuple[list[tuple[str, dict, str]], Any]:
    recorded: list[tuple[str, dict, str]] = []

    def cb(nid: str, payload: dict, src: str) -> None:
        recorded.append((nid, payload, src))

    return recorded, cb


def _run(coro):
    return asyncio.run(coro)


def test_capture_mps_fires_callback_per_mp(tmp_path: Path):
    base = "/sejm/term10"
    client = _StubClient({
        f"{base}/MP": [{"id": 1}, {"id": 2}],
        f"{base}/MP/1": {"id": 1, "firstName": "A"},
        f"{base}/MP/2": {"id": 2, "firstName": "B"},
        f"{base}/MP/1/votings/stats": [],
        f"{base}/MP/2/votings/stats": [],
    })
    recorded, cb = _collector()

    ids = _run(sejm_src.capture_mps(
        client, tmp_path, term=10,
        refresh=False, no_binaries=True, limit=None,
        on_record=cb,
    ))

    assert sorted(ids) == ["1", "2"]
    assert {nid for nid, _, _ in recorded} == {"1", "2"}
    one = next((p for nid, p, _ in recorded if nid == "1"), None)
    assert one == {"id": 1, "firstName": "A"}
    for _, _, src in recorded:
        assert src.startswith("fixtures/sejm/mps/")
        assert "\\" not in src
        assert src.endswith(".json")


def test_capture_clubs_fires_callback_per_club(tmp_path: Path):
    base = "/sejm/term10"
    client = _StubClient({
        f"{base}/clubs": [{"id": "KO"}, {"id": "PiS"}],
        f"{base}/clubs/KO": {"id": "KO", "name": "Koalicja Obywatelska"},
        f"{base}/clubs/PiS": {"id": "PiS", "name": "Prawo i Sprawiedliwość"},
    })
    recorded, cb = _collector()
    _run(sejm_src.capture_clubs(
        client, tmp_path, term=10,
        refresh=False, no_binaries=True, limit=None, on_record=cb,
    ))
    assert {nid for nid, _, _ in recorded} == {"KO", "PiS"}


def test_capture_prints_natural_id_is_print_number(tmp_path: Path):
    base = "/sejm/term10"
    client = _StubClient({
        f"{base}/prints": [
            {"number": "1234", "changeDate": "2026-01-15"},
            {"number": "5678", "changeDate": "2026-02-10"},
        ],
        f"{base}/prints/1234": {"number": "1234", "title": "Ustawa A"},
        f"{base}/prints/5678": {"number": "5678", "title": "Ustawa B"},
    })
    recorded, cb = _collector()
    _run(sejm_src.capture_prints(
        client, tmp_path, term=10, year=2026,
        refresh=False, no_binaries=True, limit=None, on_record=cb,
    ))
    assert {nid for nid, _, _ in recorded} == {"1234", "5678"}


def test_capture_processes_natural_id_is_process_number(tmp_path: Path):
    base = "/sejm/term10"
    client = _StubClient({
        f"{base}/processes": [{"number": "100", "changeDate": "2026-03-01"}],
        f"{base}/processes/100": {"number": "100", "title": "Proc A"},
    })
    recorded, cb = _collector()
    _run(sejm_src.capture_processes(
        client, tmp_path, term=10, year=2026,
        refresh=False, no_binaries=True, limit=None, on_record=cb,
    ))
    assert recorded == [
        ("100", {"number": "100", "title": "Proc A"},
         "fixtures/sejm/processes/100.json"),
    ]


def test_capture_videos_natural_id_is_unid(tmp_path: Path):
    base = "/sejm/term10"
    client = _StubClient({
        f"{base}/videos": [
            {"unid": "AB12", "date": "2026-04-01"},
            {"unid": "CD34", "date": "2026-04-02"},
        ],
    })
    recorded, cb = _collector()
    _run(sejm_src.capture_videos(
        client, tmp_path, term=10, year=2026,
        refresh=False, limit=None, on_record=cb,
    ))
    assert {nid for nid, _, _ in recorded} == {"AB12", "CD34"}


def test_capture_bills_natural_id_is_bill_number(tmp_path: Path):
    base = "/sejm/term10"
    client = _StubClient({
        f"{base}/bills": [
            {"id": 1, "number": "RPW/100/2026", "date": "2026-05-01"},
        ],
    })
    recorded, cb = _collector()
    _run(sejm_src.capture_bills(
        client, tmp_path, term=10, year=2026,
        refresh=False, limit=None, on_record=cb,
    ))
    assert [nid for nid, _, _ in recorded] == ["RPW/100/2026"]


def test_capture_default_on_record_none_is_back_compat(tmp_path: Path):
    """Calling without on_record (legacy CLI path) must not break."""
    base = "/sejm/term10"
    client = _StubClient({
        f"{base}/clubs": [{"id": "KO"}],
        f"{base}/clubs/KO": {"id": "KO", "name": "Koalicja"},
    })
    # No on_record argument — must work exactly like before.
    ids = _run(sejm_src.capture_clubs(
        client, tmp_path, term=10,
        refresh=False, no_binaries=True, limit=None,
    ))
    assert ids == ["KO"]


def test_on_record_exception_is_swallowed_not_raised(tmp_path: Path):
    """Callback failures must NOT abort the capture loop."""
    base = "/sejm/term10"
    client = _StubClient({
        f"{base}/clubs": [{"id": "KO"}, {"id": "PiS"}],
        f"{base}/clubs/KO": {"id": "KO"},
        f"{base}/clubs/PiS": {"id": "PiS"},
    })

    def cb_raises(nid, p, src):
        raise RuntimeError("simulated DB outage")

    # Must complete normally; both fixtures still written to disk.
    ids = _run(sejm_src.capture_clubs(
        client, tmp_path, term=10,
        refresh=False, no_binaries=True, limit=None,
        on_record=cb_raises,
    ))
    assert sorted(ids) == ["KO", "PiS"]
    assert (tmp_path / "sejm" / "clubs" / "KO.json").exists()
    assert (tmp_path / "sejm" / "clubs" / "PiS.json").exists()
