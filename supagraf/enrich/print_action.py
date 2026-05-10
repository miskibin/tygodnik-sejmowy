"""Single enrichment job: print -> {citizen_action, rationale} via LLM.

Mirrors print_summary.py / print_stance.py — extract PDF (B1) -> call_structured
(B2) -> persist with versioned prompt provenance, all wrapped in @with_model_run
(B5). The action column may legitimately be NULL after a successful run when
the LLM decides no concrete citizen action exists (proceduralne / ratyfikacyjne).
Provenance columns are still stamped: pending = citizen_action_model NULL.
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from supagraf.db import supabase
from supagraf.enrich import DEFAULT_LLM_MODEL
from supagraf.enrich.audit import with_model_run
from supagraf.enrich.llm import call_structured
from supagraf.enrich.pdf import extract_pdf
from supagraf.enrich.pdf_fetch import resolve_print_pdf

JOB_NAME = "print_citizen_action"
PROMPT_NAME = "print_citizen_action"
MAX_INPUT_CHARS = 8000


class PrintCitizenActionOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: str | None = Field(default=None, max_length=200)
    rationale: str = Field(min_length=10, max_length=300)


@with_model_run(
    fn_name=JOB_NAME,
    model=DEFAULT_LLM_MODEL,
    entity_type_arg="entity_type",
    entity_id_arg="entity_id",
    prompt_version_arg="prompt_version",
    prompt_sha256_arg="prompt_sha256",
)
def suggest_print_action(
    *,
    entity_type: str,
    entity_id: str,
    pdf_relpath: str,
    prompt_version: int | None = None,
    prompt_sha256: str | None = None,
    llm_model: str = DEFAULT_LLM_MODEL,
    model_run_id: int | None = None,
) -> PrintCitizenActionOutput:
    pdf_path = resolve_print_pdf(pdf_relpath)
    extraction = extract_pdf(pdf_path)
    if not extraction.text.strip():
        raise ValueError(f"empty extracted text for {pdf_path.name}")

    call = call_structured(
        model=llm_model,
        prompt_name=PROMPT_NAME,
        user_input=extraction.text[:MAX_INPUT_CHARS],
        output_model=PrintCitizenActionOutput,
        prompt_version=prompt_version,
    )
    parsed: PrintCitizenActionOutput = call.parsed  # type: ignore[assignment]

    # Persist all 4 provenance cols even when action is None — provenance reflects
    # "we ran the job" not "we got a non-null answer". CHECK 0031 enforces all
    # 3 provenance cols stamped together.
    supabase().table("prints").update({
        "citizen_action": parsed.action,
        "citizen_action_prompt_version": str(call.prompt.version),
        "citizen_action_prompt_sha256": call.prompt.sha256,
        "citizen_action_model": llm_model,
    }).eq("number", entity_id).execute()

    return parsed
