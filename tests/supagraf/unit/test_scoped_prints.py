"""Read-only, mocked tests for the one-sitting print review scope."""
from pathlib import Path

from supagraf.enrich import scoped_prints as scoped
from supagraf.enrich.llm import PromptRef


def _prompt(version: int = 9) -> PromptRef:
    return PromptRef(name="print_citizen_review", version=version,
                     path=Path("v9.md"), sha256="sha-v9", body="prompt")


def test_context_scope_excludes_speeches_outside_sitting_and_deduplicates():
    statements = [
        {"body_text": "10. punkt porządku dziennego: Projekt ustawy (druki nr 123, 124) Poseł X: druk nr 999"},
        {"body_text": "11. punkt porządku dziennego: Inny temat (druk nr 125) Minister Y: druk nr 123"},
        {"body_text": "To jest wypowiedź bez preambuły: druk nr 888"},
    ]
    votes = [
        {"title": "Pkt. 10 Głosowanie nad drukiem nr 123"},
        {"title": "Głosowanie nad drukiem nr 124"},
        {"title": "Głosowanie nad drukiem nr 777"},
    ]

    assert scoped.collect_sitting_print_numbers(statements, votes) == ["123", "124", "125"]


def test_source_selection_keeps_projects_and_report_only_primary():
    groups = [(1, ["100", "101"]), (2, ["200", "201"]), (3, ["300", "301"])]
    rows = [
        {"number": "100", "document_category": "projekt_ustawy", "is_meta_document": False},
        {"number": "101", "document_category": "sprawozdanie_komisji", "is_meta_document": True,
         "summary_plain": "report"},
        {"number": "200", "document_category": "sprawozdanie_komisji", "is_meta_document": True,
         "summary_plain": "report-only"},
        {"number": "201", "document_category": "opinia_organu", "is_meta_document": True,
         "impact_punch": "opinia"},
        {"number": "300", "document_category": "projekt_ustawy", "is_meta_document": False},
        {"number": "301", "document_category": "projekt_uchwaly", "is_meta_document": False},
    ]

    selected, reasons = scoped.select_source_rows(groups, rows)
    assert [row["number"] for row in selected] == ["100", "200", "300", "301"]
    assert reasons == {"100": "substantive_project", "200": "primary_existing_summary",
                       "300": "substantive_project", "301": "substantive_project"}


def test_manifest_distinguishes_skipped_discovered_rows_from_missing_references():
    discovered = [
        {"id": 1, "number": "100"},
        {"id": 2, "number": "101"},
    ]
    selected = [discovered[0]]
    plan = scoped.ScopedPrintPlan(
        10, 64, _prompt(), ["100", "101", "102"], selected, {},
        [(1, ["100", "101", "102"])], discovered, {"100": "substantive_project"},
    )

    manifest = plan.manifest(force=False)
    assert manifest["selected_numbers"] == ["100"]
    assert manifest["missing_references"] == ["102"]


def test_build_plan_deduplicates_references_across_groups(monkeypatch):
    monkeypatch.setattr(scoped, "_load_sitting_context", lambda *args: (
        [(1, ["100", "101"]), (2, ["100", "102"])], {}
    ))
    monkeypatch.setattr(scoped, "_load_print_rows", lambda *args: [])
    monkeypatch.setattr(scoped, "supabase", lambda: object())
    # _resolve_prompt is imported inside build_plan, so patch its module symbol.
    import supagraf.enrich.llm as llm
    monkeypatch.setattr(llm, "_resolve_prompt", lambda *args: _prompt())
    plan = scoped.build_plan(sitting=64)
    assert plan.numbers == ["100", "101", "102"]


def test_pagination_reads_all_pages_and_deduplicates_rows(monkeypatch):
    monkeypatch.setattr(scoped, "PAGE_SIZE", 2)
    class Page:
        def __init__(self, rows):
            self.data = rows

        def execute(self):
            return self

    pages = {0: [{"id": 1}, {"id": 2}], 2: [{"id": 2}, {"id": 3}], 4: []}
    calls = []

    def query(start, end):
        calls.append((start, end))
        return Page(pages.get(start, []))

    assert scoped._paged(query) == [{"id": 1}, {"id": 2}, {"id": 2}, {"id": 3}]
    assert calls == [(0, 1), (2, 3), (4, 5)]


def test_dry_run_never_calls_enricher_or_writes(monkeypatch):
    rows = [
        {"id": 10, "number": "123", "attachments": [{"filename": "123.pdf"}],
         "summary_prompt_version": None, "summary_prompt_sha256": None},
    ]
    plan = scoped.ScopedPrintPlan(10, 64, _prompt(), ["123"], rows, {"statements": 1, "votes": 1})
    monkeypatch.setattr(scoped, "build_plan", lambda **kwargs: plan)
    called = []
    monkeypatch.setattr(scoped, "supabase", lambda: (_ for _ in ()).throw(AssertionError("DB write")))

    result = scoped.run_scoped_prints(sitting=64, dry_run=True, enricher=lambda **kwargs: called.append(kwargs))

    assert called == []
    assert result.ok == result.failed == result.skipped == 0
    assert result.manifest["candidate_ids"] == [10]
    assert result.manifest["to_run"] == 1


def test_force_reprocesses_only_frozen_scope_and_default_skips_same_prompt(monkeypatch):
    rows = [
        {"id": 10, "number": "123", "attachments": [{"filename": "123.pdf"}],
         "summary_prompt_version": "9", "summary_prompt_sha256": "sha-v9"},
        {"id": 11, "number": "124", "attachments": [{"filename": "124.pdf"}],
         "summary_prompt_version": None, "summary_prompt_sha256": None},
    ]
    plan = scoped.ScopedPrintPlan(10, 64, _prompt(), ["123", "124"], rows, {})
    monkeypatch.setattr(scoped, "build_plan", lambda **kwargs: plan)
    monkeypatch.setattr("supagraf.enrich.jobs.resolve_print_document", lambda row: f"x/{row['number']}.pdf")
    calls = []
    def enricher(**kwargs):
        calls.append(kwargs["entity_id"])

    result = scoped.run_scoped_prints(sitting=64, enricher=enricher)
    assert result.ok == 1 and calls == ["124"]

    result = scoped.run_scoped_prints(sitting=64, force=True, enricher=enricher)
    assert result.ok == 2 and calls[-2:] == ["123", "124"]
    assert result.manifest["candidate_count"] == 2

    result = scoped.run_scoped_prints(sitting=64, force=True, limit=1, enricher=enricher)
    assert result.ok == 1 and calls[-1:] == ["123"]
    assert result.manifest["to_run"] == 1 and result.manifest["limit"] == 1


def test_failure_keeps_existing_values_and_does_not_expand_scope(monkeypatch):
    row = {"id": 10, "number": "123", "attachments": [{"filename": "123.pdf"}],
           "summary_prompt_version": "8", "summary_prompt_sha256": "old", "summary_plain": "old value"}
    plan = scoped.ScopedPrintPlan(10, 64, _prompt(), ["123"], [row], {})
    monkeypatch.setattr(scoped, "build_plan", lambda **kwargs: plan)
    monkeypatch.setattr("supagraf.enrich.jobs.resolve_print_document", lambda row: "x/123.pdf")

    def fail(**kwargs):
        raise ValueError("schema mismatch")

    result = scoped.run_scoped_prints(sitting=64, enricher=fail)
    assert result.failed == 1 and result.ok == 0
    assert row["summary_plain"] == "old value"
    assert result.manifest["references"] == ["123"]


def test_budget_failure_stops_queued_rows_with_one_worker(monkeypatch):
    from supagraf.enrich.llm import LLMBudgetError

    rows = [
        {"id": 10, "number": "123", "attachments": [{"filename": "123.pdf"}]},
        {"id": 11, "number": "124", "attachments": [{"filename": "124.pdf"}]},
    ]
    plan = scoped.ScopedPrintPlan(10, 64, _prompt(), ["123", "124"], rows, {})
    monkeypatch.setattr(scoped, "build_plan", lambda **kwargs: plan)
    monkeypatch.setattr("supagraf.enrich.jobs.resolve_print_document", lambda row: f"x/{row['number']}.pdf")
    calls = []

    def fail_first(**kwargs):
        calls.append(kwargs["entity_id"])
        raise LLMBudgetError("deepseek 402: Insufficient Balance")

    result = scoped.run_scoped_prints(sitting=64, workers=1, enricher=fail_first)
    assert result.aborted and result.failed == 0
    assert calls == ["123"]
