"""Enrichment job: print -> embedding row + provenance stamp.

Embeds `title + summary` (newline-separated). The 2026-05-12 embedding eval
(docs/embedding_eval_2026-05-12.md) showed `title_plus_summary` beats
`summary_only` by +0.051 nDCG@10 absolute (0.940 vs 0.889) with the
production qwen3-embedding:0.6b model — title carries strong topical
signal that pure summaries dilute.

Pre-condition: print_summary must have run first. Pending discriminator
on the CLI side filters `summary IS NOT NULL AND embedded_at IS NULL`.

Wraps B3 (embed_and_store) + B5 (with_model_run audit). Stamps
prints.embedding_model + embedded_at so callers can filter "embedded vs
not" without joining embeddings.
"""
from __future__ import annotations

from datetime import datetime, timezone

from supagraf.db import supabase
from supagraf.enrich.audit import with_model_run
from supagraf.enrich.embed import (
    DEFAULT_EMBED_MODEL,
    EMBED_DIM,
    EmbedResult,
    embed_and_store,
)

JOB_NAME = "embed_print"
# nomic-embed-text-v2-moe has n_ctx_train=512 in its GGUF. Polish ~3 chars/token,
# so 1400 chars stays under the cap with margin. Summaries are ~400-800 chars
# typically, but the truncation guard remains for safety.
MAX_INPUT_CHARS = 1400


@with_model_run(
    fn_name=JOB_NAME,
    model=DEFAULT_EMBED_MODEL,
    entity_type_arg="entity_type",
    entity_id_arg="entity_id",
    prompt_version_arg=None,
    prompt_sha256_arg=None,
)
def embed_print(
    *,
    entity_type: str,           # always 'print' - decorator validates
    entity_id: str,             # prints.number
    embed_model: str = DEFAULT_EMBED_MODEL,
    model_run_id: int | None = None,
) -> EmbedResult:
    row = (
        supabase()
        .table("prints")
        .select("number, title, summary")
        .eq("number", entity_id)
        .single()
        .execute()
        .data
    )
    summary = (row or {}).get("summary")
    if not summary or not summary.strip():
        # Caller filters on summary IS NOT NULL — if we still see empty, fail
        # loudly so the audit row records the inconsistency.
        raise ValueError(
            f"print {entity_id} has no summary — run summary enricher first"
        )
    title = ((row or {}).get("title") or "").strip()
    body = summary.strip()
    text = (f"{title}\n\n{body}" if title else body)[:MAX_INPUT_CHARS]

    result = embed_and_store(
        text=text,
        entity_type=entity_type,
        entity_id=entity_id,
        model=embed_model,
    )
    assert len(result.vec) == EMBED_DIM

    supabase().table("prints").update({
        "embedding_model": embed_model,
        "embedded_at": datetime.now(timezone.utc).isoformat(),
    }).eq("number", entity_id).execute()

    return result
