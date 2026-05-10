"""Single enrichment job: print -> {summary, short_title} via LLM.

Combines B1 (extract_pdf), B2 (call_structured), B5 (with_model_run).
Reads PDF -> cache (or live extract) -> calls LLM with versioned prompt
-> persists result on prints row (NEW columns added in 0014).

Failure modes:
  - PDF missing on disk -> FileNotFoundError (fail loud)
  - LLM 4xx / schema mismatch -> LLMResponseError (logged to enrichment_failures)
  - Empty extracted text -> ValueError (no LLM call wasted)

Idempotency: re-running with the same prompt_version repeats the work
(no early-skip yet). Phase C will add a "skip if summary_prompt_version
matches" guard once we settle on canonical version compare semantics
across enrichers.
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from supagraf.db import supabase
from supagraf.enrich import DEFAULT_LLM_MODEL
from supagraf.enrich.audit import with_model_run
from supagraf.enrich.llm import call_structured
from supagraf.enrich.pdf import extract_pdf
from supagraf.enrich.pdf_fetch import resolve_print_pdf

JOB_NAME = "print_summary"
PROMPT_NAME = "print_summary"
# Cap text passed to LLM; preserves provenance (no truncation of stored text)
# while keeping prompt cost predictable. 8k chars ~= ~2k tokens for Polish.
MAX_INPUT_CHARS = 8000


class PrintSummaryOutput(BaseModel):
    # extra='forbid' makes schema mismatch (LLM hallucinating fields) fatal —
    # call_structured surfaces ValidationError as LLMResponseError.
    model_config = ConfigDict(extra="forbid")
    summary: str = Field(min_length=1, max_length=1200)
    short_title: str = Field(min_length=1, max_length=160)


@with_model_run(
    fn_name=JOB_NAME,
    model=DEFAULT_LLM_MODEL,
    entity_type_arg="entity_type",
    entity_id_arg="entity_id",
    prompt_version_arg="prompt_version",
    prompt_sha256_arg="prompt_sha256",
)
def summarize_print(
    *,
    entity_type: str,                 # always 'print' — validated by decorator
    entity_id: str,                   # prints.number
    pdf_relpath: str,                 # path under fixtures/sejm/prints/
    prompt_version: int | None = None,
    prompt_sha256: str | None = None, # informational; resolver computes real sha
    llm_model: str = DEFAULT_LLM_MODEL,
    model_run_id: int | None = None,
) -> PrintSummaryOutput:
    pdf_path = resolve_print_pdf(pdf_relpath)
    extraction = extract_pdf(pdf_path)
    if not extraction.text.strip():
        # Empty extracted text → never call LLM with junk; fail loud so the
        # operator can investigate (likely image-only scan needing OCR).
        raise ValueError(f"empty extracted text for {pdf_path.name}")

    call = call_structured(
        model=llm_model,
        prompt_name=PROMPT_NAME,
        user_input=extraction.text[:MAX_INPUT_CHARS],
        output_model=PrintSummaryOutput,
        prompt_version=prompt_version,
    )
    parsed: PrintSummaryOutput = call.parsed  # type: ignore[assignment]

    # Persist on prints row + record which prompt produced it. The CHECK
    # constraint in 0014 enforces all four provenance columns are non-null
    # together with summary, so this update either fully stamps or fully fails.
    supabase().table("prints").update({
        "summary": parsed.summary,
        "short_title": parsed.short_title,
        "summary_prompt_version": str(call.prompt.version),
        "summary_prompt_sha256": call.prompt.sha256,
        "summary_model": llm_model,
    }).eq("number", entity_id).execute()

    return parsed
