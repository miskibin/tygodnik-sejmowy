"""End-to-end test of `supagraf enrich prints` against live Supabase.

Mocks httpx (LLM) + extract_pdf so we exercise the CLI orchestration +
DB writes without burning Ollama / GPU. Real DB writes against the
configured Supabase project; the CLI runs the same supabase() chain a
real invocation would.

Gated `RUN_E2E=1`. Resets the test print to baseline before/after.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from typer.testing import CliRunner

from supagraf.cli import app
from supagraf.db import supabase
from supagraf.enrich.pdf import ExtractionResult
from supagraf.enrich.print_summary import JOB_NAME

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_E2E") != "1",
    reason="e2e against live Supabase; set RUN_E2E=1 to enable",
)

runner = CliRunner()


def _pick_cli_first_pending():
    """Query the same way the CLI's _pending_query does (term=10, summary
    IS NULL) so we know exactly which row the CLI will process when called
    with --limit 1. Returns that print's number, or skips the test if none
    exists. The caller is responsible for resetting the chosen row."""
    rows = (
        supabase().table("prints")
        .select("id, number, attachments:print_attachments(filename, ordinal)")
        .eq("term", 10)
        .is_("summary", "null")
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        pytest.skip("no prints with summary IS NULL in term=10; nothing to enrich")
    return rows[0]["number"]


def _ollama_response(content: dict) -> MagicMock:
    resp = MagicMock()
    resp.status_code = 200
    resp.json.return_value = {"message": {"content": json.dumps(content)}}
    resp.text = ""
    return resp


def _fake_extraction() -> ExtractionResult:
    # Skip real PDF parsing — the CLI orchestration is what we're testing here,
    # not paddle. Keeps the test fast and removes a flakiness vector.
    text = "Tekst pisma sejmowego do testów CLI."
    return ExtractionResult(
        sha256="cli-e2e-fake",
        text=text,
        page_count=1,
        ocr_used=False,
        char_count_per_page=[len(text)],
        model_version="fake-cli-test",
        cache_hit=False,
    )


def _reset_print_summary(number: str):
    """Match prints_summary_provenance CHECK — null all five together."""
    supabase().table("prints").update({
        "summary": None,
        "short_title": None,
        "summary_prompt_version": None,
        "summary_prompt_sha256": None,
        "summary_model": None,
    }).eq("number", number).execute()


def _delete_audit_rows():
    supabase().table("model_runs").delete().eq("fn_name", JOB_NAME).execute()


def _read_summary(number: str) -> str | None:
    row = supabase().table("prints").select("summary").eq(
        "number", number
    ).single().execute().data
    return (row or {}).get("summary")


def test_cli_enrich_summary_one_print_then_zero():
    """1st run: 1 pending → enriched, exit 0. 2nd run: 0 pending → exit 0.

    We pick whichever print the same query the CLI uses returns first, so
    we don't depend on a specific PRINT_NUMBER existing on disk. Path.exists
    is patched so the on-disk PDF check passes uniformly.
    """
    target = _pick_cli_first_pending()
    _delete_audit_rows()
    try:
        expected = {"summary": "Streszczenie z testu CLI.", "short_title": "CLI test"}
        # Path.exists patched True so any print picked passes the disk gate.
        with patch.object(Path, "exists", return_value=True), \
             patch("supagraf.enrich.print_summary.extract_pdf", return_value=_fake_extraction()), \
             patch("supagraf.enrich.llm.httpx.post", return_value=_ollama_response(expected)):
            result = runner.invoke(
                app,
                ["enrich", "prints", "--kind", "summary", "--limit", "1"],
            )
        assert result.exit_code == 0, result.output
        assert _read_summary(target) == expected["summary"]

        # Second run — first print's summary is set, but --limit 1 may pick
        # ANOTHER pending print. We just confirm exit 0 and our target's
        # summary is unchanged (it was excluded from the pending set).
        with patch.object(Path, "exists", return_value=True), \
             patch("supagraf.enrich.print_summary.extract_pdf", return_value=_fake_extraction()), \
             patch("supagraf.enrich.llm.httpx.post", return_value=_ollama_response(expected)):
            result2 = runner.invoke(
                app,
                ["enrich", "prints", "--kind", "summary", "--limit", "1"],
            )
        assert result2.exit_code == 0, result2.output
        # Target still has its summary — partial index excluded it from pending.
        assert _read_summary(target) == expected["summary"]
    finally:
        _reset_print_summary(target)
        _delete_audit_rows()
