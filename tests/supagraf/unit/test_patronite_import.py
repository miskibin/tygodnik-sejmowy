"""Unit: Patronite CSV importer (mocked supabase)."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest


def _write_csv(tmp_path: Path, rows: list[dict]) -> Path:
    p = tmp_path / "patronite.csv"
    if not rows:
        p.write_text("count,total_zl\n", encoding="utf-8")
        return p
    headers = list(rows[0].keys())
    lines = [",".join(headers)]
    for r in rows:
        lines.append(",".join(str(r[h]) for h in headers))
    p.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return p


def test_import_patronite_csv_parses_and_upserts(tmp_path):
    from supagraf.import_csv import patronite as mod

    csv_path = _write_csv(tmp_path, [{"count": "42", "total_zl": "1234.50"}])

    fake_cli = MagicMock()
    fake_table = MagicMock()
    fake_upsert = MagicMock()
    fake_cli.table.return_value = fake_table
    fake_table.upsert.return_value = fake_upsert
    fake_upsert.execute.return_value = MagicMock(data=[])

    with patch.object(mod, "supabase", return_value=fake_cli):
        report = mod.import_patronite_csv(month="2026-05-01", csv_path=csv_path)

    assert report == {"month": "2026-05-01", "n_patrons": 42, "total_zl": 1234.5}
    fake_cli.table.assert_called_once_with("patrons_monthly")
    fake_table.upsert.assert_called_once_with(
        {
            "month": "2026-05-01",
            "n_patrons": 42,
            "total_zl": 1234.5,
            "source": "patronite-csv",
        },
        on_conflict="month",
    )
    fake_upsert.execute.assert_called_once()


def test_import_patronite_csv_rejects_multi_row(tmp_path):
    from supagraf.import_csv import patronite as mod

    csv_path = _write_csv(
        tmp_path,
        [
            {"count": "1", "total_zl": "10"},
            {"count": "2", "total_zl": "20"},
        ],
    )
    with patch.object(mod, "supabase", return_value=MagicMock()):
        with pytest.raises(ValueError, match="expected exactly 1 data row"):
            mod.import_patronite_csv(month="2026-05-01", csv_path=csv_path)


def test_import_patronite_csv_rejects_zero_rows(tmp_path):
    from supagraf.import_csv import patronite as mod

    csv_path = _write_csv(tmp_path, [])
    with patch.object(mod, "supabase", return_value=MagicMock()):
        with pytest.raises(ValueError, match="expected exactly 1 data row"):
            mod.import_patronite_csv(month="2026-05-01", csv_path=csv_path)


def test_import_patronite_csv_custom_source(tmp_path):
    from supagraf.import_csv import patronite as mod

    csv_path = _write_csv(tmp_path, [{"count": "5", "total_zl": "50"}])

    fake_cli = MagicMock()
    fake_cli.table.return_value.upsert.return_value.execute.return_value = MagicMock(data=[])

    with patch.object(mod, "supabase", return_value=fake_cli):
        report = mod.import_patronite_csv(
            month="2026-05-01", csv_path=csv_path, source="manual"
        )

    assert report["n_patrons"] == 5
    upsert_call = fake_cli.table.return_value.upsert.call_args
    assert upsert_call.args[0]["source"] == "manual"
