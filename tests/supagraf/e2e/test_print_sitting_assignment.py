"""End-to-end invariants for `print_sitting_assignment` view (migration 0102).

The view backs the Tygodnik per-sitting feed. Citizen review of posiedzenie 57
(2026-05-22) found only 1 bill displayed despite 18 being on the agenda;
root cause was the legacy process_stages-based assignment. Migration 0102
rewires the view to be a pure agenda mapping. These tests guard the two
invariants:

  1. Soundness ("tylko tam"): every row in print_sitting_assignment must
     correspond to a real agenda hit — no phantom assignments.
  2. Completeness ("wszystkie agenda points gdzie maja byc"): every
     (print, sitting) appearing on an agenda must be present in the view.

Skipped by default. Enable with `RUN_E2E=1`.
"""
from __future__ import annotations

import os

import pytest

from supagraf.db import supabase

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_E2E") != "1",
    reason="e2e against live Supabase; set RUN_E2E=1 to enable",
)

TERM = 10


def _rpc(client, sql: str):
    res = client.rpc("exec_sql", {"query": sql}).execute().data
    if isinstance(res, dict) and res.get("status") == "error":
        pytest.fail(f"exec_sql error: {res.get('message')} (sqlstate={res.get('sqlstate')})")
    return res


@pytest.fixture(scope="module")
def client():
    return supabase()


def test_assignment_is_subset_of_agenda(client):
    """Every (print_id, sitting_num) in the view must trace back to an
    agenda_item_prints row joined to a matching proceedings.number."""
    rows = _rpc(client, f"""
        select psa.print_id, psa.sitting_num
        from public.print_sitting_assignment psa
        where psa.term = {TERM}
          and not exists (
            select 1
            from public.prints pr
            join public.agenda_item_prints aip
              on aip.term = pr.term and aip.print_number = pr.number
            join public.agenda_items ai on ai.id = aip.agenda_item_id
            join public.proceedings pc on pc.id = ai.proceeding_id
            where pr.id = psa.print_id
              and pc.number = psa.sitting_num
              and pc.term = psa.term
          )
        limit 50
    """)
    assert rows == [], f"phantom assignments (not backed by agenda): {rows}"


def test_agenda_is_subset_of_assignment(client):
    """Every (print_id, sitting_num) pair derivable from the agenda must
    appear in the view — completeness in the opposite direction."""
    rows = _rpc(client, f"""
        with agenda_pairs as (
          select distinct pr.id as print_id, pr.term, pc.number as sitting_num
          from public.prints pr
          join public.agenda_item_prints aip
            on aip.term = pr.term and aip.print_number = pr.number
          join public.agenda_items ai on ai.id = aip.agenda_item_id
          join public.proceedings pc on pc.id = ai.proceeding_id
          where pr.term = {TERM}
        )
        select ap.print_id, ap.sitting_num
        from agenda_pairs ap
        where not exists (
          select 1 from public.print_sitting_assignment psa
          where psa.print_id = ap.print_id
            and psa.sitting_num = ap.sitting_num
            and psa.term = ap.term
        )
        limit 50
    """)
    assert rows == [], f"agenda hits missing from view: {rows}"


def test_no_duplicate_rows(client):
    """View must emit each (print_id, sitting_num) at most once per term."""
    rows = _rpc(client, f"""
        select print_id, sitting_num, count(*) as n
        from public.print_sitting_assignment
        where term = {TERM}
        group by print_id, sitting_num
        having count(*) > 1
        limit 10
    """)
    assert rows == [], f"duplicate assignments: {rows}"


def test_sitting_57_regression(client):
    """Posiedzenie 57 (12-15 maja 2026) had 18 Tygodnik-eligible bills on
    its agenda. Pre-0102, only 1 surfaced. Guard against future regression
    of the underlying view."""
    rows = _rpc(client, f"""
        select count(distinct psa.print_id) as n
        from public.print_sitting_assignment psa
        join public.prints pr on pr.id = psa.print_id
        where psa.term = {TERM}
          and psa.sitting_num = 57
          and pr.document_category = 'projekt_ustawy'
          and pr.impact_punch is not null
          and coalesce(pr.is_procedural, false) = false
          and coalesce(pr.is_meta_document, false) = false
    """)
    n = rows[0]["n"]
    assert n >= 15, (
        f"sitting 57 has only {n} eligible bills assigned — regression of "
        "agenda-based print_sitting_assignment (expected >= 15, agenda has 18)"
    )
