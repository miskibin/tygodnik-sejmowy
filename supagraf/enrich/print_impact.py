"""print -> impact_punch + affected_groups via LLM.

Mirrors print_personas: extract PDF (B1) -> call_structured (B2) -> persist
with versioned prompt provenance via @with_model_run (B5).

affected_groups is a JSONB array of {tag, severity, est_population}. Tag is
constrained to the same 25-tag taxonomy as 0030 (persona_tags); severity
to {high, medium, low}. est_population is NULL by default — GUS lookup is
deferred to a downstream pass.
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
from supagraf.enrich.print_personas import PERSONA_TAGS, PersonaTag

JOB_NAME = "print_impact"
PROMPT_NAME = "print_impact"
MAX_INPUT_CHARS = 8000
MAX_PUNCH_CHARS = 280
MAX_GROUPS = 15

Severity = Literal["high", "medium", "low"]


class AffectedGroup(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tag: PersonaTag
    severity: Severity
    est_population: int | None = Field(default=None, ge=1)


class PrintImpactOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    impact_punch: str = Field(min_length=10, max_length=MAX_PUNCH_CHARS)
    affected_groups: list[AffectedGroup] = Field(min_length=0, max_length=MAX_GROUPS)


@with_model_run(
    fn_name=JOB_NAME,
    model=DEFAULT_LLM_MODEL,
    entity_type_arg="entity_type",
    entity_id_arg="entity_id",
    prompt_version_arg="prompt_version",
    prompt_sha256_arg="prompt_sha256",
)
def assess_impact(
    *,
    entity_type: str,
    entity_id: str,
    pdf_relpath: str,
    prompt_version: int | None = None,
    prompt_sha256: str | None = None,
    llm_model: str = DEFAULT_LLM_MODEL,
    model_run_id: int | None = None,
) -> PrintImpactOutput:
    pdf_path = resolve_print_pdf(pdf_relpath)
    extraction = extract_pdf(pdf_path)
    if not extraction.text.strip():
        raise ValueError(f"empty extracted text for {pdf_path.name}")

    call = call_structured(
        model=llm_model,
        prompt_name=PROMPT_NAME,
        user_input=extraction.text[:MAX_INPUT_CHARS],
        output_model=PrintImpactOutput,
        prompt_version=prompt_version,
    )
    parsed: PrintImpactOutput = call.parsed  # type: ignore[assignment]

    # CHECK in 0041 binds impact_punch + affected_groups + 3 provenance cols.
    # affected_groups is a Pydantic list of BaseModel — serialize to JSON-able
    # dicts so postgrest stores it in the jsonb column verbatim.
    supabase().table("prints").update({
        "impact_punch": parsed.impact_punch,
        "affected_groups": [g.model_dump() for g in parsed.affected_groups],
        "impact_prompt_version": str(call.prompt.version),
        "impact_prompt_sha256": call.prompt.sha256,
        "impact_model": llm_model,
    }).eq("number", entity_id).execute()

    return parsed
