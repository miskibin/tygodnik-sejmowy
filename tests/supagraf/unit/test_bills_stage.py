"""Stage bills — verify payload shape + _list.json/_index.json skip."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

from supagraf.stage import bills as stage_mod
from supagraf.stage.base import _iter_fixture_files


def test_iter_skips_underscore_prefixed_files():
    """`_list.json` and `_index.json` must be skipped."""
    files = list(_iter_fixture_files("bills"))
    names = {p.name for p in files}
    assert "_list.json" not in names
    assert "_index.json" not in names
    assert all(not n.startswith("_") for n in names)
    assert len(files) == 175


def test_stage_upserts_with_natural_id_slash_number():
    """natural_id must be the in-file `number` (slash form), NOT the filename stem."""
    captured_batches: list[list[dict]] = []

    fake_client = MagicMock()
    fake_client.table.return_value.upsert.return_value.execute.return_value.data = [{}]

    def capture_upsert(rows, on_conflict=None):  # noqa: ARG001
        captured_batches.append(rows)
        m = MagicMock()
        m.execute.return_value.data = rows
        return m

    fake_client.table.return_value.upsert.side_effect = capture_upsert

    with patch("supagraf.stage.base.supabase", return_value=fake_client):
        report = stage_mod.stage(term=10)

    assert report.records_seen == 175
    all_rows = [r for batch in captured_batches for r in batch]
    assert len(all_rows) == 175
    natural_ids = {r["natural_id"] for r in all_rows}
    # Slash form, NOT underscore.
    assert "RPW/10073/2026" in natural_ids
    assert "RPW_10073_2026" not in natural_ids
    # Per-row shape.
    sample = next(r for r in all_rows if r["natural_id"] == "RPW/10073/2026")
    assert sample["term"] == 10
    assert sample["payload"]["number"] == "RPW/10073/2026"
    assert sample["payload"]["applicantType"] == "DEPUTIES"
    assert sample["source_path"].endswith("RPW_10073_2026.json")
    assert "/" in sample["source_path"]  # POSIX-style relative
