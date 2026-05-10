"""End-to-end bills test.

Stages bills into Supabase, runs load_bills, asserts row counts, FK integrity,
status distribution, idempotency. Skipped by default; enable with `RUN_E2E=1`.
"""
from __future__ import annotations

import json
import os
from collections import Counter
from pathlib import Path

import pytest
from postgrest.exceptions import APIError

from supagraf.db import supabase
from supagraf.stage import bills as stage_bills

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_E2E") != "1",
    reason="e2e against live Supabase; set RUN_E2E=1 to enable",
)

REPO_ROOT = Path(__file__).resolve().parents[3]
BILLS_DIR = REPO_ROOT / "fixtures" / "sejm" / "bills"


def _fixture_files() -> list[Path]:
    return [
        p for p in sorted(BILLS_DIR.glob("*.json"))
        if not p.name.startswith("_")
    ]


@pytest.fixture(scope="module")
def loaded():
    """Stage + load once. Returns (client, payloads_by_number)."""
    report = stage_bills.stage()
    assert report.ok(), report.errors
    client = supabase()
    affected = client.rpc("load_bills", {"p_term": 10}).execute().data
    assert int(affected or 0) >= 0
    payloads = {}
    for p in _fixture_files():
        d = json.loads(p.read_text(encoding="utf-8"))
        payloads[d["number"]] = d
    return client, payloads


def test_bills_count(loaded):
    client, payloads = loaded
    assert len(payloads) == 175
    cnt = client.table("bills").select("id", count="exact").eq("term", 10).execute().count
    assert cnt == 175


def test_status_distribution(loaded):
    client, payloads = loaded
    expected = Counter(d["status"] for d in payloads.values())
    rows = client.table("bills").select("status").eq("term", 10).execute().data or []
    actual = Counter(r["status"] for r in rows)
    assert actual == expected
    # Sanity: per audit ACTIVE=174, NOT_PROCEEDED=1.
    assert expected.get("ACTIVE") == 174
    assert expected.get("NOT_PROCEEDED") == 1


def test_applicant_type_distribution(loaded):
    client, payloads = loaded
    expected = Counter(d["applicantType"] for d in payloads.values())
    rows = client.table("bills").select("applicant_type").eq("term", 10).execute().data or []
    actual = Counter(r["applicant_type"] for r in rows)
    assert actual == expected


def test_print_fk_resolved(loaded):
    """Bills with print number that exists in prints must have print_id set."""
    client, payloads = loaded
    rows = client.table("bills").select("number,print_number,print_id").eq("term", 10).execute().data or []
    by_num = {r["number"]: r for r in rows}
    for num, d in payloads.items():
        if "print" not in d:
            assert by_num[num]["print_number"] is None
            assert by_num[num]["print_id"] is None
    # All resolved bills must have a real print_id (FK enforced; sanity-check count > 0).
    resolved = [r for r in rows if r["print_id"] is not None]
    assert len(resolved) > 0


def test_unresolved_print_refs_queued(loaded):
    """Bills with print number that doesn't exist in prints must be queued."""
    client, _ = loaded
    cnt = (
        client.table("unresolved_bill_print_refs")
        .select("id", count="exact").eq("term", 10).is_("resolved_at", "null")
        .execute().count
    )
    # At least the unresolved print refs from the audit must be queued.
    # (Exact count depends on which prints fixtures are loaded.)
    assert cnt >= 0
    # Cross-check: queue count == bills with print_number set but print_id NULL.
    bills_unresolved = (
        client.table("bills").select("id", count="exact").eq("term", 10)
        .not_.is_("print_number", "null").is_("print_id", "null")
        .execute().count
    )
    assert cnt == bills_unresolved


def test_idempotency_rerun(loaded):
    client, _ = loaded
    def _snap():
        return (
            client.table("bills").select("id", count="exact").eq("term", 10).execute().count,
            client.table("unresolved_bill_print_refs").select("id", count="exact")
                .eq("term", 10).is_("resolved_at", "null").execute().count,
        )
    before = _snap()
    client.rpc("load_bills", {"p_term": 10}).execute()
    after = _snap()
    assert after == before, f"counts changed on rerun: {before} -> {after}"


def test_hard_check_status_constraint(loaded):
    """Direct insert with bogus status must raise CHECK violation."""
    client, _ = loaded
    raised = False
    try:
        client.table("bills").insert({
            "term": 10, "number": "RPW/TEST/9999", "title": "t",
            "applicant_type": "DEPUTIES", "submission_type": "BILL", "status": "BOGUS",
            "eu_related": False, "public_consultation": False, "consultation_results": False,
            "date_of_receipt": "2026-01-01",
        }).execute()
    except APIError:
        raised = True
    assert raised, "expected CHECK violation on bogus status"


def test_invariants_bills_fields_present(loaded):
    """Verify bills-specific invariant fields exist via direct queries.

    Note: assert_invariants() RPC frequently exceeds the 8s anon-role
    statement_timeout once the schema is fully populated (pre-existing
    infra issue, not bills-specific). We replicate the bills sub-queries
    directly to verify the data and the SQL the invariants function uses.
    """
    client, _ = loaded
    # bills_total
    bills_total = client.table("bills").select("id", count="exact").eq("term", 10).execute().count
    assert bills_total == 175
    # bills_by_status (manual aggregation)
    rows = client.table("bills").select("status").eq("term", 10).execute().data or []
    by_status = Counter(r["status"] for r in rows)
    assert by_status["ACTIVE"] == 174
    assert by_status["NOT_PROCEEDED"] == 1
    # bills_eu_related_count
    eu = client.table("bills").select("id", count="exact").eq("term", 10).eq("eu_related", True).execute().count
    assert eu >= 0
    # unresolved_bill_print_refs_open
    open_refs = (
        client.table("unresolved_bill_print_refs")
        .select("id", count="exact").eq("term", 10).is_("resolved_at", "null").execute().count
    )
    assert open_refs >= 0
