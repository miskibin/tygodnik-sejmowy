"""E2E coverage tests for prints / agenda relinking.

Three invariants that must hold after `backfill-prints` runs and onwards:

  1. UPSTREAM_COVERAGE — every print listed in the upstream `/prints` index
     must exist in our `prints` table for that term. Historical year filter
     in `capture_prints` is the documented gap; backfill-prints is the
     fix. This test FAILS if the gap reappears (someone reintroduces the
     year filter without an off-switch, or a load step regresses).

  2. AGENDA_REF_CLOSURE — `unresolved_agenda_print_refs` must NOT contain
     print_numbers that DO exist in `prints` for the same term. That would
     mean the load_proceedings relink missed them — backfill-prints calls
     load_proceedings precisely to close this loop.

  3. SMOKE_KNOWN_PRINTS — print 104 and 609 (historical, both upstream OK)
     must have at least one `agenda_item_prints` entry after backfill.
     These were the canonical "missing" examples from the bug investigation
     2026-05-14; regression here means we lost the connection between
     prints and proceedings agenda again.

Skipped by default. Enable with `RUN_E2E=1`. Network access to
api.sejm.gov.pl required for invariant 1.
"""
from __future__ import annotations

import os

import httpx
import pytest

from supagraf.db import supabase

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_E2E") != "1",
    reason="e2e against live Supabase + api.sejm.gov.pl; set RUN_E2E=1 to enable",
)

TERM = 10
UPSTREAM_LIST_URL = f"https://api.sejm.gov.pl/sejm/term{TERM}/prints?limit=5000"

# Coverage tolerance — upstream listings can lag/disagree at the margins
# (a print may be 404 from /prints/N detail while listed; we don't want to
# alert on single-row drift). 1% gap is the threshold we'd act on.
COVERAGE_THRESHOLD = 0.99

# Two specific historical prints used as smoke tests. Both were confirmed
# missing on 2026-05-14 and present upstream. After backfill they must
# show up in agenda_item_prints (both were referenced in sitting agendas).
SMOKE_PRINT_NUMBERS = ("104", "609")


@pytest.fixture(scope="module")
def sb():
    return supabase()


@pytest.fixture(scope="module")
def upstream_prints() -> set[str]:
    """All print numbers listed by upstream `/prints?limit=5000`.

    Filtered to numeric-only base numbers so we compare apples to apples
    with our prints table (which also stores sub-prints like "1000-001"
    that aren't in the listing — those come from upstream detail
    JSON's `additionalPrints`, not the master listing)."""
    r = httpx.get(UPSTREAM_LIST_URL, timeout=30.0, follow_redirects=True)
    r.raise_for_status()
    data = r.json()
    items = data.get("items") if isinstance(data, dict) else data
    return {str(p["number"]) for p in items if p.get("number") is not None}


def test_upstream_coverage(sb, upstream_prints: set[str]):
    """Every upstream print must exist locally. Gap > 1% is a regression."""
    # Pull every prints.number for term in pages (PostgREST default cap = 1000).
    have: set[str] = set()
    page = 1000
    offset = 0
    while True:
        rows = (
            sb.table("prints")
            .select("number")
            .eq("term", TERM)
            .order("id")
            .range(offset, offset + page - 1)
            .execute()
            .data
            or []
        )
        if not rows:
            break
        have.update(r["number"] for r in rows)
        if len(rows) < page:
            break
        offset += len(rows)

    missing = upstream_prints - have
    coverage = 1.0 - (len(missing) / max(1, len(upstream_prints)))
    sample = sorted(missing, key=lambda x: int(x) if x.isdigit() else 0)[:15]
    assert coverage >= COVERAGE_THRESHOLD, (
        f"coverage {coverage:.3%} below threshold {COVERAGE_THRESHOLD:.0%}: "
        f"{len(missing)} of {len(upstream_prints)} upstream prints missing. "
        f"Sample missing: {sample}. "
        f"Fix: `python -m supagraf backfill-prints --term {TERM}`"
    )


def test_agenda_ref_closure(sb):
    """If a print exists in `prints`, it MUST NOT also be in
    `unresolved_agenda_print_refs` (with resolved_at IS NULL). That's a
    relink bug — load_proceedings should have inserted into
    agenda_item_prints on the next pass."""
    prints_have: set[str] = set()
    page = 1000
    offset = 0
    while True:
        rows = (
            sb.table("prints")
            .select("number")
            .eq("term", TERM)
            .order("id")
            .range(offset, offset + page - 1)
            .execute()
            .data
            or []
        )
        if not rows:
            break
        prints_have.update(r["number"] for r in rows)
        if len(rows) < page:
            break
        offset += len(rows)

    unresolved: set[str] = set()
    offset = 0
    while True:
        rows = (
            sb.table("unresolved_agenda_print_refs")
            .select("print_number")
            .eq("term", TERM)
            .is_("resolved_at", "null")
            .order("id")
            .range(offset, offset + page - 1)
            .execute()
            .data
            or []
        )
        if not rows:
            break
        unresolved.update(r["print_number"] for r in rows)
        if len(rows) < page:
            break
        offset += len(rows)

    leak = unresolved & prints_have
    assert not leak, (
        f"{len(leak)} print_numbers are both in `prints` AND in "
        f"`unresolved_agenda_print_refs` (resolved_at IS NULL). "
        f"Sample: {sorted(leak, key=lambda x: int(x) if x.isdigit() else 0)[:15]}. "
        f"Fix: re-run `load_proceedings` RPC (or `backfill-prints` which calls it)."
    )


@pytest.mark.parametrize("print_number", SMOKE_PRINT_NUMBERS)
def test_smoke_known_historical_prints_have_agenda_links(sb, print_number: str):
    """Specific historical prints flagged on 2026-05-14 as missing
    agenda_item_prints. After backfill they must reconnect."""
    # 1. Print must exist locally
    row = (
        sb.table("prints")
        .select("id")
        .eq("term", TERM)
        .eq("number", print_number)
        .limit(1)
        .maybeSingle()
        .execute()
        .data
    )
    assert row is not None, (
        f"print {TERM}/{print_number} missing from local prints table — "
        f"backfill-prints likely never ran or failed mid-way"
    )

    # 2. Must have at least one agenda_item_prints entry
    links = (
        sb.table("agenda_item_prints")
        .select("agenda_item_id", count="exact")
        .eq("term", TERM)
        .eq("print_number", print_number)
        .execute()
    )
    count = links.count or 0
    assert count > 0, (
        f"print {TERM}/{print_number} has zero agenda_item_prints links. "
        f"Upstream this print is referenced in plenary agendas — relink "
        f"failed. Re-run `load_proceedings` or check agenda_parser regression."
    )
