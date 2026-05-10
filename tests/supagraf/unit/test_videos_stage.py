"""Stage videos — verify payload shape + _list.json/_index.json skip."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

from supagraf.stage import videos as stage_mod
from supagraf.stage.base import _iter_fixture_files


def test_iter_skips_underscore_prefixed_files():
    """`_list.json` and `_index.json` must be skipped."""
    files = list(_iter_fixture_files("videos"))
    names = {p.name for p in files}
    assert "_list.json" not in names
    assert "_index.json" not in names
    assert all(not n.startswith("_") for n in names)
    assert len(files) == 1000


def test_stage_upserts_with_natural_id_unid():
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

    assert report.records_seen == 1000
    all_rows = [r for batch in captured_batches for r in batch]
    assert len(all_rows) == 1000
    # natural_id must be the unid (matches filename stem)
    sample = all_rows[0]
    assert sample["term"] == 10
    assert "natural_id" in sample
    assert sample["payload"]["unid"] == sample["natural_id"]
    assert sample["source_path"].startswith("fixtures/sejm/videos/")
    assert "/" in sample["source_path"]  # POSIX-style relative
