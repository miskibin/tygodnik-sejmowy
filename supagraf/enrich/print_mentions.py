"""Enrichment job: print -> list of person + committee mentions.

Mirrors print_summary/print_stance — paddle markdown extraction, versioned
LLM prompt, audit-wrapped. Persists rows in print_mentions with full
provenance (prompt_version, sha256, model). Re-runs with the same prompt
version reinsert via the unique constraint; re-runs with a new version
add new rows alongside (audit-friendly).

Span offsets are validated client-side: each (start, end) pair must
fall within the LLM input text length and start <= end. LLM hallucinating
out-of-bounds spans -> drop with logged warning (not fatal — partial
results still useful) BUT raise if ALL mentions are out-of-bounds.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from loguru import logger
from pydantic import BaseModel, ConfigDict, Field

from supagraf.db import supabase
from supagraf.enrich import DEFAULT_LLM_MODEL
from supagraf.enrich.audit import with_model_run
from supagraf.enrich.llm import call_structured
from supagraf.enrich.pdf import extract_pdf
from supagraf.enrich.pdf_fetch import resolve_print_pdf

JOB_NAME = "print_mentions"
PROMPT_NAME = "print_mentions"
# Same cap as sibling enrichers — keeps prompt cost predictable while
# preserving full extracted text in pdf_extracts cache for reprocessing.
MAX_INPUT_CHARS = 8000

MentionType = Literal["person", "committee"]


class Mention(BaseModel):
    # extra='forbid' makes schema mismatch fatal — call_structured surfaces
    # ValidationError as LLMResponseError. Field(ge=0) on span_start mirrors
    # the SQL CHECK so a bad value never reaches the DB write.
    model_config = ConfigDict(extra="forbid")
    raw_text: str = Field(min_length=1, max_length=200)
    span_start: int = Field(ge=0)
    span_end: int = Field(ge=0)
    mention_type: MentionType


class PrintMentionsOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mentions: list[Mention]


def _filter_in_bounds(mentions: list[Mention], text_len: int) -> tuple[list[Mention], int]:
    # Enforce: span_start <= span_end, span_end <= text_len, span > 0 chars.
    # Mirrors the SQL CHECK (span_end >= span_start) plus an upper bound the
    # DB cannot enforce (it doesn't know the input length).
    kept: list[Mention] = []
    dropped = 0
    for m in mentions:
        if m.span_start <= m.span_end <= text_len and m.span_end > m.span_start:
            kept.append(m)
        else:
            dropped += 1
    return kept, dropped


@with_model_run(
    fn_name=JOB_NAME,
    model=DEFAULT_LLM_MODEL,
    entity_type_arg="entity_type",
    entity_id_arg="entity_id",
    prompt_version_arg="prompt_version",
    prompt_sha256_arg="prompt_sha256",
)
def extract_mentions(
    *,
    entity_type: str,                 # always 'print' — validated by decorator
    entity_id: str,                   # prints.number
    pdf_relpath: str,                 # path under fixtures/sejm/prints/
    prompt_version: int | None = None,
    prompt_sha256: str | None = None, # informational; resolver computes real sha
    llm_model: str = DEFAULT_LLM_MODEL,
    model_run_id: int | None = None,
) -> PrintMentionsOutput:
    pdf_path = resolve_print_pdf(pdf_relpath)
    extraction = extract_pdf(pdf_path)
    text = extraction.text[:MAX_INPUT_CHARS]
    if not text.strip():
        # Empty extracted text → never call LLM with junk; fail loud so the
        # operator can investigate (likely image-only scan needing OCR).
        raise ValueError(f"empty extracted text for {pdf_path.name}")

    call = call_structured(
        model=llm_model,
        prompt_name=PROMPT_NAME,
        user_input=text,
        output_model=PrintMentionsOutput,
        prompt_version=prompt_version,
    )
    parsed: PrintMentionsOutput = call.parsed  # type: ignore[assignment]

    kept, dropped = _filter_in_bounds(parsed.mentions, len(text))
    if parsed.mentions and not kept:
        # Loud signal that the LLM is hallucinating offsets. Better to fail
        # the run (decorator records to enrichment_failures) than silently
        # stamp a "completed" run with zero usable rows.
        raise ValueError(
            f"all {len(parsed.mentions)} LLM mentions had invalid spans for {pdf_path.name}"
        )
    if dropped:
        logger.warning("print {} mentions: dropped {}/{} out-of-bounds spans",
                       entity_id, dropped, len(parsed.mentions))

    # Look up print id for FK insert. Hard fail (not silent skip) so a row
    # never exists in print_mentions for a print that isn't loaded.
    pr = supabase().table("prints").select("id").eq("number", entity_id).limit(1).execute()
    if not pr.data:
        raise ValueError(f"print {entity_id} not in DB; load_prints must run first")
    print_id = int(pr.data[0]["id"])

    # Replace previous mentions for THIS prompt_version (clean re-run); keep
    # other versions for audit trail.
    pv_str = str(call.prompt.version)
    supabase().table("print_mentions").delete().eq("print_id", print_id).eq(
        "prompt_version", pv_str
    ).execute()

    if kept:
        supabase().table("print_mentions").insert([
            {
                "print_id": print_id,
                "mention_type": m.mention_type,
                "raw_text": m.raw_text,
                "span_start": m.span_start,
                "span_end": m.span_end,
                "prompt_version": pv_str,
                "prompt_sha256": call.prompt.sha256,
                "model": llm_model,
            }
            for m in kept
        ]).execute()

    # Stamp the print row regardless of how many mentions survived — the
    # provenance CHECK enforces all four columns set together so a partial
    # update is impossible.
    supabase().table("prints").update({
        "mentions_prompt_version": pv_str,
        "mentions_prompt_sha256": call.prompt.sha256,
        "mentions_model": llm_model,
        "mentions_extracted_at": datetime.now(timezone.utc).isoformat(),
    }).eq("number", entity_id).execute()

    return PrintMentionsOutput(mentions=kept)
