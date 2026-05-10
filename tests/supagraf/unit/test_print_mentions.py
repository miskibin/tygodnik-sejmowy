"""Unit tests for supagraf.enrich.print_mentions.

All side-effects mocked: extract_pdf, call_structured, supabase. Verifies
wire-up between B1/B2/B5 + happy/adversarial paths without touching
network or disk.
"""
from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from pydantic import ValidationError as PVErr

from supagraf.enrich import DEFAULT_LLM_MODEL
from supagraf.enrich.llm import LLMCall, LLMResponseError, PromptRef
from supagraf.enrich.pdf import ExtractionResult
from supagraf.enrich.print_mentions import (
    Mention,
    PrintMentionsOutput,
    extract_mentions,
    _filter_in_bounds,
)


def _fake_extraction(text: str = "Min. Anna Kowalska poparła wniosek Komisji Finansów Publicznych.") -> ExtractionResult:
    return ExtractionResult(
        sha256="deadbeef",
        text=text,
        page_count=1,
        ocr_used=False,
        char_count_per_page=[len(text)],
        model_version="pypdf-test",
        cache_hit=False,
    )


def _fake_call(parsed: PrintMentionsOutput, *, version: int = 1, sha: str = "abc123") -> LLMCall:
    return LLMCall(
        model=DEFAULT_LLM_MODEL,
        prompt=PromptRef(name="print_mentions", version=version,
                         path=Path("/tmp/v1.md"), sha256=sha, body="..."),
        parsed=parsed,
        raw_response="{}",
        model_run_id=None,
    )


@pytest.fixture
def mock_audit():
    """Patch the decorator's DB seams (B5 internals) so no Supabase calls fire."""
    with patch("supagraf.enrich.audit._insert_run") as ins, \
         patch("supagraf.enrich.audit._record_failure") as rec, \
         patch("supagraf.enrich.audit._finish_run") as fin:
        ins.return_value = 7
        yield ins, rec, fin


@pytest.fixture
def mock_pipeline():
    """Patch extract_pdf, call_structured and supabase()."""
    with patch("supagraf.enrich.print_mentions.extract_pdf") as extr, \
         patch("supagraf.enrich.print_mentions.call_structured") as llm, \
         patch("supagraf.enrich.print_mentions.supabase") as sb, \
         patch("supagraf.enrich.print_mentions.fixtures_root") as froot:
        froot.return_value = Path("/tmp/fixtures")
        # Default: print exists in DB → returns id=42.
        sb.return_value.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[{"id": 42}]
        )
        # Make .delete().eq().eq().execute() and .insert([..]).execute() and .update({}).eq().execute() chains all return MagicMock.
        sb.return_value.table.return_value.delete.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock()
        sb.return_value.table.return_value.insert.return_value.execute.return_value = MagicMock()
        sb.return_value.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()
        yield extr, llm, sb


# ---- happy path ----------------------------------------------------------

def test_happy_path_inserts_mentions_and_stamps_prints(mock_audit, mock_pipeline):
    extr, llm, sb = mock_pipeline
    extr.return_value = _fake_extraction()
    parsed = PrintMentionsOutput(mentions=[
        Mention(raw_text="Anna Kowalska", span_start=5, span_end=18, mention_type="person"),
        Mention(raw_text="Komisji Finansów Publicznych", span_start=33, span_end=61, mention_type="committee"),
        Mention(raw_text="Komisja Zdrowia", span_start=0, span_end=15, mention_type="committee"),
    ])
    llm.return_value = _fake_call(parsed, version=1, sha="abc123")

    out = extract_mentions(
        entity_type="print",
        entity_id="2055-A",
        pdf_relpath="sejm/prints/2055-A__2055-A.pdf",
    )

    assert len(out.mentions) == 3
    extr.assert_called_once()
    llm.assert_called_once()

    # Find the insert call and verify payload structure.
    insert_calls = [c for c in sb.return_value.table.return_value.insert.call_args_list]
    assert len(insert_calls) == 1
    rows = insert_calls[0].args[0]
    assert len(rows) == 3
    assert {r["mention_type"] for r in rows} == {"person", "committee"}
    assert all(r["prompt_version"] == "1" for r in rows)
    assert all(r["prompt_sha256"] == "abc123" for r in rows)
    assert all(r["model"] == DEFAULT_LLM_MODEL for r in rows)
    assert all(r["print_id"] == 42 for r in rows)

    # prints stamp call (the second .update() invocation overall — there is
    # only one, since print_mentions uses .delete and .insert, not update).
    update_calls = sb.return_value.table.return_value.update.call_args_list
    assert len(update_calls) == 1
    payload = update_calls[0].args[0]
    assert payload["mentions_prompt_version"] == "1"
    assert payload["mentions_prompt_sha256"] == "abc123"
    assert payload["mentions_model"] == DEFAULT_LLM_MODEL
    assert payload["mentions_extracted_at"] is not None


def test_empty_mentions_list_still_stamps_prints(mock_audit, mock_pipeline):
    extr, llm, sb = mock_pipeline
    extr.return_value = _fake_extraction()
    llm.return_value = _fake_call(PrintMentionsOutput(mentions=[]))

    out = extract_mentions(
        entity_type="print",
        entity_id="2055-A",
        pdf_relpath="sejm/prints/2055-A__2055-A.pdf",
    )
    assert out.mentions == []

    # No insert (empty list short-circuits) but prints UPDATE still runs.
    sb.return_value.table.return_value.insert.assert_not_called()
    update_calls = sb.return_value.table.return_value.update.call_args_list
    assert len(update_calls) == 1
    assert update_calls[0].args[0]["mentions_extracted_at"] is not None


def test_audit_decorator_finishes_ok(mock_audit, mock_pipeline):
    ins, rec, fin = mock_audit
    extr, llm, _ = mock_pipeline
    extr.return_value = _fake_extraction()
    llm.return_value = _fake_call(PrintMentionsOutput(mentions=[]))

    extract_mentions(
        entity_type="print",
        entity_id="2055-A",
        pdf_relpath="sejm/prints/2055-A__2055-A.pdf",
    )

    ins.assert_called_once()
    rec.assert_not_called()
    fin.assert_called_once()
    assert fin.call_args.args[1] == "ok"


# ---- span filtering ------------------------------------------------------

def test_some_out_of_bounds_filtered_kept_inserted(mock_audit, mock_pipeline):
    extr, llm, sb = mock_pipeline
    text = "Anna Kowalska."  # len 14
    extr.return_value = _fake_extraction(text=text)
    parsed = PrintMentionsOutput(mentions=[
        Mention(raw_text="Anna Kowalska", span_start=0, span_end=13, mention_type="person"),
        # span_end > text_len → dropped
        Mention(raw_text="ghost", span_start=0, span_end=999, mention_type="person"),
        # zero-length span → dropped
        Mention(raw_text="x", span_start=5, span_end=5, mention_type="person"),
    ])
    llm.return_value = _fake_call(parsed)

    out = extract_mentions(
        entity_type="print",
        entity_id="2055-A",
        pdf_relpath="sejm/prints/2055-A__2055-A.pdf",
    )
    assert len(out.mentions) == 1
    assert out.mentions[0].raw_text == "Anna Kowalska"

    rows = sb.return_value.table.return_value.insert.call_args_list[0].args[0]
    assert len(rows) == 1


def test_all_out_of_bounds_raises(mock_audit, mock_pipeline):
    ins, rec, fin = mock_audit
    extr, llm, sb = mock_pipeline
    text = "short"  # len 5
    extr.return_value = _fake_extraction(text=text)
    parsed = PrintMentionsOutput(mentions=[
        Mention(raw_text="ghost", span_start=10, span_end=20, mention_type="person"),
        Mention(raw_text="ghost2", span_start=100, span_end=200, mention_type="committee"),
    ])
    llm.return_value = _fake_call(parsed)

    with pytest.raises(ValueError, match="invalid spans"):
        extract_mentions(
            entity_type="print",
            entity_id="2055-A",
            pdf_relpath="sejm/prints/2055-A__2055-A.pdf",
        )

    sb.return_value.table.return_value.insert.assert_not_called()
    sb.return_value.table.return_value.update.assert_not_called()
    rec.assert_called_once()
    fin.assert_called_once()
    assert fin.call_args.args[1] == "failed"


def test_filter_in_bounds_unit():
    # span_end < span_start → drop (DB CHECK guards against this anyway).
    text_len = 100
    ms = [
        Mention(raw_text="ok", span_start=0, span_end=5, mention_type="person"),
        Mention(raw_text="reversed", span_start=10, span_end=8, mention_type="person"),
        Mention(raw_text="oob", span_start=99, span_end=200, mention_type="committee"),
    ]
    kept, dropped = _filter_in_bounds(ms, text_len)
    assert len(kept) == 1
    assert kept[0].raw_text == "ok"
    assert dropped == 2


# ---- empty text ----------------------------------------------------------

def test_empty_text_raises_no_llm_call(mock_audit, mock_pipeline):
    _, rec, fin = mock_audit
    extr, llm, sb = mock_pipeline
    extr.return_value = _fake_extraction(text="   \n\t  ")

    with pytest.raises(ValueError, match="empty extracted text"):
        extract_mentions(
            entity_type="print",
            entity_id="2055-A",
            pdf_relpath="sejm/prints/2055-A__2055-A.pdf",
        )

    llm.assert_not_called()
    sb.return_value.table.return_value.insert.assert_not_called()
    rec.assert_called_once()
    fin.assert_called_once()
    assert fin.call_args.args[1] == "failed"


# ---- print not in DB -----------------------------------------------------

def test_print_not_in_db_raises_no_insert(mock_audit, mock_pipeline):
    _, rec, fin = mock_audit
    extr, llm, sb = mock_pipeline
    extr.return_value = _fake_extraction()
    llm.return_value = _fake_call(PrintMentionsOutput(mentions=[
        Mention(raw_text="Anna Kowalska", span_start=5, span_end=18, mention_type="person"),
    ]))
    # Override default: print not found.
    sb.return_value.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
        data=[]
    )

    with pytest.raises(ValueError, match="not in DB"):
        extract_mentions(
            entity_type="print",
            entity_id="9999-X",
            pdf_relpath="sejm/prints/9999-X.pdf",
        )

    sb.return_value.table.return_value.insert.assert_not_called()
    rec.assert_called_once()
    fin.assert_called_once()
    assert fin.call_args.args[1] == "failed"


# ---- LLM failure ---------------------------------------------------------

def test_llm_response_error_records_failure_and_reraises(mock_audit, mock_pipeline):
    _, rec, fin = mock_audit
    extr, llm, sb = mock_pipeline
    extr.return_value = _fake_extraction()
    llm.side_effect = LLMResponseError("schema mismatch")

    with pytest.raises(LLMResponseError, match="schema mismatch"):
        extract_mentions(
            entity_type="print",
            entity_id="2055-A",
            pdf_relpath="sejm/prints/2055-A__2055-A.pdf",
        )

    rec.assert_called_once()
    err_text = rec.call_args.args[4]
    assert "LLMResponseError" in err_text
    fin.assert_called_once()
    assert fin.call_args.args[1] == "failed"
    sb.return_value.table.return_value.insert.assert_not_called()


# ---- decorator validation ------------------------------------------------

def test_wrong_entity_type_raises_before_db(mock_audit, mock_pipeline):
    ins, rec, fin = mock_audit
    extr, llm, _ = mock_pipeline

    with pytest.raises(ValueError, match="unknown entity_type"):
        extract_mentions(
            entity_type="bogus",
            entity_id="2055-A",
            pdf_relpath="sejm/prints/2055-A__2055-A.pdf",
        )

    # Decorator validates entity_type before _insert_run; nothing else fires.
    ins.assert_not_called()
    rec.assert_not_called()
    fin.assert_not_called()
    extr.assert_not_called()
    llm.assert_not_called()


# ---- pydantic schema strictness ------------------------------------------

def test_mention_forbids_extra_fields():
    # Schema mismatch (extra field) is fatal.
    with pytest.raises(PVErr):
        Mention.model_validate({
            "raw_text": "x", "span_start": 0, "span_end": 1,
            "mention_type": "person", "extra": "no",
        })


def test_mention_rejects_invalid_type():
    # Literal['person','committee'] rejects 'party' before DB write.
    with pytest.raises(PVErr):
        Mention.model_validate({
            "raw_text": "PiS", "span_start": 0, "span_end": 3,
            "mention_type": "party",
        })


def test_mention_rejects_negative_span_start():
    # Field(ge=0) rejects negative offsets — same envelope as SQL CHECK.
    with pytest.raises(PVErr):
        Mention.model_validate({
            "raw_text": "x", "span_start": -1, "span_end": 5,
            "mention_type": "person",
        })


def test_output_forbids_extra_fields():
    with pytest.raises(PVErr):
        PrintMentionsOutput.model_validate({
            "mentions": [], "extra": "no",
        })
