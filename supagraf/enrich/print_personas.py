"""print -> persona_tags via LLM (Phase F1).

Mirrors print_summary.py / print_stance.py: extract PDF (B1) -> call_structured
with versioned prompt (B2) -> persist on prints row, all wrapped in
@with_model_run (B5). 25-tag taxonomy locked in PERSONA_TAGS; Pydantic
Literal makes any out-of-set tag a hard schema mismatch (LLMResponseError).
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

JOB_NAME = "print_personas"
PROMPT_NAME = "print_personas"
MAX_INPUT_CHARS = 8000

# Taxonomy locked. Adding/removing requires a migration + prompt bump (v2).
PERSONA_TAGS = (
    "najemca", "wlasciciel-mieszkania", "rodzic-ucznia", "pacjent-nfz",
    "kierowca-zawodowy", "rolnik", "jdg", "emeryt", "pracownik-najemny",
    "student", "przedsiebiorca-pracodawca", "niepelnosprawny", "wies",
    "duze-miasto", "podatnik-pit", "podatnik-vat", "kierowca-prywatny",
    "odbiorca-energii", "beneficjent-rodzinny", "opiekun-seniora",
    "dzialkowicz", "wedkarz", "mysliwy", "hodowca", "konsument",
)

PersonaTag = Literal[
    "najemca", "wlasciciel-mieszkania", "rodzic-ucznia", "pacjent-nfz",
    "kierowca-zawodowy", "rolnik", "jdg", "emeryt", "pracownik-najemny",
    "student", "przedsiebiorca-pracodawca", "niepelnosprawny", "wies",
    "duze-miasto", "podatnik-pit", "podatnik-vat", "kierowca-prywatny",
    "odbiorca-energii", "beneficjent-rodzinny", "opiekun-seniora",
    "dzialkowicz", "wedkarz", "mysliwy", "hodowca", "konsument",
]


class PrintPersonasOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tags: list[PersonaTag] = Field(min_length=0, max_length=10)
    rationale: str = Field(min_length=10, max_length=400)


@with_model_run(
    fn_name=JOB_NAME,
    model=DEFAULT_LLM_MODEL,
    entity_type_arg="entity_type",
    entity_id_arg="entity_id",
    prompt_version_arg="prompt_version",
    prompt_sha256_arg="prompt_sha256",
)
def tag_personas(
    *,
    entity_type: str,
    entity_id: str,
    pdf_relpath: str,
    prompt_version: int | None = None,
    prompt_sha256: str | None = None,
    llm_model: str = DEFAULT_LLM_MODEL,
    model_run_id: int | None = None,
) -> PrintPersonasOutput:
    pdf_path = resolve_print_pdf(pdf_relpath)
    extraction = extract_pdf(pdf_path)
    if not extraction.text.strip():
        raise ValueError(f"empty extracted text for {pdf_path.name}")

    call = call_structured(
        model=llm_model,
        prompt_name=PROMPT_NAME,
        user_input=extraction.text[:MAX_INPUT_CHARS],
        output_model=PrintPersonasOutput,
        prompt_version=prompt_version,
    )
    parsed: PrintPersonasOutput = call.parsed  # type: ignore[assignment]

    # CHECK in 0030 binds persona_tags + all 3 provenance cols — atomic stamp.
    supabase().table("prints").update({
        "persona_tags": parsed.tags,
        "persona_tags_prompt_version": str(call.prompt.version),
        "persona_tags_prompt_sha256": call.prompt.sha256,
        "persona_tags_model": llm_model,
    }).eq("number", entity_id).execute()

    return parsed
