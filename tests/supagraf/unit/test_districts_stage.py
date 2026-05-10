"""Stage districts + postcodes from external fixtures."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

from supagraf.stage import districts as stage_mod
from supagraf.stage.base import _iter_fixture_files


def test_iter_external_districts():
    files = list(_iter_fixture_files("districts", subdir="external"))
    assert len(files) >= 1
    assert all(not p.name.startswith("_") for p in files)


def test_iter_external_postcodes():
    files = list(_iter_fixture_files("postcodes", subdir="external"))
    assert len(files) >= 1


def _mock_supabase():
    fake_client = MagicMock()
    fake_client.table.return_value.upsert.return_value.execute.return_value.data = [{}]

    captured: list[list[dict]] = []

    def capture_upsert(rows, on_conflict=None):  # noqa: ARG001
        captured.append(rows)
        m = MagicMock()
        m.execute.return_value.data = rows
        return m

    fake_client.table.return_value.upsert.side_effect = capture_upsert
    return fake_client, captured


def test_stage_districts_uses_num_as_natural_id():
    fake, captured = _mock_supabase()
    with patch("supagraf.stage.base.supabase", return_value=fake):
        report = stage_mod.stage_districts(term=10)

    assert report.records_seen >= 1
    rows = [r for batch in captured for r in batch]
    sample = rows[0]
    assert sample["term"] == 10
    assert sample["natural_id"].isdigit()
    assert sample["payload"]["num"] == int(sample["natural_id"])
    assert "external/districts" in sample["source_path"].replace("\\", "/")


def test_stage_postcodes_natural_id_pattern():
    fake, captured = _mock_supabase()
    with patch("supagraf.stage.base.supabase", return_value=fake):
        report = stage_mod.stage_district_postcodes(term=10)

    assert report.records_seen >= 1
    rows = [r for batch in captured for r in batch]
    sample = rows[0]
    assert "__" in sample["natural_id"]
    postcode_part, district_part = sample["natural_id"].split("__")
    assert sample["payload"]["postcode"] == postcode_part
    assert int(district_part) == sample["payload"]["district_num"]
