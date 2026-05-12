"""Match a promise to candidate prints via cosine similarity, then re-rank with LLM.

Two-stage matcher:

1. **Vector pre-filter** (`match_promise`, `match_all_promises`) — calls the
   SQL function `match_promise_to_prints` defined in
   `supabase/migrations/0029_promise_matcher.sql` (re-tuned in 0046). HNSW
   cosine top-k inside the database, default `p_max_distance=0.55` (was 0.60,
   which yielded near-zero matches because qwen3-embedding:0.6b packs Polish
   text in the 0.4-0.5 cosine band).

2. **LLM re-ranker** (`rerank_promise_matches`, `rerank_all_promises`) —
   reads the cosine candidates back, batches all top-K candidates for one
   promise into a single LLM call (saves tokens vs one-call-per-pair),
   and writes a verdict (`confirmed | candidate | rejected`) plus 1-line
   rationale to columns added in 0046.

   PROJECT RULE: use ``deepseek-v4-flash`` for this re-ranker — never Gemini.
   Existing reranked rows in DB came from a historical Gemini run; future
   runs must go through DeepSeek (``SUPAGRAF_LLM_BACKEND=deepseek``,
   ``SUPAGRAF_LLM_MODEL=deepseek-v4-flash``, or pass ``--model`` to the CLI).

Pre-condition for stage 1: the promise must already be embedded
(entity_type='promise', entity_id=promise.id). Run `enrich promises --kind embed`
first.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from loguru import logger
from postgrest.exceptions import APIError
from pydantic import BaseModel, ConfigDict, Field
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from supagraf.db import supabase
from supagraf.enrich import DEFAULT_LLM_MODEL
from supagraf.enrich.embed import DEFAULT_EMBED_MODEL
from supagraf.enrich.llm import call_structured

RERANK_PROMPT_NAME = "promise_match_rerank"


@retry(
    retry=retry_if_exception_type(APIError),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    reraise=True,
)
def match_promise(
    *,
    promise_id: int,
    term: int = 10,
    top_k: int = 25,
    max_distance: float = 0.65,  # widened from 0.55 (2026-05-12) to bring in more
    # borderline cosine candidates — only 39% of promises had any surviving
    # rerank verdict at 0.55; the LLM re-ranker filters out noise the wider
    # band admits. Tighten back if false-positive rate spikes.
    model: str = DEFAULT_EMBED_MODEL,
) -> int:
    r = supabase().rpc(
        "match_promise_to_prints",
        {
            "p_promise_id": promise_id,
            "p_term": term,
            "p_top_k": top_k,
            "p_max_distance": max_distance,
            "p_model": model,
        },
    ).execute()
    affected = int(r.data or 0)
    logger.info("match_promise_to_prints({}) affected={}", promise_id, affected)
    return affected


def match_all_promises(
    *,
    term: int = 10,
    top_k: int = 25,
    max_distance: float = 0.65,  # widened from 0.55 (2026-05-12) to bring in more
    # borderline cosine candidates — only 39% of promises had any surviving
    # rerank verdict at 0.55; the LLM re-ranker filters out noise the wider
    # band admits. Tighten back if false-positive rate spikes.
    model: str = DEFAULT_EMBED_MODEL,
) -> dict[str, int]:
    """Match every promise that has an embedding. Skips promises without one
    (caller should have run embed_promise first; the SQL fn raises otherwise).
    """
    client = supabase()
    promises = (
        client.table("promises")
        .select("id, party_code, slug")
        .order("id")
        .execute()
        .data
        or []
    )
    embedded_ids = {
        row["entity_id"]
        for row in (
            client.table("embeddings")
            .select("entity_id")
            .eq("entity_type", "promise")
            .eq("model", model)
            .execute()
            .data
            or []
        )
    }

    totals = {"matched": 0, "skipped_no_embedding": 0, "candidates": 0}
    for p in promises:
        if str(p["id"]) not in embedded_ids:
            logger.warning(
                "promise {} ({}/{}) not embedded -- skip",
                p["id"], p["party_code"], p["slug"],
            )
            totals["skipped_no_embedding"] += 1
            continue
        n = match_promise(
            promise_id=p["id"],
            term=term,
            top_k=top_k,
            max_distance=max_distance,
            model=model,
        )
        totals["matched"] += 1
        totals["candidates"] += n
    return totals


# ---- LLM re-ranker ---------------------------------------------------------


class PromiseMatchVerdict(BaseModel):
    model_config = ConfigDict(extra="forbid")
    print_number: str
    status: Literal["confirmed", "candidate", "rejected"]
    rationale: str = Field(max_length=200)


class PromiseMatchBatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    verdicts: list[PromiseMatchVerdict]


def _build_rerank_input(promise: dict, candidates: list[dict]) -> str:
    """Render the user-input block fed to the LLM. Uses print.summary, not raw
    text — saves tokens (avg ~200 chars per print vs ~10k for full PDF text).
    """
    lines: list[str] = [
        "## Obietnica",
        f"Partia: {promise.get('party_code')}",
        f"Tytuł: {promise.get('title')}",
        f"Treść: {promise.get('normalized_text') or ''}",
        "",
        "## Druki do oceny",
    ]
    for c in candidates:
        num = c["print_number"]
        summary = (c.get("summary") or "(brak streszczenia)").strip()
        lines.append(f"- Druk {num}: {summary}")
    return "\n".join(lines)


def rerank_promise_matches(
    *,
    promise_id: int,
    top_k: int = 20,
    model: str = DEFAULT_LLM_MODEL,
    embed_model: str = DEFAULT_EMBED_MODEL,
) -> dict[str, int]:
    """Re-rank the top-K cosine candidates for ONE promise via a single LLM call.

    Reads candidate rows from `promise_print_candidates`, fetches each print's
    `summary` (NOT raw text — saves tokens) and the promise body, sends the
    whole batch to Gemini with a structured Pydantic schema, and writes the
    verdict + rationale + provenance back to `promise_print_candidates`.

    Returns counts: {confirmed, candidate, rejected, skipped}.
    """
    client = supabase()

    promise_rows = (
        client.table("promises")
        .select("id, party_code, slug, title, normalized_text")
        .eq("id", promise_id)
        .execute()
        .data
        or []
    )
    if not promise_rows:
        raise ValueError(f"promise {promise_id} not found")
    promise = promise_rows[0]

    cand_rows = (
        client.table("promise_print_candidates")
        .select("print_term, print_number, distance")
        .eq("promise_id", promise_id)
        .eq("model", embed_model)
        .order("distance")
        .limit(top_k)
        .execute()
        .data
        or []
    )
    if not cand_rows:
        logger.warning("no candidates for promise {} — nothing to rerank", promise_id)
        return {"confirmed": 0, "candidate": 0, "rejected": 0, "skipped": 0}

    # Fetch print summaries for every (term, number) pair in the batch.
    by_key: dict[tuple[int, str], dict] = {(c["print_term"], c["print_number"]): c for c in cand_rows}
    terms = sorted({c["print_term"] for c in cand_rows})
    summaries: dict[tuple[int, str], str | None] = {}
    for t in terms:
        nums = [c["print_number"] for c in cand_rows if c["print_term"] == t]
        if not nums:
            continue
        rows = (
            client.table("prints")
            .select("term, number, summary")
            .eq("term", t)
            .in_("number", nums)
            .execute()
            .data
            or []
        )
        for r in rows:
            summaries[(r["term"], r["number"])] = r.get("summary")

    candidates_with_summary: list[dict] = []
    for c in cand_rows:
        key = (c["print_term"], c["print_number"])
        candidates_with_summary.append({
            "print_number": c["print_number"],
            "print_term": c["print_term"],
            "summary": summaries.get(key),
        })

    user_input = _build_rerank_input(promise, candidates_with_summary)
    call = call_structured(
        model=model,
        prompt_name=RERANK_PROMPT_NAME,
        user_input=user_input,
        output_model=PromiseMatchBatch,
    )
    parsed: PromiseMatchBatch = call.parsed  # type: ignore[assignment]

    counts = {"confirmed": 0, "candidate": 0, "rejected": 0, "skipped": 0}
    now_iso = datetime.now(timezone.utc).isoformat()
    seen: set[str] = set()
    for v in parsed.verdicts:
        # Find the matching candidate row to scope the update by full PK.
        match = next(
            (c for c in cand_rows if c["print_number"] == v.print_number),
            None,
        )
        if match is None:
            logger.warning(
                "rerank verdict for unknown print_number {} (promise {}) — skip",
                v.print_number, promise_id,
            )
            counts["skipped"] += 1
            continue
        seen.add(v.print_number)
        (
            client.table("promise_print_candidates")
            .update({
                "match_status": v.status,
                "match_rationale": v.rationale,
                "reranked_at": now_iso,
                "reranked_model": model,
            })
            .eq("promise_id", promise_id)
            .eq("print_term", match["print_term"])
            .eq("print_number", v.print_number)
            .eq("model", embed_model)
            .execute()
        )
        counts[v.status] += 1

    missing = [c["print_number"] for c in cand_rows if c["print_number"] not in seen]
    if missing:
        logger.warning(
            "promise {} rerank: {} candidates not classified by LLM: {}",
            promise_id, len(missing), missing[:5],
        )
        counts["skipped"] += len(missing)

    logger.info(
        "rerank promise {}: confirmed={} candidate={} rejected={} skipped={}",
        promise_id, counts["confirmed"], counts["candidate"],
        counts["rejected"], counts["skipped"],
    )
    return counts


def rerank_all_promises(
    *,
    top_k: int = 20,
    model: str = DEFAULT_LLM_MODEL,
    embed_model: str = DEFAULT_EMBED_MODEL,
    limit: int | None = None,
) -> dict[str, int]:
    """Re-rank every promise that has at least one cosine candidate.

    `limit` caps the number of promises processed (use small values for
    sanity-checking the LLM output before paying tokens for the full set).
    """
    client = supabase()
    # Promises that have at least one candidate row are the only ones worth
    # re-ranking. Pull distinct promise_ids from candidates.
    rows = (
        client.table("promise_print_candidates")
        .select("promise_id")
        .eq("model", embed_model)
        .execute()
        .data
        or []
    )
    promise_ids = sorted({r["promise_id"] for r in rows})
    if limit is not None:
        promise_ids = promise_ids[:limit]

    totals = {"promises": 0, "confirmed": 0, "candidate": 0, "rejected": 0, "skipped": 0}
    for pid in promise_ids:
        try:
            r = rerank_promise_matches(
                promise_id=pid, top_k=top_k, model=model, embed_model=embed_model,
            )
        except Exception as e:  # noqa: BLE001  — log + continue across promises
            logger.error("rerank promise {} failed: {!r}", pid, e)
            continue
        totals["promises"] += 1
        for k in ("confirmed", "candidate", "rejected", "skipped"):
            totals[k] += r.get(k, 0)
    return totals
