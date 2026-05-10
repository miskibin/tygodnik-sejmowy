"""Stage committees — verify payload shape + _list.json skip."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

from supagraf.stage import committees as stage_mod
from supagraf.stage.base import _iter_fixture_files


def test_iter_skips_underscore_prefixed_files():
    """`_list.json` (and any `_*` file) must be skipped."""
    files = list(_iter_fixture_files("committees"))
    names = {p.name for p in files}
    assert "_list.json" not in names
    assert all(not n.startswith("_") for n in names)
    assert len(files) == 40


def test_stage_upserts_with_natural_id_code():
    """Mock the supabase client; verify the per-row payload matches expected shape."""
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

    assert report.records_seen == 40
    # All staged rows: natural_id is the committee code (matches filename stem).
    all_rows = [r for batch in captured_batches for r in batch]
    assert len(all_rows) == 40
    natural_ids = {r["natural_id"] for r in all_rows}
    assert "ASW" in natural_ids
    # Each row has term + payload + source_path + captured_at.
    sample = next(r for r in all_rows if r["natural_id"] == "ASW")
    assert sample["term"] == 10
    assert sample["payload"]["code"] == "ASW"
    assert isinstance(sample["payload"]["members"], list)
    assert sample["source_path"].endswith("ASW.json")
    assert "/" in sample["source_path"]  # POSIX-style relative
