"""E2E completeness tests for the "Punkty obrad" section on the print page.

Validates that the data path
    agenda_item_prints -> agenda_items -> proceedings
                       \\-> statement_print_links (count)
that the frontend reads in `lib/db/prints.ts:getPrint` returns complete,
non-orphaned rows for every print that has any plenary agenda presence.

Priority: completeness — we want to be loud when we silently drop points
(e.g. a stray NULL proceedings join, FK rot, or backfill regression).

Strategy: invariants on the full table + a random sample of 20 prints whose
end-to-end chain we walk exactly the way the frontend does.

Skipped by default. Enable with `RUN_E2E=1`.
"""
from __future__ import annotations

import os
import random

import pytest

from supagraf.db import supabase

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_E2E") != "1",
    reason="e2e against live Supabase; set RUN_E2E=1 to enable",
)

TERM = 10
SAMPLE_SIZE = 20
RNG_SEED = 42  # deterministic sample across runs


@pytest.fixture(scope="module")
def sb():
    return supabase()


# ---------------------------------------------------------------------------
# Whole-table invariants — fast, no sampling.
# ---------------------------------------------------------------------------

def test_agenda_item_prints_reference_real_prints(sb):
    """Every (term, print_number) in agenda_item_prints must resolve to a
    prints row. FK enforces this, but verifying covers DB drift / migration
    bugs that would silently drop frontend rows."""
    aip = sb.table("agenda_item_prints").select("term, print_number").eq("term", TERM).execute().data or []
    if not aip:
        pytest.skip("no agenda_item_prints rows for term — nothing to verify")
    pairs = {(r["term"], r["print_number"]) for r in aip}
    # Pull just the keys we need; supabase select can't IN across composite keys
    # easily, so fetch the whole term's prints index (cheap).
    prints = sb.table("prints").select("term, number").eq("term", TERM).execute().data or []
    real = {(r["term"], r["number"]) for r in prints}
    missing = pairs - real
    assert not missing, f"agenda_item_prints references {len(missing)} non-existent prints; sample: {list(missing)[:5]}"


def test_agenda_items_reference_real_proceedings(sb):
    """agenda_items.proceeding_id must point to a real proceedings row.
    A NULL/orphan here silently drops the entire sitting group on the
    frontend (proceedings join returns null → row filtered out)."""
    items = sb.table("agenda_items").select("id, proceeding_id").execute().data or []
    if not items:
        pytest.skip("no agenda_items rows")
    proc_ids = {r["proceeding_id"] for r in items}
    procs = sb.table("proceedings").select("id").in_("id", list(proc_ids)).execute().data or []
    real = {r["id"] for r in procs}
    missing = proc_ids - real
    assert not missing, f"agenda_items reference {len(missing)} non-existent proceedings; sample: {list(missing)[:5]}"


def test_statement_print_links_agenda_item_consistent_with_aip(sb):
    """When statement_print_links.agenda_item_id is set, the (print_id, that
    agenda_item) must also appear in agenda_item_prints. Otherwise the count
    we display includes statements anchored to an agenda item that doesn't
    actually reference this print — a backfill bug we'd never notice in UI."""
    links = (
        sb.table("statement_print_links")
        .select("print_id, agenda_item_id")
        .not_.is_("agenda_item_id", "null")
        .execute()
        .data
        or []
    )
    if not links:
        pytest.skip("no statement_print_links with agenda_item_id (backfill not run)")

    # Build (agenda_item_id -> term, print_number) from prints + agenda_item_prints
    aip = sb.table("agenda_item_prints").select("agenda_item_id, term, print_number").execute().data or []
    # Map agenda_item_prints to print_id via prints
    prints = sb.table("prints").select("id, term, number").eq("term", TERM).execute().data or []
    pid_by_key = {(r["term"], r["number"]): r["id"] for r in prints}
    valid_pairs: set[tuple[int, int]] = set()
    for r in aip:
        pid = pid_by_key.get((r["term"], r["print_number"]))
        if pid is not None:
            valid_pairs.add((pid, r["agenda_item_id"]))

    inconsistent = [
        (lnk["print_id"], lnk["agenda_item_id"])
        for lnk in links
        if (lnk["print_id"], lnk["agenda_item_id"]) not in valid_pairs
    ]
    assert not inconsistent, (
        f"{len(inconsistent)} statement_print_links rows have agenda_item_id "
        f"that does not appear in agenda_item_prints for that print; "
        f"sample: {inconsistent[:5]}"
    )


# ---------------------------------------------------------------------------
# Sampled end-to-end walk — mirrors the frontend query path.
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def sampled_print_ids(sb):
    """Pick 20 random prints (by id) that have at least one agenda_item_prints
    row. Deterministic via RNG_SEED so failures reproduce."""
    aip = sb.table("agenda_item_prints").select("term, print_number").eq("term", TERM).execute().data or []
    if not aip:
        pytest.skip("no agenda_item_prints rows for term")
    distinct = sorted({(r["term"], r["print_number"]) for r in aip})
    rng = random.Random(RNG_SEED)
    rng.shuffle(distinct)
    return distinct[:SAMPLE_SIZE]


def test_sampled_prints_have_complete_proceeding_chain(sb, sampled_print_ids):
    """For each sampled print, every agenda_item_prints row resolves to a full
    chain (agenda_item with non-empty title/ord, proceedings with non-empty
    dates and a positive sitting number). A NULL anywhere = a row the frontend
    silently filters out."""
    failures: list[str] = []
    for term, number in sampled_print_ids:
        aip = (
            sb.table("agenda_item_prints")
            .select("agenda_item_id")
            .eq("term", term)
            .eq("print_number", number)
            .execute()
            .data
            or []
        )
        ai_ids = [r["agenda_item_id"] for r in aip]
        if not ai_ids:
            failures.append(f"{term}/{number}: aip empty but listed in sample")
            continue
        items = (
            sb.table("agenda_items")
            .select("id, ord, title, proceeding_id")
            .in_("id", ai_ids)
            .execute()
            .data
            or []
        )
        if len(items) != len(ai_ids):
            failures.append(f"{term}/{number}: {len(ai_ids) - len(items)} agenda_items missing")
            continue
        for ai in items:
            if ai["ord"] is None or ai["ord"] <= 0:
                failures.append(f"{term}/{number}: agenda_item {ai['id']} has invalid ord={ai['ord']}")
            if not ai.get("title"):
                failures.append(f"{term}/{number}: agenda_item {ai['id']} has empty title")
        proc_ids = sorted({ai["proceeding_id"] for ai in items})
        procs = (
            sb.table("proceedings")
            .select("id, number, title, dates")
            .in_("id", proc_ids)
            .execute()
            .data
            or []
        )
        if len(procs) != len(proc_ids):
            failures.append(f"{term}/{number}: {len(proc_ids) - len(procs)} proceedings missing")
            continue
        for proc in procs:
            if not proc.get("number") or proc["number"] <= 0:
                failures.append(f"{term}/{number}: proceeding {proc['id']} has invalid number={proc.get('number')}")
            if not proc.get("dates"):
                failures.append(f"{term}/{number}: proceeding {proc['id']} has empty dates")
    assert not failures, "\n".join(failures[:30])


def test_sampled_prints_statement_counts_are_nonnegative(sb, sampled_print_ids):
    """statement_print_links agenda_item_id may resolve to a count. Verify
    counts are sane (>= 0) and that counts > 0 imply agenda_item is in this
    print's agenda_item_prints."""
    # Resolve sample (term, number) -> print_id
    prints = sb.table("prints").select("id, term, number").eq("term", TERM).execute().data or []
    pid_by_key = {(r["term"], r["number"]): r["id"] for r in prints}

    failures: list[str] = []
    for term, number in sampled_print_ids:
        printid = pid_by_key.get((term, number))
        if printid is None:
            failures.append(f"{term}/{number}: not in prints table")
            continue
        # Agenda items the frontend would show
        aip = (
            sb.table("agenda_item_prints")
            .select("agenda_item_id")
            .eq("term", term)
            .eq("print_number", number)
            .execute()
            .data
            or []
        )
        agenda_set = {r["agenda_item_id"] for r in aip}

        # Statement links keyed on this print
        links = (
            sb.table("statement_print_links")
            .select("agenda_item_id")
            .eq("print_id", printid)
            .not_.is_("agenda_item_id", "null")
            .execute()
            .data
            or []
        )
        for lnk in links:
            aid = lnk["agenda_item_id"]
            if aid not in agenda_set:
                failures.append(
                    f"{term}/{number}: statement_print_links has agenda_item_id={aid} "
                    "but it is not in agenda_item_prints for this print"
                )
    assert not failures, "\n".join(failures[:30])


def test_sampled_prints_grouping_by_sitting_yields_distinct_ords(sb, sampled_print_ids):
    """Within a single sitting, the same print should not appear at the same
    agenda ord twice — that would indicate a duplicate agenda_item row, which
    breaks the per-sitting grouping in the UI."""
    failures: list[str] = []
    for term, number in sampled_print_ids:
        aip = (
            sb.table("agenda_item_prints")
            .select("agenda_item_id")
            .eq("term", term)
            .eq("print_number", number)
            .execute()
            .data
            or []
        )
        ai_ids = [r["agenda_item_id"] for r in aip]
        if not ai_ids:
            continue
        items = (
            sb.table("agenda_items")
            .select("id, ord, proceeding_id")
            .in_("id", ai_ids)
            .execute()
            .data
            or []
        )
        # Group by proceeding_id, check ord uniqueness
        by_proc: dict[int, list[int]] = {}
        for ai in items:
            by_proc.setdefault(ai["proceeding_id"], []).append(ai["ord"])
        for pid, ords in by_proc.items():
            if len(ords) != len(set(ords)):
                failures.append(
                    f"{term}/{number}: proceeding {pid} has duplicate ords {sorted(ords)}"
                )
    assert not failures, "\n".join(failures[:30])
