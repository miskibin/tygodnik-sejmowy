"""voting.short_title enrichment: print fast-path + LLM fallback.

Citizen UI shows raw agenda titles ("Pkt. 5 Pierwsze czytanie rządowego
projektu ustawy o zmianie ustawy — Prawo oświatowe..."). We materialize a
plain-Polish short_title parallel to prints.short_title.

Two paths:
  1. fast-path — voting linked via voting_print_links.role='main' to a
     print that already has short_title. Copy it. No LLM cost.
  2. llm — deepseek-v4-flash prompt with raw voting.title + any linked print
     short_titles for context. ≤120 char hard cap (Pydantic + DB CHECK).

Idempotent: rows with short_title_enriched_at within RECENT_THRESHOLD_DAYS
are skipped unless force=True.
"""
from __future__ import annotations

import os
import re
from datetime import datetime, timedelta, timezone

from loguru import logger
from pydantic import BaseModel, ConfigDict, Field

from supagraf.db import supabase
from supagraf.enrich.audit import with_model_run
from supagraf.enrich.llm import call_structured

JOB_NAME = "voting_short_title"
PROMPT_NAME = "voting_short_title"

VOTING_LLM_MODEL = os.environ.get("SUPAGRAF_VOTING_LLM_MODEL", "deepseek-v4-flash")
MAX_SHORT_TITLE_CHARS = 120
RECENT_THRESHOLD_DAYS = 30

_PKT_PREFIX_RE = re.compile(r"^(?:Pkt\.?|Punkt)\s*\d+[.:]?\s*", re.IGNORECASE)


def _strip_pkt_prefix(s: str) -> str:
    return _PKT_PREFIX_RE.sub("", s).strip()


class ShortTitleOut(BaseModel):
    model_config = ConfigDict(extra="forbid")
    short_title: str = Field(min_length=1, max_length=MAX_SHORT_TITLE_CHARS)


def _fetch_main_print_short_title(voting_id: int) -> str | None:
    """Return short_title of the role='main' linked print, if any."""
    sb = supabase()
    rows = (
        sb.table("voting_print_links")
        .select("print_id, role, prints!inner(short_title)")
        .eq("voting_id", voting_id)
        .eq("role", "main")
        .execute()
        .data or []
    )
    for r in rows:
        st = (r.get("prints") or {}).get("short_title")
        if st:
            return st
    return None


def _fetch_any_linked_short_titles(voting_id: int) -> list[str]:
    """All linked-print short_titles, any role. Used as LLM context."""
    sb = supabase()
    rows = (
        sb.table("voting_print_links")
        .select("prints!inner(short_title)")
        .eq("voting_id", voting_id)
        .execute()
        .data or []
    )
    out: list[str] = []
    seen: set[str] = set()
    for r in rows:
        st = (r.get("prints") or {}).get("short_title")
        if st and st not in seen:
            out.append(st)
            seen.add(st)
    return out


def _persist(voting_id: int, *, short_title: str, source: str, model: str | None) -> None:
    supabase().table("votings").update({
        "short_title": short_title,
        "short_title_source": source,
        "short_title_enriched_at": datetime.now(timezone.utc).isoformat(),
        "short_title_model": model,
    }).eq("id", voting_id).execute()


@with_model_run(
    fn_name=JOB_NAME,
    model=VOTING_LLM_MODEL,
    entity_type_arg="entity_type",
    entity_id_arg="entity_id",
    prompt_version_arg="prompt_version",
    prompt_sha256_arg="prompt_sha256",
)
def enrich_one_voting(
    *,
    entity_type: str,
    entity_id: str,
    title: str,
    llm_model: str = VOTING_LLM_MODEL,
    prompt_version: int | None = None,
    prompt_sha256: str | None = None,
    model_run_id: int | None = None,
) -> dict:
    """Enrich a single voting. Fast-path or LLM. Returns {source, short_title}."""
    voting_id = int(entity_id)

    fast = _fetch_main_print_short_title(voting_id)
    if fast:
        _persist(voting_id, short_title=fast, source="print_main", model=None)
        return {"source": "print_main", "short_title": fast}

    context_titles = _fetch_any_linked_short_titles(voting_id)
    user_input_lines = [f"voting.title: {title}"]
    if context_titles:
        user_input_lines.append("linked_prints:")
        for ct in context_titles[:5]:
            user_input_lines.append(f"  - {ct}")
    user_input = "\n".join(user_input_lines)

    call = call_structured(
        model=llm_model,
        prompt_name=PROMPT_NAME,
        user_input=user_input,
        output_model=ShortTitleOut,
        prompt_version=prompt_version,
    )
    parsed: ShortTitleOut = call.parsed  # type: ignore[assignment]
    cleaned = _strip_pkt_prefix(parsed.short_title)[:MAX_SHORT_TITLE_CHARS]
    if not cleaned:
        raise ValueError(f"empty short_title after cleanup for voting {voting_id}")
    _persist(voting_id, short_title=cleaned, source="llm", model=llm_model)
    return {"source": "llm", "short_title": cleaned}


def fetch_pending_votings(
    *,
    term: int,
    limit: int,
    days: int | None,
    force: bool,
) -> list[dict]:
    """Pending = short_title NULL OR (force AND enriched > N days ago)."""
    sb = supabase()
    q = sb.table("votings").select("id, title, date").eq("term", term)
    if days is not None and days > 0:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        q = q.gte("date", cutoff)
    if not force:
        threshold = (datetime.now(timezone.utc) - timedelta(days=RECENT_THRESHOLD_DAYS)).isoformat()
        # short_title null OR enrichment older than threshold
        q = q.or_(f"short_title.is.null,short_title_enriched_at.lt.{threshold}")
    q = q.order("date", desc=True)
    if limit > 0:
        q = q.limit(limit)
    return q.execute().data or []


def enrich_votings(
    *,
    term: int = 10,
    limit: int = 0,
    days: int | None = None,
    force: bool = False,
    llm_model: str = VOTING_LLM_MODEL,
) -> tuple[int, int, int]:
    """Run enrichment over pending votings. Returns (fast_path, llm, failed)."""
    from supagraf.enrich.llm import _resolve_prompt

    prompt = _resolve_prompt(PROMPT_NAME)
    pending = fetch_pending_votings(term=term, limit=limit, days=days, force=force)
    if not pending:
        logger.info("no pending votings (term={}, days={})", term, days)
        return 0, 0, 0

    n_fast = 0
    n_llm = 0
    n_failed = 0
    for r in pending:
        vid = r["id"]
        try:
            res = enrich_one_voting(
                entity_type="voting",
                entity_id=str(vid),
                title=r["title"] or "",
                llm_model=llm_model,
                prompt_version=prompt.version,
                prompt_sha256=prompt.sha256,
            )
            if res["source"] == "print_main":
                n_fast += 1
            else:
                n_llm += 1
            if (n_fast + n_llm) % 25 == 0:
                logger.info(
                    "enriched {}/{}: fast={} llm={}",
                    n_fast + n_llm, len(pending), n_fast, n_llm,
                )
        except Exception as e:
            n_failed += 1
            logger.error("voting {} failed: {!r}", vid, e)
    logger.info("done: fast={} llm={} failed={}", n_fast, n_llm, n_failed)
    return n_fast, n_llm, n_failed


__all__ = [
    "ShortTitleOut",
    "VOTING_LLM_MODEL",
    "MAX_SHORT_TITLE_CHARS",
    "enrich_one_voting",
    "enrich_votings",
]
