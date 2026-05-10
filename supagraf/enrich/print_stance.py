"""Single enrichment job: print -> {stance, stance_confidence} via LLM.

Mirrors print_summary.py — extract PDF (B1, paddle markdown), call_structured
with versioned prompt (B2), wrapped in @with_model_run (B5). Persists
stance + confidence + provenance on the prints row. Schema mismatch
fatal (LLMResponseError); empty extracted text fail-loud.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from supagraf.db import supabase
from supagraf.enrich import DEFAULT_LLM_MODEL
from supagraf.enrich.audit import with_model_run
from supagraf.enrich.llm import call_structured
from supagraf.enrich.pdf import extract_pdf
from supagraf.enrich.pdf_fetch import resolve_print_pdf

JOB_NAME = "print_stance"
PROMPT_NAME = "print_stance"
# Same cap as print_summary; keeps prompt cost predictable while preserving
# full extracted text in pdf_extracts cache for later reprocessing.
MAX_INPUT_CHARS = 8000

Stance = Literal["FOR", "AGAINST", "NEUTRAL", "MIXED"]


class PrintStanceOutput(BaseModel):
    # extra='forbid' makes schema mismatch (LLM hallucinating fields) fatal —
    # call_structured surfaces ValidationError as LLMResponseError. The
    # confidence Field range mirrors the SQL CHECK; defense-in-depth so
    # an out-of-range value never reaches the DB write.
    model_config = ConfigDict(extra="forbid")
    stance: Stance
    confidence: float = Field(ge=0.0, le=1.0)


@with_model_run(
    fn_name=JOB_NAME,
    model=DEFAULT_LLM_MODEL,
    entity_type_arg="entity_type",
    entity_id_arg="entity_id",
    prompt_version_arg="prompt_version",
    prompt_sha256_arg="prompt_sha256",
)
def classify_stance(
    *,
    entity_type: str,                 # always 'print' — validated by decorator
    entity_id: str,                   # prints.number
    pdf_relpath: str,                 # path under fixtures/sejm/prints/
    prompt_version: int | None = None,
    prompt_sha256: str | None = None, # informational; resolver computes real sha
    llm_model: str = DEFAULT_LLM_MODEL,
    model_run_id: int | None = None,
) -> PrintStanceOutput:
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
        output_model=PrintStanceOutput,
        prompt_version=prompt_version,
    )
    parsed: PrintStanceOutput = call.parsed  # type: ignore[assignment]

    # Persist on prints row + record which prompt produced it. The CHECK
    # constraint in 0016 enforces all four provenance columns are non-null
    # together with stance, so this update either fully stamps or fully fails.
    supabase().table("prints").update({
        "stance": parsed.stance,
        "stance_confidence": parsed.confidence,
        "stance_prompt_version": str(call.prompt.version),
        "stance_prompt_sha256": call.prompt.sha256,
        "stance_model": llm_model,
    }).eq("number", entity_id).execute()

    return parsed
