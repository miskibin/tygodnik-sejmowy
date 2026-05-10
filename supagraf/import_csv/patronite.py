"""Patronite CSV importer. Operator dumps monthly CSV from Patronite author
dashboard; this idempotently upserts to patrons_monthly. No scraping, no API."""
from __future__ import annotations

import csv
from pathlib import Path

from supagraf.db import supabase


def import_patronite_csv(*, month: str, csv_path: Path, source: str = "patronite-csv") -> dict:
    """Read CSV (expected cols: count, total_zl), upsert to patrons_monthly.

    Month must be YYYY-MM-01 (first of month).
    """
    cli = supabase()
    with csv_path.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    if len(rows) != 1:
        raise ValueError(f"expected exactly 1 data row, got {len(rows)}")
    row = rows[0]
    n = int(row["count"])
    total = float(row["total_zl"])
    cli.table("patrons_monthly").upsert(
        {
            "month": month,
            "n_patrons": n,
            "total_zl": total,
            "source": source,
        },
        on_conflict="month",
    ).execute()
    return {"month": month, "n_patrons": n, "total_zl": total}
