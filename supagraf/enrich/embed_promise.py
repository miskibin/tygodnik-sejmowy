"""Enrichment job: promise -> embedding row.

Reads promises.normalized_text, embeds with nomic-embed-text-v2-moe, upserts
into the shared embeddings table with entity_type='promise'. No prompt; the
embed model takes the text directly. Audit-trailed via @with_model_run, so
every embedding has a model_run_id for reproducibility.
"""
from __future__ import annotations

from supagraf.db import supabase
from supagraf.enrich.audit import with_model_run
from supagraf.enrich.embed import (
    DEFAULT_EMBED_MODEL,
    EMBED_DIM,
    EmbedResult,
    embed_and_store,
)

JOB_NAME = "embed_promise"


@with_model_run(
    fn_name=JOB_NAME,
    model=DEFAULT_EMBED_MODEL,
    entity_type_arg="entity_type",
    entity_id_arg="entity_id",
    prompt_version_arg=None,
    prompt_sha256_arg=None,
)
def embed_promise(
    *,
    entity_type: str,           # always 'promise' -- decorator validates
    entity_id: str,             # promises.id as text
    embed_model: str = DEFAULT_EMBED_MODEL,
    model_run_id: int | None = None,
) -> EmbedResult:
    row = (
        supabase()
        .table("promises")
        .select("normalized_text")
        .eq("id", int(entity_id))
        .single()
        .execute()
    )
    text = (row.data or {}).get("normalized_text", "").strip()
    if not text:
        raise ValueError(f"empty normalized_text for promise {entity_id}")

    result = embed_and_store(
        text=text,
        entity_type=entity_type,
        entity_id=entity_id,
        model=embed_model,
    )
    assert len(result.vec) == EMBED_DIM
    return result
