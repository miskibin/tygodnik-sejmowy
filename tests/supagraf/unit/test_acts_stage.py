"""Stage acts -- verify natural_id=eli_id and payload pass-through."""
from __future__ import annotations

import json
import os
from pathlib import Path
from unittest.mock import MagicMock, patch

from supagraf.stage import acts as stage_mod


_FAKE_ACT = {
    "ELI": "DU/2025/9999",
    "publisher": "DU",
    "year": 2025,
    "pos": 9999,
    "type": "Ustawa",
    "title": "Test ustawa",
    "status": "obowiązujący",
    "inForce": "IN_FORCE",
    "references": {
        "Akty zmienione": [{"id": "DU/2020/1", "date": "2025-01-01"}]
    },
    "prints": [],
    "texts": [],
    "keywords": [],
}


def _write_fixture(tmp_path: Path, year: int, pos: int, payload: dict) -> Path:
    target = tmp_path / "sejm" / "eli" / "DU" / str(year) / f"{pos}.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return target


def test_stage_acts_uses_eli_id_as_natural_key(tmp_path):
    """natural_id MUST be eli_id (text), upserted on conflict (eli_id)."""
    _write_fixture(tmp_path, 2025, 9999, _FAKE_ACT)
    captured: list[list[dict]] = []
    fake_client = MagicMock()

    def capture_upsert(rows, on_conflict=None):
        # On conflict MUST be eli_id (the natural key for acts).
        assert on_conflict == "eli_id"
        captured.append(rows)
        m = MagicMock()
        m.execute.return_value.data = rows
        return m

    fake_client.table.return_value.upsert.side_effect = capture_upsert

    with patch("supagraf.stage.acts.fixtures_root", return_value=tmp_path), \
         patch("supagraf.stage.acts.supabase", return_value=fake_client):
        report = stage_mod.stage(term=10)

    assert report.records_seen == 1
    assert report.records_upserted == 1
    assert not report.errors
    all_rows = [r for batch in captured for r in batch]
    assert len(all_rows) == 1
    row = all_rows[0]
    assert row["eli_id"] == "DU/2025/9999"
    assert row["payload"]["title"] == "Test ustawa"
    assert row["payload"]["references"]["Akty zmienione"][0]["id"] == "DU/2020/1"
    # source_path is POSIX-style relative to repo root; we don't assert exact
    # value here because tmp_path lives under a system-dependent root.
    assert "/" in row["source_path"] or row["source_path"]


def test_stage_acts_skips_underscore_files(tmp_path):
    """_index.json / _list.json must be excluded."""
    _write_fixture(tmp_path, 2025, 100, _FAKE_ACT | {"ELI": "DU/2025/100", "pos": 100})
    # Underscore-prefixed sibling
    bad = tmp_path / "sejm" / "eli" / "DU" / "2025" / "_index.json"
    bad.write_text(json.dumps({"ids": []}), encoding="utf-8")

    fake_client = MagicMock()
    fake_client.table.return_value.upsert.return_value.execute.return_value.data = [{}]

    captured: list[list[dict]] = []

    def capture_upsert(rows, on_conflict=None):  # noqa: ARG001
        captured.append(rows)
        m = MagicMock()
        m.execute.return_value.data = rows
        return m

    fake_client.table.return_value.upsert.side_effect = capture_upsert

    with patch("supagraf.stage.acts.fixtures_root", return_value=tmp_path), \
         patch("supagraf.stage.acts.supabase", return_value=fake_client):
        report = stage_mod.stage(term=10)

    assert report.records_seen == 1
    rows = [r for b in captured for r in b]
    assert {r["eli_id"] for r in rows} == {"DU/2025/100"}


def test_stage_acts_walks_year_subdirs(tmp_path):
    """Multiple year directories produce a flat list."""
    _write_fixture(tmp_path, 2024, 1, _FAKE_ACT | {"ELI": "DU/2024/1", "year": 2024, "pos": 1})
    _write_fixture(tmp_path, 2025, 2, _FAKE_ACT | {"ELI": "DU/2025/2", "pos": 2})
    _write_fixture(tmp_path, 2026, 3, _FAKE_ACT | {"ELI": "DU/2026/3", "year": 2026, "pos": 3})

    fake_client = MagicMock()
    fake_client.table.return_value.upsert.return_value.execute.return_value.data = [{}]
    captured: list[list[dict]] = []

    def capture_upsert(rows, on_conflict=None):  # noqa: ARG001
        captured.append(rows)
        m = MagicMock()
        m.execute.return_value.data = rows
        return m

    fake_client.table.return_value.upsert.side_effect = capture_upsert

    with patch("supagraf.stage.acts.fixtures_root", return_value=tmp_path), \
         patch("supagraf.stage.acts.supabase", return_value=fake_client):
        report = stage_mod.stage(term=10)

    assert report.records_seen == 3
    rows = [r for b in captured for r in b]
    assert {r["eli_id"] for r in rows} == {"DU/2024/1", "DU/2025/2", "DU/2026/3"}
