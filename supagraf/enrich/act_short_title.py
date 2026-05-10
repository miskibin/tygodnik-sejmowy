"""acts.short_title enrichment: LLM-only path.

Tygodnik "WCHODZI W ŻYCIE" card renders raw `acts.title`, which for ELI items
runs 200-400 chars (`Obwieszczenie Marszałka Sejmu Rzeczypospolitej Polskiej
z dnia ... w sprawie ogłoszenia jednolitego tekstu ustawy o ...`). We
materialize a plain-Polish short_title parallel to prints.short_title and
votings.short_title.

Single path: LLM rewrite of `acts.title` via deepseek-v4-flash. No PDF read,
no print fast-path — `processes.eli_act_id → process_stages.print_id` linkage
is multi-print without a "main" marker, and Obwieszczenia / MP entries lack
any sejm print at all.

Idempotent: rows enriched within RECENT_THRESHOLD_DAYS are skipped unless
force=True.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

from loguru import logger
from pydantic import BaseModel, ConfigDict, Field

from supagraf.db import supabase
from supagraf.enrich import LLM_MODELS
from supagraf.enrich.audit import with_model_run
from supagraf.enrich.llm import call_structured

JOB_NAME = "act_short_title"
PROMPT_NAME = "act_short_title"

ACT_LLM_MODEL = os.environ.get("SUPAGRAF_ACT_LLM_MODEL", LLM_MODELS["flash"])
MAX_SHORT_TITLE_CHARS = 120
RECENT_THRESHOLD_DAYS = 30


class ShortTitleOut(BaseModel):
    model_config = ConfigDict(extra="forbid")
    short_title: str = Field(min_length=1, max_length=MAX_SHORT_TITLE_CHARS)


def _persist(act_id: int, *, short_title: str, source: str, model: str | None) -> None:
    supabase().table("acts").update({
        "short_title": short_title,
        "short_title_source": source,
        "short_title_enriched_at": datetime.now(timezone.utc).isoformat(),
        "short_title_model": model,
    }).eq("id", act_id).execute()


@with_model_run(
    fn_name=JOB_NAME,
    model=ACT_LLM_MODEL,
    entity_type_arg="entity_type",
    entity_id_arg="entity_id",
    prompt_version_arg="prompt_version",
    prompt_sha256_arg="prompt_sha256",
)
def enrich_one_act(
    *,
    entity_type: str,
    entity_id: str,
    title: str,
    act_type: str | None = None,
    llm_model: str = ACT_LLM_MODEL,
    prompt_version: int | None = None,
    prompt_sha256: str | None = None,
    model_run_id: int | None = None,
) -> dict:
    """Enrich a single act. LLM-only. Returns {source, short_title}."""
    act_id = int(entity_id)

    user_input_lines = [f"act.title: {title}"]
    if act_type:
        user_input_lines.append(f"act.type: {act_type}")
    user_input = "\n".join(user_input_lines)

    call = call_structured(
        model=llm_model,
        prompt_name=PROMPT_NAME,
        user_input=user_input,
        output_model=ShortTitleOut,
        prompt_version=prompt_version,
    )
    parsed: ShortTitleOut = call.parsed  # type: ignore[assignment]
    cleaned = parsed.short_title.strip()[:MAX_SHORT_TITLE_CHARS]
    if not cleaned:
        raise ValueError(f"empty short_title after cleanup for act {act_id}")
    _persist(act_id, short_title=cleaned, source="llm", model=llm_model)
    return {"source": "llm", "short_title": cleaned}


def fetch_pending_acts(
    *,
    limit: int,
    days: int | None,
    force: bool,
) -> list[dict]:
    """Pending = short_title NULL OR (force AND enriched > N days ago).

    Time filter on `legal_status_date` (the same field driving the tygodnik
    event_bucket). Rows without legal_status_date are excluded — those won't
    surface in the UI either.
    """
    sb = supabase()
    q = sb.table("acts").select("id, title, type, legal_status_date")
    q = q.not_.is_("legal_status_date", "null")
    if days is not None and days > 0:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).date().isoformat()
        q = q.gte("legal_status_date", cutoff)
    if not force:
        threshold = (datetime.now(timezone.utc) - timedelta(days=RECENT_THRESHOLD_DAYS)).isoformat()
        q = q.or_(f"short_title.is.null,short_title_enriched_at.lt.{threshold}")
    q = q.order("legal_status_date", desc=True)
    if limit > 0:
        q = q.limit(limit)
    return q.execute().data or []


def enrich_acts(
    *,
    limit: int = 0,
    days: int | None = None,
    force: bool = False,
    llm_model: str = ACT_LLM_MODEL,
) -> tuple[int, int]:
    """Run enrichment over pending acts. Returns (n_llm, n_failed)."""
    from supagraf.enrich.llm import _resolve_prompt

    prompt = _resolve_prompt(PROMPT_NAME)
    pending = fetch_pending_acts(limit=limit, days=days, force=force)
    if not pending:
        logger.info("no pending acts (days={})", days)
        return 0, 0

    n_llm = 0
    n_failed = 0
    for r in pending:
        aid = r["id"]
        try:
            enrich_one_act(
                entity_type="act",
                entity_id=str(aid),
                title=r["title"] or "",
                act_type=r.get("type"),
                llm_model=llm_model,
                prompt_version=prompt.version,
                prompt_sha256=prompt.sha256,
            )
            n_llm += 1
            if n_llm % 25 == 0:
                logger.info("enriched {}/{}", n_llm, len(pending))
        except Exception as e:
            n_failed += 1
            logger.error("act {} failed: {!r}", aid, e)
    logger.info("done: llm={} failed={}", n_llm, n_failed)
    return n_llm, n_failed


__all__ = [
    "ShortTitleOut",
    "ACT_LLM_MODEL",
    "MAX_SHORT_TITLE_CHARS",
    "enrich_one_act",
    "enrich_acts",
]
