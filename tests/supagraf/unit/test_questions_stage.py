"""Stage questions — verify both source dirs walked, kind set, _list/__ skipped."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

from supagraf.stage import questions as stage_mod


def test_iter_walks_both_dirs_and_skips_underscore_files():
    files = list(stage_mod._iter_question_files())
    # both kinds must show up
    kinds = {kind for _, kind in files}
    assert kinds == {"interpellation", "written"}
    # _list.json is skipped
    names = {p.name for p, _ in files}
    assert "_list.json" not in names
    assert all(not n.startswith("_") for n in names)
    # __body.html / __reply_*.html are .html so already filtered by *.json glob
    assert all(n.endswith(".json") for n in names)
    # exact counts from audit
    inter = sum(1 for _, k in files if k == "interpellation")
    written = sum(1 for _, k in files if k == "written")
    assert inter == 632
    assert written == 434


def test_stage_upserts_with_natural_id_and_kind():
    captured_batches: list[list[dict]] = []
    fake_client = MagicMock()
    fake_client.table.return_value.upsert.return_value.execute.return_value.data = [{}]

    def capture_upsert(rows, on_conflict=None):  # noqa: ARG001
        captured_batches.append(rows)
        m = MagicMock()
        m.execute.return_value.data = rows
        return m

    fake_client.table.return_value.upsert.side_effect = capture_upsert

    with patch("supagraf.stage.questions.supabase", return_value=fake_client):
        report = stage_mod.stage(term=10)

    assert report.records_seen == 1066
    all_rows = [r for batch in captured_batches for r in batch]
    assert len(all_rows) == 1066

    # kind is set on every row + matches the natural_id prefix
    kinds = {r["kind"] for r in all_rows}
    assert kinds == {"interpellation", "written"}
    for r in all_rows:
        assert r["natural_id"].startswith(f"{r['kind']}:")

    # natural_id uniqueness across kinds (kind-prefix avoids num overlap risk)
    ids = [r["natural_id"] for r in all_rows]
    assert len(ids) == len(set(ids))

    # source_path is the relative path under repo, with forward slashes
    sample = next(
        r for r in all_rows
        if r["kind"] == "interpellation" and r["natural_id"] == "interpellation:14441"
    )
    assert sample["term"] == 10
    assert sample["payload"]["num"] == 14441
    assert sample["source_path"].endswith("interpellations/14441.json")
    assert "/" in sample["source_path"]
