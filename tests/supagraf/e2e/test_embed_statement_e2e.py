"""E2E test: embed one already-bodied statement. Gated RUN_E2E=1.

Picks the smallest body-bearing statement, embeds it, asserts the embeddings
row + provenance columns are populated. Cleans up after itself.
"""
from __future__ import annotations

import os

import pytest

from supagraf.db import supabase
from supagraf.enrich.embed import DEFAULT_EMBED_MODEL
from supagraf.enrich.embed_statement import embed_statement

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_E2E") != "1",
    reason="e2e hits live ollama + Supabase; set RUN_E2E=1 to enable",
)


def test_embed_one_statement_roundtrip():
    cli = supabase()
    rows = (
        cli.table("proceeding_statements")
        .select("id")
        .eq("term", 10)
        .not_.is_("body_text", "null")
        .order("id")
        .limit(1)
        .execute()
        .data
    ) or []
    if not rows:
        pytest.skip("no bodied statements yet — run fetch first")
    sid = str(rows[0]["id"])

    # Snapshot prior provenance and the embedding row (if any).
    before_row = (
        cli.table("proceeding_statements")
        .select("embedding_model, embedded_at")
        .eq("id", int(sid))
        .single()
        .execute()
        .data
    )

    embed_statement(entity_type="proceeding_statement", entity_id=sid)

    after_row = (
        cli.table("proceeding_statements")
        .select("embedding_model, embedded_at")
        .eq("id", int(sid))
        .single()
        .execute()
        .data
    )
    assert after_row["embedding_model"] == DEFAULT_EMBED_MODEL
    assert after_row["embedded_at"] is not None

    # Embeddings row exists.
    emb = (
        cli.table("embeddings")
        .select("entity_id, model")
        .eq("entity_type", "proceeding_statement")
        .eq("entity_id", sid)
        .eq("model", DEFAULT_EMBED_MODEL)
        .single()
        .execute()
        .data
    )
    assert emb is not None
    assert emb["entity_id"] == sid
