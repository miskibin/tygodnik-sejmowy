"""End-to-end questions test.

Stages 1066 question fixtures (632 interpellation + 434 written) into
Supabase, runs load_questions, asserts counts, FK integrity, polymorphic
link orphan invariants, idempotency. Skipped by default; enable with
`RUN_E2E=1`.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from supagraf.db import supabase
from supagraf.stage import questions as stage_questions

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_E2E") != "1",
    reason="e2e against live Supabase; set RUN_E2E=1 to enable",
)

REPO_ROOT = Path(__file__).resolve().parents[3]
INTER_DIR = REPO_ROOT / "fixtures" / "sejm" / "interpellations"
WQ_DIR = REPO_ROOT / "fixtures" / "sejm" / "writtenQuestions"


def _entity_files(d: Path) -> list[Path]:
    return [
        p for p in sorted(d.glob("*.json"))
        if not p.name.startswith("_") and "__" not in p.stem
    ]


@pytest.fixture(scope="module")
def loaded():
    """Stage + load once. Returns (client, payloads keyed by (kind, num))."""
    report = stage_questions.stage()
    assert report.ok(), report.errors
    client = supabase()
    affected = client.rpc("load_questions", {"p_term": 10}).execute().data
    assert int(affected or 0) >= 0
    payloads: dict[tuple[str, int], dict] = {}
    for p in _entity_files(INTER_DIR):
        d = json.loads(p.read_text(encoding="utf-8"))
        payloads[("interpellation", d["num"])] = d
    for p in _entity_files(WQ_DIR):
        d = json.loads(p.read_text(encoding="utf-8"))
        payloads[("written", d["num"])] = d
    return client, payloads


def test_question_counts_per_kind(loaded):
    client, payloads = loaded
    inv = client.rpc("assert_invariants", {"p_term": 10}).execute().data
    assert inv["questions_total"] == 1066
    assert inv["questions_interpellation"] == 632
    assert inv["questions_written"] == 434
    assert sum(1 for k, _ in payloads if k == "interpellation") == 632
    assert sum(1 for k, _ in payloads if k == "written") == 434


def test_authors_total_and_no_orphans(loaded):
    client, payloads = loaded
    inv = client.rpc("assert_invariants", {"p_term": 10}).execute().data
    expected_authors = sum(len(d.get("from", []) or []) for d in payloads.values())
    assert inv["question_authors_total"] == expected_authors
    assert inv["question_author_orphans"] == 0


def test_recipients_count_matches_fixtures(loaded):
    client, payloads = loaded
    inv = client.rpc("assert_invariants", {"p_term": 10}).execute().data
    expected = sum(len(d.get("recipientDetails", []) or []) for d in payloads.values())
    assert inv["question_recipients_total"] == expected


def test_replies_count_matches_fixtures(loaded):
    client, payloads = loaded
    inv = client.rpc("assert_invariants", {"p_term": 10}).execute().data
    expected = sum(len(d.get("replies", []) or []) for d in payloads.values())
    assert inv["question_replies_total"] == expected


def test_reply_attachments_count_matches_fixtures(loaded):
    client, payloads = loaded
    inv = client.rpc("assert_invariants", {"p_term": 10}).execute().data
    expected = sum(
        len(r.get("attachments", []) or [])
        for d in payloads.values()
        for r in d.get("replies", []) or []
    )
    assert inv["question_reply_attachments_total"] == expected


def test_links_polymorphic_no_orphans(loaded):
    client, payloads = loaded
    inv = client.rpc("assert_invariants", {"p_term": 10}).execute().data
    expected = sum(len(d.get("links", []) or []) for d in payloads.values())
    expected += sum(
        len(r.get("links", []) or [])
        for d in payloads.values()
        for r in d.get("replies", []) or []
    )
    assert inv["question_links_total"] == expected
    assert inv["question_link_orphans_question"] == 0
    assert inv["question_link_orphans_reply"] == 0


def test_replies_with_null_key_are_prolongations(loaded):
    """Audit: 300/1181 reply entries have no `key` and prolongation=true."""
    client, _ = loaded
    rows = (
        client.table("question_replies")
        .select("key,prolongation", count="exact")
        .is_("key", "null")
        .execute()
    )
    null_key_count = rows.count or 0
    assert null_key_count > 0
    # Every null-key row must be a prolongation (data-driven invariant)
    for r in rows.data or []:
        assert r["prolongation"] is True


def test_author_fk_resolves_to_mps(loaded):
    """Every question_authors row resolves in mps(term=10, mp_id)."""
    client, _ = loaded
    rows = (
        client.table("question_authors").select("mp_id")
        .eq("term", 10).execute().data or []
    )
    ids = sorted({r["mp_id"] for r in rows})
    found = (
        client.table("mps").select("mp_id").eq("term", 10).in_("mp_id", ids)
        .execute().data or []
    )
    assert {r["mp_id"] for r in found} == set(ids)


def test_idempotency_rerun(loaded):
    client, _ = loaded

    def _snap():
        return (
            client.table("questions").select("id", count="exact").eq("term", 10).execute().count,
            client.table("question_authors").select("id", count="exact").eq("term", 10).execute().count,
            client.table("question_recipients").select("id", count="exact").execute().count,
            client.table("question_replies").select("id", count="exact").execute().count,
            client.table("question_reply_attachments").select("id", count="exact").execute().count,
            client.table("question_links").select("id", count="exact").execute().count,
        )

    before = _snap()
    client.rpc("load_questions", {"p_term": 10}).execute()
    after = _snap()
    assert after == before, f"counts changed on rerun: {before} -> {after}"
