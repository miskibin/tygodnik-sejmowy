"""Rich e2e: full prints enrichment pipeline (C1-C4) end-to-end.

Validates that the CLI orchestrator + each enricher + audit trail line up
on the live Supabase project. LLM and PaddleOCR are mocked at module
boundaries (httpx for LLM, extract_pdf for PDF, embed_and_store for the
embedding HTTP call) so the test runs in seconds — the integration we
care about here is SQL-side: provenance stamps, FKs, audit rows, idempotency.
"""
from __future__ import annotations

import os
from pathlib import Path
from unittest.mock import patch

import pytest
from typer.testing import CliRunner

from supagraf.cli import app
from supagraf.db import supabase
from supagraf.enrich.embed import EmbedResult, upsert_embedding
from supagraf.enrich.pdf import ExtractionResult

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_E2E") != "1",
    reason="e2e against live Supabase; set RUN_E2E=1 to enable",
)


# Canned text long enough that span_end <= len(text) for our two
# mention spans. Spans resolved at runtime via text.index() so a future
# edit to the string can't silently drift the offsets.
CANNED_TEXT = (
    "Sprawozdanie Komisji Gospodarki o rzadowym projekcie ustawy. "
    "Posel Adam Kowalski wniosl poprawke. "
    "Komisja Spraw Zagranicznych zarekomendowala przyjecie. "
)
CANNED_VEC = [0.001 * i for i in range(1024)]


def _fake_extraction(text: str = CANNED_TEXT) -> ExtractionResult:
    return ExtractionResult(
        sha256="deadbeef" + "0" * 56,
        text=text,
        page_count=1,
        ocr_used=True,
        char_count_per_page=[len(text)],
        model_version="paddle-vl-1.5-primary",
        cache_hit=False,
    )


def _mention_spans(text: str) -> tuple[int, int, int, int]:
    p_start = text.index("Adam Kowalski")
    p_end = p_start + len("Adam Kowalski")
    c_start = text.index("Komisja Spraw Zagranicznych")
    c_end = c_start + len("Komisja Spraw Zagranicznych")
    return p_start, p_end, c_start, c_end


def _make_canned_chat(stance_value: str = "FOR"):
    """Per-prompt canned response selector. Detects prompt via distinctive
    substrings in the system message: `short_title` => summary, `extract
    mentions` => mentions, otherwise stance (matched last because the stance
    prompt has the fewest exclusive markers)."""
    p_start, p_end, c_start, c_end = _mention_spans(CANNED_TEXT)

    def _canned_chat(*args, **kwargs):
        payload = kwargs.get("json") or (args[1] if len(args) > 1 else {})
        sys_msg = " ".join(
            m.get("content", "")
            for m in payload.get("messages", [])
            if m.get("role") == "system"
        )
        sys_low = sys_msg.lower()

        if "short_title" in sys_low:
            content = '{"summary": "Streszczenie testowe.", "short_title": "Test ustawa"}'
        elif "extract mentions" in sys_low or "extract mentions of" in sys_low:
            content = (
                '{"mentions": ['
                f'{{"raw_text": "Adam Kowalski", "span_start": {p_start}, "span_end": {p_end}, "mention_type": "person"}},'
                f'{{"raw_text": "Komisja Spraw Zagranicznych", "span_start": {c_start}, "span_end": {c_end}, "mention_type": "committee"}}'
                ']}'
            )
        else:
            content = f'{{"stance": "{stance_value}", "confidence": 0.85}}'

        class _R:
            status_code = 200
            text = ""

            def json(self):
                return {"message": {"content": content}}

        return _R()

    return _canned_chat


def _fake_embed_and_store(*, text, entity_type, entity_id, model):
    # Real DB write so the embedding row + idempotency assertions hold.
    upsert_embedding(entity_type=entity_type, entity_id=entity_id, vec=CANNED_VEC, model=model)
    return EmbedResult(entity_type=entity_type, entity_id=entity_id, model=model, vec=CANNED_VEC)


@pytest.fixture
def runner():
    return CliRunner()


@pytest.fixture
def reset_one_print():
    """Pick whichever non-additional print is first-pending for `summary` —
    that's the one CLI's pending query returns, so we know the runner will
    actually pick our target. Reset all four enrichment fields on it,
    yield the number, cleanup mentions/embeddings rows after the test."""
    client = supabase()
    rows = (
        client.table("prints")
        .select("id, number")
        .eq("term", 10)
        .eq("is_additional", False)
        .is_("summary", "null")
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        # Fall back: pick any print and null its fields so it becomes pending.
        any_row = (
            client.table("prints").select("id, number").eq("term", 10)
            .eq("is_additional", False).limit(1).execute().data or []
        )
        if not any_row:
            pytest.skip("no prints in DB; load Phase A first")
        rows = any_row

    number = rows[0]["number"]
    pid = rows[0]["id"]

    def _reset():
        client.table("prints").update({
            "summary": None,
            "short_title": None,
            "summary_prompt_version": None,
            "summary_prompt_sha256": None,
            "summary_model": None,
            "stance": None,
            "stance_confidence": None,
            "stance_prompt_version": None,
            "stance_prompt_sha256": None,
            "stance_model": None,
            "mentions_prompt_version": None,
            "mentions_prompt_sha256": None,
            "mentions_model": None,
            "mentions_extracted_at": None,
            "embedding_model": None,
            "embedded_at": None,
        }).eq("number", number).execute()
        client.table("print_mentions").delete().eq("print_id", pid).execute()
        client.table("embeddings").delete().eq("entity_type", "print").eq("entity_id", number).execute()

    _reset()
    yield number
    _reset()


def _scoped_pending_query(target_number: str):
    """Build a _pending_query replacement that scopes to a single print number.
    Postgres has no implicit ordering on the unscoped pending queries (each
    kind hits a different partial index), so `--limit 1` could pick a
    different print per kind. Scoping to our target number makes the
    --kind all run deterministic — exactly the print we reset gets all four
    enrichments."""
    from supagraf.cli import EnrichKind

    def _q(kind: EnrichKind, term: int):
        client = supabase()
        q = client.table("prints").select(
            "id, number, attachments:print_attachments(filename, ordinal)"
        ).eq("term", term).eq("number", target_number)
        if kind == EnrichKind.summary:
            q = q.is_("summary", "null")
        elif kind == EnrichKind.stance:
            q = q.is_("stance", "null")
        elif kind == EnrichKind.mentions:
            q = q.is_("mentions_extracted_at", "null")
        elif kind == EnrichKind.embed:
            q = q.is_("embedded_at", "null")
        return q

    return _q


def _max_id(table: str) -> int:
    r = (
        supabase().table(table)
        .select("id").order("id", desc=True).limit(1).execute().data
    )
    return r[0]["id"] if r else 0


def test_enrich_all_full_pipeline(runner, reset_one_print):
    number = reset_one_print
    canned = _make_canned_chat()
    fake_ext = _fake_extraction()
    # Snapshot id boundary so we can scope assertions to rows this invocation
    # produced. model_runs has no entity column; enrichment_failures may have
    # stale rows from prior runs of test_enrich_failure_does_not_abort_loop
    # whose teardown intentionally leaves them as audit history.
    before_run_id = _max_id("model_runs")
    before_fail_id = _max_id("enrichment_failures")

    with patch("supagraf.cli._pending_query", side_effect=_scoped_pending_query(number)), \
         patch("supagraf.enrich.print_summary.extract_pdf", return_value=fake_ext), \
         patch("supagraf.enrich.print_stance.extract_pdf", return_value=fake_ext), \
         patch("supagraf.enrich.print_mentions.extract_pdf", return_value=fake_ext), \
         patch("supagraf.enrich.embed_print.extract_pdf", return_value=fake_ext), \
         patch("supagraf.enrich.embed_print.embed_and_store", side_effect=_fake_embed_and_store), \
         patch("supagraf.enrich.llm.httpx.post", side_effect=canned), \
         patch.object(Path, "exists", return_value=True):
        result = runner.invoke(
            app, ["enrich", "prints", "--kind", "all", "--limit", "1", "--term", "10"]
        )

    assert result.exit_code == 0, result.output

    # Provenance stamped on prints row.
    r = supabase().table("prints").select(
        "summary, short_title, summary_prompt_version, summary_model,"
        " stance, stance_confidence, stance_prompt_version,"
        " mentions_prompt_version, mentions_extracted_at,"
        " embedding_model, embedded_at"
    ).eq("number", number).single().execute()
    p = r.data
    assert p["summary"] == "Streszczenie testowe.", p
    assert p["short_title"] == "Test ustawa"
    assert p["summary_prompt_version"] == "1"
    assert p["stance"] == "FOR"
    assert abs(p["stance_confidence"] - 0.85) < 1e-5
    assert p["mentions_extracted_at"] is not None
    assert p["embedding_model"] == "nomic-embed-text-v2-moe"
    assert p["embedded_at"] is not None

    # print_mentions rows exist with the expected types.
    pid = supabase().table("prints").select("id").eq("number", number).single().execute().data["id"]
    pm = (
        supabase().table("print_mentions")
        .select("mention_type, raw_text").eq("print_id", pid).execute().data
    )
    assert len(pm) == 2, pm
    types = sorted([m["mention_type"] for m in pm])
    assert types == ["committee", "person"]

    # Embedding row exists, single row per (type, id, model).
    e = (
        supabase().table("embeddings")
        .select("entity_id, model")
        .eq("entity_type", "print").eq("entity_id", number).execute().data
    )
    assert len(e) == 1
    assert e[0]["model"] == "nomic-embed-text-v2-moe"

    # model_runs: 4 ok rows produced by THIS invocation. Scope by id > before_id
    # because model_runs has no entity column — we'd otherwise pick up rows
    # from other prints in concurrent test/dev activity.
    mr = (
        supabase().table("model_runs")
        .select("fn_name, status, id")
        .gt("id", before_run_id)
        .in_("fn_name", ["print_summary", "print_stance", "print_mentions", "embed_print"])
        .execute().data
    )
    fns = sorted([m["fn_name"] for m in mr])
    assert fns == ["embed_print", "print_mentions", "print_stance", "print_summary"], mr
    assert all(m["status"] == "ok" for m in mr), mr

    # No enrichment_failures from THIS invocation for our target. Prior
    # failure-test runs may leave audit history under the same entity_id.
    ef = (
        supabase().table("enrichment_failures")
        .select("id, entity_id, fn_name")
        .gt("id", before_fail_id)
        .eq("entity_id", number).execute().data
    )
    assert ef == [], ef


def test_enrich_idempotent_rerun(runner, reset_one_print):
    """Running the same kind twice still succeeds. After the first run the
    partial-index pending filter excludes the print, so the second run is
    either a no-op (also idempotent) or processes a different pending row.
    Either way: exit 0 and our target's summary stays put."""
    number = reset_one_print
    canned = _make_canned_chat()
    fake_ext = _fake_extraction()

    common = [
        patch("supagraf.cli._pending_query", side_effect=_scoped_pending_query(number)),
        patch("supagraf.enrich.print_summary.extract_pdf", return_value=fake_ext),
        patch("supagraf.enrich.llm.httpx.post", side_effect=canned),
        patch.object(Path, "exists", return_value=True),
    ]
    for p in common:
        p.start()
    try:
        r1 = runner.invoke(
            app, ["enrich", "prints", "--kind", "summary", "--limit", "1", "--term", "10"]
        )
        assert r1.exit_code == 0, r1.output
        first_summary = (
            supabase().table("prints").select("summary").eq("number", number)
            .single().execute().data["summary"]
        )
        assert first_summary == "Streszczenie testowe."

        r2 = runner.invoke(
            app, ["enrich", "prints", "--kind", "summary", "--limit", "1", "--term", "10"]
        )
        assert r2.exit_code == 0, r2.output
        # Target row not re-processed (excluded from pending) — value identical.
        second_summary = (
            supabase().table("prints").select("summary").eq("number", number)
            .single().execute().data["summary"]
        )
        assert second_summary == first_summary
    finally:
        for p in common:
            p.stop()


def test_enrich_failure_does_not_abort_loop(runner, reset_one_print):
    """A schema-violating LLM response on stance must surface as exit 3 +
    enrichment_failures row, while summary on the same print still ok —
    failures don't block other entities (per plan)."""
    number = reset_one_print
    bad_canned = _make_canned_chat(stance_value="INVALID")  # not in {FOR,AGAINST,NEUTRAL,MIXED}
    fake_ext = _fake_extraction()

    common = [
        patch("supagraf.cli._pending_query", side_effect=_scoped_pending_query(number)),
        patch("supagraf.enrich.print_summary.extract_pdf", return_value=fake_ext),
        patch("supagraf.enrich.print_stance.extract_pdf", return_value=fake_ext),
        patch("supagraf.enrich.llm.httpx.post", side_effect=bad_canned),
        patch.object(Path, "exists", return_value=True),
    ]
    for p in common:
        p.start()
    try:
        r1 = runner.invoke(
            app, ["enrich", "prints", "--kind", "summary", "--limit", "1", "--term", "10"]
        )
        assert r1.exit_code == 0, r1.output

        r2 = runner.invoke(
            app, ["enrich", "prints", "--kind", "stance", "--limit", "1", "--term", "10"]
        )
        # CLI returns 3 when any enrichment row failed (typer.Exit(3)).
        assert r2.exit_code == 3, r2.output

        ef = (
            supabase().table("enrichment_failures")
            .select("entity_id, fn_name").eq("entity_id", number)
            .eq("fn_name", "print_stance").execute().data
        )
        assert len(ef) >= 1, ef
    finally:
        for p in common:
            p.stop()
