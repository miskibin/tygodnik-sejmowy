"""E2E test: fetch proceeding-bodies from api.sejm.gov.pl. Gated RUN_E2E=1.

Picks one statement that lacks body_text in the DB (chosen at runtime),
fetches the HTML body, verifies the on-disk file exists and is non-empty.
Does not run stage+load (that's covered in test_proceedings_e2e.py).
"""
from __future__ import annotations

import os

import pytest

from supagraf.db import supabase
from supagraf.fetch.proceedings_bodies import fetch_proceeding_bodies
from supagraf.fixtures.storage import fixtures_root

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_E2E") != "1",
    reason="e2e hits real api.sejm.gov.pl; set RUN_E2E=1 to enable",
)


def test_fetch_one_missing_body():
    """Fetch a single missing statement body. Verifies the URL works and the
    write actually lands on disk under fixtures/."""
    cli = supabase()
    # Pick a single bodyless statement deterministically.
    rows = (
        cli.table("proceeding_statements")
        .select("id, num, proceeding_day:proceeding_days(date, proceeding:proceedings(number))")
        .eq("term", 10)
        .is_("body_text", "null")
        .limit(1)
        .execute()
        .data
    ) or []
    if not rows:
        pytest.skip("no bodyless statements in DB — run after Etap 2 backfill complete")

    rep = fetch_proceeding_bodies(term=10, throttle_s=0, limit=1)
    # Either fetched it (most common) or it was a 404 — both are valid live
    # outcomes; we never expect an "errors" entry for a single random row.
    assert rep["errors"] == 0
    assert rep["fetched"] + rep["skipped_404"] >= 1

    if rep["fetched"] == 1:
        # File on disk?
        row = rows[0]
        date = row["proceeding_day"]["date"][:10]
        proc_num = row["proceeding_day"]["proceeding"]["number"]
        snum = row["num"]
        target = (
            fixtures_root() / "sejm" / "proceedings"
            / f"{proc_num}__{date}__statements" / f"{snum}.html"
        )
        assert target.exists()
        assert target.stat().st_size > 0
