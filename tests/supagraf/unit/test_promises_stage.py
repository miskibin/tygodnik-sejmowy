"""Stage promises from external fixtures."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

from supagraf.stage import promises as stage_mod
from supagraf.stage.base import _iter_fixture_files


def test_iter_external_promises():
    files = list(_iter_fixture_files("promises", subdir="external"))
    assert len(files) >= 1


def test_stage_promises_natural_id_format():
    fake_client = MagicMock()
    captured: list[list[dict]] = []

    def capture_upsert(rows, on_conflict=None):  # noqa: ARG001
        captured.append(rows)
        m = MagicMock()
        m.execute.return_value.data = rows
        return m

    fake_client.table.return_value.upsert.side_effect = capture_upsert

    with patch("supagraf.stage.base.supabase", return_value=fake_client):
        report = stage_mod.stage_promises(term=10)

    assert report.records_seen >= 1
    rows = [r for batch in captured for r in batch]
    for r in rows:
        assert "__" in r["natural_id"]
        party, slug = r["natural_id"].split("__", 1)
        assert party == r["payload"]["party_code"]
        assert slug == r["payload"]["slug"]
