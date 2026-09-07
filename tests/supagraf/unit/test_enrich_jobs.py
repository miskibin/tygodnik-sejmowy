"""Concurrent print/statement enrichment: document choice, backoff, outage."""
from __future__ import annotations

import threading

import pytest

from supagraf.enrich import jobs


def test_resolve_print_document_prefers_docx_and_skips_guids():
    row = {"number": "123", "attachments": [{"filename": "123.pdf", "ordinal": 0},
                                            {"filename": "123.docx", "ordinal": 1}]}
    assert jobs.resolve_print_document(row) == "sejm/prints/123__123.docx"
    assert jobs.resolve_print_document({"number": "123", "attachments": [{"filename": "123.pdf"}]}) == "sejm/prints/123__123.pdf"
    assert jobs.resolve_print_document({"number": "123", "attachments": [{"filename": "x.zip"}]}) is None
    assert jobs.resolve_print_document({"number": "0123456789abcdef0123456789abcdef", "attachments": []}) is None
    assert jobs.resolve_print_document({"number": " 1041-004\n", "attachments": [{"filename": "a.pdf "}]}) == "sejm/prints/1041-004__a.pdf"


@pytest.fixture
def pending(monkeypatch):
    rows = [{"number": str(i), "term": 10, "attachments": [{"filename": f"{i}.pdf"}]} for i in range(1, 7)]
    monkeypatch.setattr(jobs, "pending_prints", lambda term, limit=0: rows)
    return rows


def test_backoff_skips_repeat_offenders(monkeypatch, pending):
    monkeypatch.setattr(jobs, "recent_failure_counts", lambda fn, et, days=14: {"1": 3, "2": 1})
    ran: list[str] = []
    import supagraf.enrich.print_unified as pu
    monkeypatch.setattr(pu, "enrich_print_unified", lambda **kw: ran.append(kw["entity_id"]))
    st = jobs.enrich_pending_prints(term=10, workers=3)
    assert st.backoff == 1 and st.ok == 5
    assert sorted(ran) == ["2", "3", "4", "5", "6"]


def test_failures_classified_and_run_continues(monkeypatch, pending):
    monkeypatch.setattr(jobs, "recent_failure_counts", lambda fn, et, days=14: {})
    from supagraf.enrich.pdf_fetch import PrintGoneError

    def runner(**kw):
        n = kw["entity_id"]
        if n == "1":
            raise PrintGoneError("gone")
        if n == "2":
            raise RuntimeError("backend returned 0 chars across 1 pages")
        if n == "3":
            raise ValueError("schema mismatch")

    import supagraf.enrich.print_unified as pu
    monkeypatch.setattr(pu, "enrich_print_unified", runner)
    st = jobs.enrich_pending_prints(term=10, workers=2)
    assert (st.ok, st.failed, st.skipped) == (3, 1, 2)
    assert st.errors[0][0] == "3"


def test_outage_guard_aborts_after_threshold(monkeypatch, pending):
    monkeypatch.setattr(jobs, "recent_failure_counts", lambda fn, et, days=14: {})
    monkeypatch.setattr(jobs, "OUTAGE_THRESHOLD", 2)
    from supagraf.enrich.pdf_fetch import PdfFetchError
    attempted: list[str] = []
    lock = threading.Lock()

    def runner(**kw):
        with lock:
            attempted.append(kw["entity_id"])
        raise PdfFetchError("502 upstream")

    import supagraf.enrich.print_unified as pu
    monkeypatch.setattr(pu, "enrich_print_unified", runner)
    st = jobs.enrich_pending_prints(term=10, workers=1)
    assert st.aborted and st.failed >= 2
    assert len(attempted) < 6


def test_statements_pick_newest_sitting_with_pending(monkeypatch):
    import supagraf.enrich.utterance_enrich as ue

    monkeypatch.setattr(jobs, "sittings_with_pending_statements", lambda term: [62, 61])
    monkeypatch.setattr(ue, "fetch_pending_statements", lambda term, sitting_num, limit: [
        {"id": 1, "body_text": "a"}, {"id": 2, "body_text": "b"}] if sitting_num == 62 else [])
    done: list[str] = []
    monkeypatch.setattr(ue, "enrich_one_statement", lambda **kw: done.append(kw["entity_id"]))
    import supagraf.enrich.llm as llm
    monkeypatch.setattr(llm, "_resolve_prompt", lambda name: type("P", (), {"version": 1, "sha256": "x"})())
    st = jobs.enrich_pending_statements(term=10, workers=2)
    assert st.ok == 2 and sorted(done) == ["1", "2"]


def test_budget_error_stops_prints_phase_without_failing_the_rest(monkeypatch, pending):
    monkeypatch.setattr(jobs, "recent_failure_counts", lambda fn, et, days=14: {})
    from supagraf.enrich.llm import LLMBudgetError
    attempted: list[str] = []

    def runner(**kw):
        attempted.append(kw["entity_id"])
        raise LLMBudgetError("deepseek 402: Insufficient Balance")

    import supagraf.enrich.print_unified as pu
    monkeypatch.setattr(pu, "enrich_print_unified", runner)
    st = jobs.enrich_pending_prints(term=10, workers=1)
    assert st.aborted and st.failed == 0 and st.ok == 0
    assert len(attempted) == 1
    assert "402" in st.errors[0][1]


def test_budget_error_stops_statements_phase(monkeypatch):
    import supagraf.enrich.llm as llm
    import supagraf.enrich.utterance_enrich as ue
    from supagraf.enrich.llm import LLMBudgetError
    monkeypatch.setattr(jobs, "sittings_with_pending_statements", lambda term: [64])
    monkeypatch.setattr(ue, "fetch_pending_statements", lambda term, sitting_num, limit: [
        {"id": i, "body_text": "x"} for i in range(20)])
    monkeypatch.setattr(llm, "_resolve_prompt", lambda name: type("P", (), {"version": 1, "sha256": "x"})())
    calls: list[str] = []

    def runner(**kw):
        calls.append(kw["entity_id"])
        raise LLMBudgetError("deepseek 402: Insufficient Balance")

    monkeypatch.setattr(ue, "enrich_one_statement", runner)
    st = jobs.enrich_pending_statements(term=10, workers=1)
    assert st.aborted and st.failed == 0
    assert len(calls) == 1
