"""E2E: backfill print?committee_sitting links on live DB."""
from __future__ import annotations

import os

import pytest

from supagraf.backfill.committee_sitting_links import backfill_print_committee_sitting_links
from supagraf.db import supabase

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_E2E") != "1",
    reason="e2e against live Supabase; set RUN_E2E=1 to enable",
)


def test_backfill_print_committee_sitting_links_builds_links():
    sb = supabase()

    # RED/GREEN sanity: dry-run should discover at least some candidates.
    preview = backfill_print_committee_sitting_links(term=10, dry_run=True)
    assert preview["candidates"] > 0

    # Real write run.
    result = backfill_print_committee_sitting_links(term=10, dry_run=False)
    assert result["candidates"] > 0

    # Table-level smoke: links exist for term 10 (via flattened view).
    rows = (
        sb.table("print_committee_sittings_v")
        .select("print_id, term, matched_print_number, sitting_id, committee_id")
        .eq("term", 10)
        .limit(200)
        .execute()
        .data
        or []
    )
    assert rows, "expected non-empty print_committee_sittings_v after backfill"

    # Integrity: sampled links must resolve print_id and committee_id.
    print_ids = sorted({r["print_id"] for r in rows})
    committee_ids = sorted({r["committee_id"] for r in rows})
    assert print_ids and committee_ids

    found_prints = (
        sb.table("prints").select("id").in_("id", print_ids).limit(len(print_ids)).execute().data
        or []
    )
    found_committees = (
        sb.table("committees").select("id").in_("id", committee_ids).limit(len(committee_ids)).execute().data
        or []
    )
    assert len(found_prints) == len(print_ids)
    assert len(found_committees) == len(committee_ids)


def test_backfill_print_committee_sitting_links_idempotent_second_run():
    # First run may insert; second should not.
    _ = backfill_print_committee_sitting_links(term=10, dry_run=False)
    again = backfill_print_committee_sitting_links(term=10, dry_run=False)
    assert again["inserted"] == 0

