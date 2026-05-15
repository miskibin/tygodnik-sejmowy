"""proceeding_statement → multi-purpose LLM enrichment.

One LLM pass extracts viral_score/quote/reason + tone + topic_tags +
mentioned_entities + key_claims + addressee + summary_one_line. Persisted to
proceeding_statements columns added in migration 0061.

Default model: deepseek-v4-flash (faster + cheaper than the v4-pro used for
prints; Polish parliamentary speech is voluminous and most utterances are
short → flash handles it well). Override via SUPAGRAF_UTTERANCE_LLM_MODEL.

Mirrors print_impact.py: extract → call_structured → persist with
versioned prompt provenance via @with_model_run.
"""
from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Literal

from loguru import logger
from pydantic import BaseModel, ConfigDict, Field, field_validator

from supagraf.db import supabase
from supagraf.enrich import LLM_MODELS
from supagraf.enrich.audit import with_model_run
from supagraf.enrich.llm import call_structured

JOB_NAME = "utterance_enrich"
PROMPT_NAME = "utterance_enrich"

MAX_INPUT_CHARS = 6000
MAX_QUOTE_CHARS = 200
MAX_REASON_CHARS = 120
MAX_SUMMARY_CHARS = 120
MAX_KEY_CLAIMS = 3
MAX_TOPIC_TAGS = 3
MAX_MENTIONED_PER_LIST = 20

# Default to flash for utterances. SUPAGRAF_UTTERANCE_LLM_MODEL > LLM_MODELS["flash"].
UTTERANCE_LLM_MODEL = os.environ.get("SUPAGRAF_UTTERANCE_LLM_MODEL", LLM_MODELS["flash"])

Tone = Literal[
    "konfrontacyjny",
    "merytoryczny",
    "populistyczny",
    "emocjonalny",
    "techniczny",
    "proceduralny",
]

Addressee = Literal[
    "rzad",
    "opozycja",
    "konkretna_osoba",
    "spoleczenstwo",
    "marszalek",
    "klub",
    "komisja",
    "inne",
]

TopicTag = Literal[
    "sady-prawa",
    "bezpieczenstwo-obrona",
    "biznes-podatki",
    "praca-zus",
    "zdrowie",
    "edukacja-rodzina",
    "emerytury",
    "rolnictwo-wies",
    "mieszkanie-media",
    "transport",
    "srodowisko-klimat",
]


class MentionedEntities(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mps: list[str] = Field(default_factory=list, max_length=MAX_MENTIONED_PER_LIST)
    parties: list[str] = Field(default_factory=list, max_length=MAX_MENTIONED_PER_LIST)
    ministers: list[str] = Field(default_factory=list, max_length=MAX_MENTIONED_PER_LIST)
    prints: list[str] = Field(default_factory=list, max_length=MAX_MENTIONED_PER_LIST)


def _smart_truncate(s: str, limit: int) -> str:
    """Truncate near the limit at the cleanest boundary we can find.

    Why: v4-flash overshoots `summary_one_line`/`viral_quote` ~30% of calls.
    Rejecting whole batch row for ~10 char overshoot wastes the LLM call;
    salvage it by cutting at the nearest sentence/clause/word boundary.
    """
    if len(s) <= limit:
        return s
    head = s[:limit]
    for sep in (". ", "; ", ", ", " — ", " - "):
        idx = head.rfind(sep)
        if idx >= int(limit * 0.5):
            return s[: idx + (1 if sep[0] in ".;," else 0)].rstrip()
    idx = head.rfind(" ")
    if idx >= int(limit * 0.5):
        return head[:idx].rstrip()
    return head.rstrip()


class UtteranceEnrichmentOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    viral_score: float = Field(ge=0.0, le=1.0)
    viral_quote: str = Field(default="", max_length=MAX_QUOTE_CHARS)
    viral_reason: str = Field(default="", max_length=MAX_REASON_CHARS)
    tone: Tone
    topic_tags: list[TopicTag] = Field(default_factory=list, max_length=MAX_TOPIC_TAGS)
    mentioned_entities: MentionedEntities
    key_claims: list[str] = Field(default_factory=list, max_length=MAX_KEY_CLAIMS)
    addressee: Addressee
    summary_one_line: str = Field(min_length=1, max_length=MAX_SUMMARY_CHARS)

    @field_validator("summary_one_line", mode="before")
    @classmethod
    def _trim_summary(cls, v: object) -> object:
        return _smart_truncate(v, MAX_SUMMARY_CHARS) if isinstance(v, str) else v

    @field_validator("viral_quote", mode="before")
    @classmethod
    def _trim_quote(cls, v: object) -> object:
        return _smart_truncate(v, MAX_QUOTE_CHARS) if isinstance(v, str) else v

    @field_validator("viral_reason", mode="before")
    @classmethod
    def _trim_reason(cls, v: object) -> object:
        return _smart_truncate(v, MAX_REASON_CHARS) if isinstance(v, str) else v


@with_model_run(
    fn_name=JOB_NAME,
    model=UTTERANCE_LLM_MODEL,
    entity_type_arg="entity_type",
    entity_id_arg="entity_id",
    prompt_version_arg="prompt_version",
    prompt_sha256_arg="prompt_sha256",
)
def enrich_one_statement(
    *,
    entity_type: str,
    entity_id: str,
    body_text: str,
    prompt_version: int | None = None,
    prompt_sha256: str | None = None,
    llm_model: str = UTTERANCE_LLM_MODEL,
    model_run_id: int | None = None,
) -> UtteranceEnrichmentOutput:
    if not body_text or not body_text.strip():
        raise ValueError(f"empty body_text for statement {entity_id}")

    call = call_structured(
        model=llm_model,
        prompt_name=PROMPT_NAME,
        user_input=body_text[:MAX_INPUT_CHARS],
        output_model=UtteranceEnrichmentOutput,
        prompt_version=prompt_version,
    )
    parsed: UtteranceEnrichmentOutput = call.parsed  # type: ignore[assignment]

    # Cross-field invariant: low viral_score → empty quote/reason. Enforced
    # here (not in Pydantic) because the prompt may comply or not; we'd
    # rather coerce than fail the whole batch.
    quote = parsed.viral_quote if parsed.viral_score >= 0.4 else ""
    reason = parsed.viral_reason if quote else ""

    supabase().table("proceeding_statements").update({
        "viral_score": parsed.viral_score,
        "viral_quote": quote or None,
        "viral_reason": reason or None,
        "tone": parsed.tone,
        "topic_tags": parsed.topic_tags,
        "mentioned_entities": parsed.mentioned_entities.model_dump(),
        "key_claims": parsed.key_claims,
        "addressee": parsed.addressee,
        "summary_one_line": parsed.summary_one_line,
        "enrichment_model": llm_model,
        "enrichment_prompt_version": str(call.prompt.version),
        "enrichment_prompt_sha256": call.prompt.sha256,
    }).eq("id", int(entity_id)).execute()

    return parsed


def _day_ids_for_sitting(term: int, sitting_num: int) -> list[int]:
    sb = supabase()
    procs = (
        sb.table("proceedings")
        .select("id")
        .eq("term", term)
        .eq("number", sitting_num)
        .execute()
        .data or []
    )
    if not procs:
        return []
    pid = procs[0]["id"]
    days = (
        sb.table("proceeding_days")
        .select("id")
        .eq("proceeding_id", pid)
        .execute()
        .data or []
    )
    return [d["id"] for d in days]


def fetch_pending_statements(
    *,
    term: int,
    sitting_num: int | None,
    limit: int,
) -> list[dict]:
    """Statements with body_text and no enrichment yet.

    Default scope: enrichment_prompt_sha256 IS NULL — never enriched. Re-runs
    on already-enriched rows require an explicit override (out of scope for
    MVP; bump prompt_version + custom backfill for that).
    """
    sb = supabase()
    q = (
        sb.table("proceeding_statements")
        .select("id, body_text, proceeding_day_id")
        .eq("term", term)
        .is_("enrichment_prompt_sha256", "null")
        .not_.is_("body_text", "null")
    )
    if sitting_num is not None:
        day_ids = _day_ids_for_sitting(term, sitting_num)
        if not day_ids:
            return []
        q = q.in_("proceeding_day_id", day_ids)
    if limit > 0:
        q = q.limit(limit)
    return q.execute().data or []


def enrich_statements(
    *,
    term: int = 10,
    sitting_num: int | None = None,
    limit: int = 0,
    llm_model: str = UTTERANCE_LLM_MODEL,
) -> tuple[int, int]:
    """Run enrichment over pending statements. Returns (ok, failed) counts."""
    from supagraf.enrich.llm import _resolve_prompt

    prompt = _resolve_prompt(PROMPT_NAME)
    pending = fetch_pending_statements(
        term=term,
        sitting_num=sitting_num,
        limit=limit,
    )
    if not pending:
        logger.info("no pending statements (term={}, sitting={})", term, sitting_num)
        return 0, 0

    concurrency = max(1, int(os.environ.get("SUPAGRAF_UTTERANCE_CONCURRENCY", "1")))

    def _run_one(row: dict) -> tuple[int, BaseException | None]:
        sid = row["id"]
        try:
            enrich_one_statement(
                entity_type="proceeding_statement",
                entity_id=str(sid),
                body_text=row["body_text"] or "",
                prompt_version=prompt.version,
                prompt_sha256=prompt.sha256,
                llm_model=llm_model,
            )
            return sid, None
        except Exception as e:
            return sid, e

    n_ok = 0
    n_failed = 0
    if concurrency == 1:
        for r in pending:
            sid, err = _run_one(r)
            if err is None:
                n_ok += 1
                if n_ok % 20 == 0:
                    logger.info("enriched {}/{} statements", n_ok, len(pending))
            else:
                n_failed += 1
                logger.error("statement {} failed: {!r}", sid, err)
    else:
        # LLM call is the only meaningful latency; httpx releases the GIL on
        # network IO, and supabase-py is thread-safe for independent row writes.
        logger.info("enriching {} statements with concurrency={}", len(pending), concurrency)
        with ThreadPoolExecutor(max_workers=concurrency) as ex:
            futures = [ex.submit(_run_one, r) for r in pending]
            for fut in as_completed(futures):
                sid, err = fut.result()
                if err is None:
                    n_ok += 1
                    if n_ok % 20 == 0:
                        logger.info("enriched {}/{} statements", n_ok, len(pending))
                else:
                    n_failed += 1
                    logger.error("statement {} failed: {!r}", sid, err)
    logger.info("done: ok={} failed={}", n_ok, n_failed)
    return n_ok, n_failed


__all__ = [
    "UtteranceEnrichmentOutput",
    "MentionedEntities",
    "enrich_one_statement",
    "enrich_statements",
    "UTTERANCE_LLM_MODEL",
]
