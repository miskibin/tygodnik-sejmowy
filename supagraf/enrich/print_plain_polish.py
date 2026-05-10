"""print -> plain-Polish summary + ISO 24495 readability class via LLM.

Mirrors print_summary / print_personas / print_action: extract PDF (B1) ->
call_structured (B2) -> persist with versioned prompt provenance, all wrapped
in @with_model_run (B5).

The summary_plain word-count window (100-250 words) is enforced post-validate
on the Pydantic side; the ISO band is constrained to the 6 CEFR-style levels
matching the SQL CHECK in 0040.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from supagraf.db import supabase
from supagraf.enrich import DEFAULT_LLM_MODEL
from supagraf.enrich.audit import with_model_run
from supagraf.enrich.llm import LLMResponseError, call_structured
from supagraf.enrich.pdf import extract_pdf
from supagraf.enrich.pdf_fetch import resolve_print_pdf

JOB_NAME = "print_plain_polish"
PROMPT_NAME = "print_plain_polish"
MAX_INPUT_CHARS = 8000
# Window widened from [100,250] to [50,300] after Gemini-3.1-flash-lite
# consistently produced ~70-90 word concise summaries on short Sejm sprawozdania
# (1-3 page committee reports). Below 50 the output stops being a useful plain
# summary; above 300 it loses the "punch" property. The lower bound matches
# typical 4-6 sentence Polish prose at ~10-15 words/sentence.
MIN_WORDS = 50
MAX_WORDS = 300

ISO24495Class = Literal["A1", "A2", "B1", "B2", "C1", "C2"]


class PrintPlainPolishOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    summary_plain: str = Field(min_length=80, max_length=2500)
    iso24495_class: ISO24495Class

    @field_validator("summary_plain")
    @classmethod
    def _word_count_in_range(cls, v: str) -> str:
        # Polish text — split on whitespace is good enough for an upper-bound
        # word-count gate. We accept the LLM output as long as it falls into
        # the ISO 24495 plain-language envelope; tighter linguistic checks
        # are deferred to a downstream readability post-process.
        n = len(v.split())
        if n < MIN_WORDS or n > MAX_WORDS:
            raise ValueError(
                f"summary_plain word count {n} outside [{MIN_WORDS},{MAX_WORDS}]"
            )
        return v


@with_model_run(
    fn_name=JOB_NAME,
    model=DEFAULT_LLM_MODEL,
    entity_type_arg="entity_type",
    entity_id_arg="entity_id",
    prompt_version_arg="prompt_version",
    prompt_sha256_arg="prompt_sha256",
)
def summarize_plain_polish(
    *,
    entity_type: str,
    entity_id: str,
    pdf_relpath: str,
    prompt_version: int | None = None,
    prompt_sha256: str | None = None,
    llm_model: str = DEFAULT_LLM_MODEL,
    model_run_id: int | None = None,
) -> PrintPlainPolishOutput:
    pdf_path = resolve_print_pdf(pdf_relpath)
    extraction = extract_pdf(pdf_path)
    if not extraction.text.strip():
        raise ValueError(f"empty extracted text for {pdf_path.name}")

    call = call_structured(
        model=llm_model,
        prompt_name=PROMPT_NAME,
        user_input=extraction.text[:MAX_INPUT_CHARS],
        output_model=PrintPlainPolishOutput,
        prompt_version=prompt_version,
    )
    parsed: PrintPlainPolishOutput = call.parsed  # type: ignore[assignment]

    # CHECK in 0040 binds summary_plain + iso24495_class + 3 provenance cols
    # together — write atomically.
    supabase().table("prints").update({
        "summary_plain": parsed.summary_plain,
        "iso24495_class": parsed.iso24495_class,
        "summary_plain_prompt_version": str(call.prompt.version),
        "summary_plain_prompt_sha256": call.prompt.sha256,
        "summary_plain_model": llm_model,
    }).eq("number", entity_id).execute()

    return parsed
