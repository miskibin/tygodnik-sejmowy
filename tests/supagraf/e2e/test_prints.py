"""End-to-end prints test.

Stages prints from fixtures into Supabase, runs the prints load chain
(load_prints + load_prints_additional + load_print_relationships +
load_print_attachments), and asserts row counts, idempotency, FK integrity,
relationship semantics, unresolved-queue population, and cycle invariant.
Skipped by default; enable with `RUN_E2E=1`.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import pytest
from postgrest.exceptions import APIError

from supagraf.db import supabase
from supagraf.stage import prints as stage_prints

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_E2E") != "1",
    reason="e2e against live Supabase; set RUN_E2E=1 to enable",
)

REPO_ROOT = Path(__file__).resolve().parents[3]
PRINTS_DIR = REPO_ROOT / "fixtures" / "sejm" / "prints"


def _fixture_files() -> list[Path]:
    return [p for p in sorted(PRINTS_DIR.glob("*.json")) if not p.name.startswith("_")]


def _load(client) -> tuple[int, int, int, int]:
    p = client.rpc("load_prints", {"p_term": 10}).execute().data
    pa = client.rpc("load_prints_additional", {"p_term": 10}).execute().data
    pr = client.rpc("load_print_relationships", {"p_term": 10}).execute().data
    a = client.rpc("load_print_attachments", {"p_term": 10}).execute().data
    return int(p or 0), int(pa or 0), int(pr or 0), int(a or 0)


@pytest.fixture(scope="module")
def loaded():
    """Stage + load once. Returns (client, fixture_files, payloads_by_number)."""
    report = stage_prints.stage()
    assert report.ok(), report.errors
    client = supabase()
    _load(client)
    files = _fixture_files()
    payloads = {}
    for p in files:
        d = json.loads(p.read_text(encoding="utf-8"))
        payloads[d["number"]] = d
    return client, files, payloads


def test_print_row_count_matches_fixtures(loaded):
    """Parents = fixtures count; total = parents + additional children."""
    client, files, payloads = loaded
    parent_total = (
        client.table("prints")
        .select("id", count="exact")
        .eq("term", 10).eq("is_additional", False).execute().count
    )
    assert parent_total == len(files)
    expected_children = sum(len(p.get("additionalPrints", []) or []) for p in payloads.values())
    children = (
        client.table("prints")
        .select("id", count="exact")
        .eq("term", 10).eq("is_additional", True).execute().count
    )
    assert children == expected_children


def test_attachment_row_count_includes_children(loaded):
    """Attachments come from BOTH parent and additionalPrints[*] payloads."""
    client, _, payloads = loaded
    expected = 0
    for d in payloads.values():
        expected += len(d.get("attachments", []) or [])
        for child in d.get("additionalPrints", []) or []:
            expected += len(child.get("attachments", []) or [])
    rows = client.table("print_attachments").select("id", count="exact").execute()
    assert rows.count == expected


def test_no_orphan_attachments(loaded):
    client, _, _ = loaded
    pa = client.table("print_attachments").select("print_id").execute().data or []
    print_ids = {row["print_id"] for row in pa}
    if not print_ids:
        return
    p = client.table("prints").select("id").in_("id", list(print_ids)).execute().data or []
    found = {row["id"] for row in p}
    assert print_ids <= found, f"orphan print_ids: {print_ids - found}"


def test_self_ref_persisted(loaded):
    """Primary prints (processPrint[0] == own number) get is_self_ref=true edge."""
    client, _, payloads = loaded
    # Find any fixture where processPrint[0] == own number.
    primary = next(
        (n for n, d in payloads.items()
         if d.get("processPrint") and d["processPrint"][0] == n),
        None,
    )
    assert primary is not None, "expected at least one self-ref fixture"
    rows = (
        client.table("print_relationships")
        .select("from_number,to_number,is_self_ref,relation_type")
        .eq("term", 10).eq("from_number", primary).eq("to_number", primary)
        .eq("relation_type", "process").execute().data or []
    )
    assert len(rows) == 1
    assert rows[0]["is_self_ref"] is True
    # And the print row itself is_primary
    row = (
        client.table("prints")
        .select("is_primary")
        .eq("term", 10).eq("number", primary).single().execute().data
    )
    assert row["is_primary"] is True


def test_continuation_persisted(loaded):
    """Non-self processPrint that resolves to existing print → relation row,
    is_self_ref=false. Picks any fixture where processPrint[0] != number AND
    that target is also in fixtures."""
    client, _, payloads = loaded
    fixture_numbers = set(payloads.keys())
    pair = next(
        (
            (n, d["processPrint"][0])
            for n, d in payloads.items()
            if d.get("processPrint")
            and d["processPrint"][0] != n
            and d["processPrint"][0] in fixture_numbers
        ),
        None,
    )
    assert pair is not None, "expected continuation fixture pair"
    src, dst = pair
    rows = (
        client.table("print_relationships")
        .select("is_self_ref")
        .eq("term", 10).eq("from_number", src).eq("to_number", dst)
        .eq("relation_type", "process").execute().data or []
    )
    assert len(rows) == 1
    assert rows[0]["is_self_ref"] is False


def test_unresolved_queue_populated(loaded):
    """Cross-resource processPrint targets (not in prints) → unresolved_print_refs."""
    client, _, payloads = loaded
    fixture_numbers = set(payloads.keys())
    expected_unresolved = sum(
        1
        for n, d in payloads.items()
        if d.get("processPrint")
        and d["processPrint"][0] != n
        and d["processPrint"][0] not in fixture_numbers
    )
    assert expected_unresolved >= 1
    cnt = (
        client.table("unresolved_print_refs")
        .select("id", count="exact")
        .eq("term", 10).is_("resolved_at", "null").execute().count
    )
    assert cnt == expected_unresolved


def test_children_flattened(loaded):
    """additionalPrints[*] become first-class prints rows with is_additional=true."""
    client, _, payloads = loaded
    expected = sum(len(d.get("additionalPrints", []) or []) for d in payloads.values())
    cnt = (
        client.table("prints")
        .select("id", count="exact")
        .eq("term", 10).eq("is_additional", True).execute().count
    )
    assert cnt == expected


def test_children_parent_fk_resolves(loaded):
    """Every is_additional=true row's parent_number resolves to a prints row."""
    client, _, _ = loaded
    children = (
        client.table("prints")
        .select("number,parent_number")
        .eq("term", 10).eq("is_additional", True).execute().data or []
    )
    assert all(c["parent_number"] for c in children)
    parents = {c["parent_number"] for c in children}
    found = (
        client.table("prints")
        .select("number")
        .eq("term", 10).in_("number", list(parents)).execute().data or []
    )
    assert {r["number"] for r in found} == parents


def test_no_nested_additionals(loaded):
    """Children in fixtures never have their own additionalPrints."""
    _, _, payloads = loaded
    for d in payloads.values():
        for child in d.get("additionalPrints", []) or []:
            assert not child.get("additionalPrints"), (
                f"unexpected nested additionalPrints in {d['number']} child {child.get('number')}"
            )


def test_cycle_invariant_zero(loaded):
    """assert_invariants reports zero non-self-ref process cycles."""
    client, _, _ = loaded
    inv = client.rpc("assert_invariants", {"p_term": 10}).execute().data
    assert inv["print_cycles_count"] == 0
    assert inv["prints_additional_orphan"] == 0


def test_hard_fk_dangling_rejected(loaded):
    """Direct insert of a print_relationships row with dangling to_number must
    raise an FK violation (deferred FK fires at end of statement when not in
    explicit transaction)."""
    client, _, _ = loaded
    src = (
        client.table("prints").select("number")
        .eq("term", 10).eq("is_additional", False).limit(1).execute().data or []
    )
    assert src
    src_n = src[0]["number"]
    raised = False
    try:
        client.table("print_relationships").insert({
            "term": 10,
            "from_number": src_n,
            "to_number": "DOES-NOT-EXIST-9999",
            "relation_type": "process",
            "is_self_ref": False,
            "ordinal": 0,
        }).execute()
    except APIError:
        raised = True
    assert raised, "expected FK violation on dangling to_number"


def test_idempotency_rerun(loaded):
    """Re-run full load chain — counts unchanged."""
    client, files, payloads = loaded
    inv_before = client.rpc("assert_invariants", {"p_term": 10}).execute().data
    _load(client)
    inv_after = client.rpc("assert_invariants", {"p_term": 10}).execute().data
    for k in (
        "prints_total",
        "prints_primary_count",
        "prints_additional_count",
        "print_relationships_total",
        "unresolved_print_refs_open",
    ):
        assert inv_after[k] == inv_before[k], f"{k}: {inv_before[k]} -> {inv_after[k]}"


def test_attachments_multi_level(loaded):
    """Find a fixture where BOTH parent and a child have attachments; assert both
    rows exist with distinct print_id."""
    client, _, payloads = loaded
    pair = None
    for d in payloads.values():
        if not (d.get("attachments") or []):
            continue
        for child in d.get("additionalPrints", []) or []:
            if child.get("attachments"):
                pair = (d["number"], child["number"])
                break
        if pair:
            break
    if pair is None:
        pytest.skip("no fixture with attachments on both parent and a child")
    parent_n, child_n = pair
    rows = (
        client.table("prints")
        .select("id,number")
        .eq("term", 10).in_("number", [parent_n, child_n]).execute().data or []
    )
    by_n = {r["number"]: r["id"] for r in rows}
    assert parent_n in by_n and child_n in by_n
    assert by_n[parent_n] != by_n[child_n]
    pa = (
        client.table("print_attachments")
        .select("print_id", count="exact")
        .eq("print_id", by_n[parent_n]).execute().count
    )
    ca = (
        client.table("print_attachments")
        .select("print_id", count="exact")
        .eq("print_id", by_n[child_n]).execute().count
    )
    assert pa >= 1 and ca >= 1


def test_update_path_change_date_propagates(loaded):
    client, files, _ = loaded
    sample = files[0]
    payload = json.loads(sample.read_text(encoding="utf-8"))
    number = payload["number"]
    bumped = "2099-12-31T00:00:00"
    bumped_payload = {**payload, "changeDate": bumped}
    client.table("_stage_prints").upsert(
        [{
            "term": 10,
            "natural_id": number,
            "payload": bumped_payload,
            "source_path": str(sample.relative_to(REPO_ROOT)).replace("\\", "/"),
        }],
        on_conflict="term,natural_id",
    ).execute()
    client.rpc("load_prints", {"p_term": 10}).execute()
    row = (
        client.table("prints")
        .select("change_date")
        .eq("term", 10).eq("number", number).single().execute().data
    )
    assert row["change_date"].startswith("2099-12-31")
    # restore
    client.table("_stage_prints").upsert(
        [{
            "term": 10,
            "natural_id": number,
            "payload": payload,
            "source_path": str(sample.relative_to(REPO_ROOT)).replace("\\", "/"),
        }],
        on_conflict="term,natural_id",
    ).execute()
    client.rpc("load_prints", {"p_term": 10}).execute()


def test_multiple_attachments_ordinal(loaded):
    client, files, _ = loaded
    multi = next(
        (p for p in files if len(json.loads(p.read_text(encoding="utf-8")).get("attachments", [])) >= 2),
        None,
    )
    assert multi is not None, "expected at least one fixture with 2+ attachments"
    payload = json.loads(multi.read_text(encoding="utf-8"))
    number = payload["number"]
    p = (
        client.table("prints")
        .select("id")
        .eq("term", 10).eq("number", number).single().execute().data
    )
    rows = (
        client.table("print_attachments")
        .select("ordinal,filename")
        .eq("print_id", p["id"])
        .order("ordinal").execute().data or []
    )
    assert len(rows) == len(payload["attachments"])
    for i, row in enumerate(rows):
        assert row["ordinal"] == i
        assert row["filename"] == payload["attachments"][i]
