"""Stage processes — verify payload shape + _list.json/_index.json skip."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

from supagraf.stage import processes as stage_mod
from supagraf.stage.base import _iter_fixture_files


def test_iter_skips_underscore_prefixed_files():
    """`_list.json` and `_index.json` (any `_*` file) must be skipped."""
    files = list(_iter_fixture_files("processes"))
    names = {p.name for p in files}
    assert "_list.json" not in names
    assert "_index.json" not in names
    assert all(not n.startswith("_") for n in names)
    assert len(files) == 164


def test_stage_upserts_with_natural_id_number():
    """Mock supabase; verify per-row payload shape + natural_id == process.number."""
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

    assert report.records_seen == 164
    all_rows = [r for batch in captured_batches for r in batch]
    assert len(all_rows) == 164
    natural_ids = {r["natural_id"] for r in all_rows}
    assert "2200" in natural_ids
    assert "17719-z" in natural_ids
    sample = next(r for r in all_rows if r["natural_id"] == "2200")
    assert sample["term"] == 10
    assert sample["payload"]["number"] == "2200"
    assert isinstance(sample["payload"]["stages"], list)
    assert sample["source_path"].endswith("2200.json")
    assert "/" in sample["source_path"]
