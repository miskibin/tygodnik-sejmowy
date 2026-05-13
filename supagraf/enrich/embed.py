"""Ollama embeddings client + DB upsert.

nomic-embed-text-v2-moe -> halfvec(1024). Wrong-dim responses are fatal
(no silent truncation/padding). Idempotent upsert on (entity_type,
entity_id, model). Same retry policy as llm.py: 5xx + timeouts retried,
4xx and dim mismatches raise immediately.
"""
from __future__ import annotations

import os
from dataclasses import dataclass

import httpx
from postgrest.exceptions import APIError
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from supagraf.db import supabase

EMBED_DIM = 1024
# qwen3-embedding:0.6b is natively 1024-d so no padding needed (vs the
# previous nomic-embed-text-v2-moe which was 768-d zero-padded). Better
# multilingual quality on Polish per Qwen3 multilingual benchmarks.
DEFAULT_EMBED_MODEL = "qwen3-embedding:0.6b"
DEFAULT_TIMEOUT_S = 30.0

# Single source of truth for allowed entity_type values. Mirrors the SQL
# CHECK constraint in 0012_embeddings.sql (extended in 0028_promise_matcher.sql).
# Bump in lockstep when extending.
ALLOWED_ENTITY_TYPES = frozenset(
    {
        "print",
        "print_attachment",
        "act",
        "mp_bio",
        "process",
        "promise",
        "proceeding_statement",
        "voting",
    }
)


class EmbedHTTPError(Exception):
    """5xx / network — retried."""


class EmbedResponseError(Exception):
    """4xx / malformed / wrong-dim — not retried."""


@dataclass(frozen=True)
class EmbedResult:
    entity_type: str
    entity_id: str
    model: str
    vec: list[float]


def _ollama_url() -> str:
    # Accept both OLLAMA_BASE_URL (this project's historical name) and
    # OLLAMA_HOST (the var Ollama's own CLI/SDK uses by convention). The VM
    # compose was setting OLLAMA_HOST and producing silent ConnectionRefused
    # against localhost:11434 inside the container; supporting both makes
    # that misconfig non-fatal.
    return (
        os.environ.get("OLLAMA_BASE_URL")
        or os.environ.get("OLLAMA_HOST")
        or "http://localhost:11434"
    ).rstrip("/")


@retry(
    retry=retry_if_exception_type((EmbedHTTPError, httpx.TimeoutException)),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    reraise=True,
)
def _post_embed(payload: dict, timeout: float) -> dict:
    url = f"{_ollama_url()}/api/embeddings"
    try:
        r = httpx.post(url, json=payload, timeout=timeout)
    except httpx.TimeoutException:
        raise
    except httpx.HTTPError as e:
        raise EmbedHTTPError(f"transport: {e!r}") from e
    if 500 <= r.status_code < 600:
        raise EmbedHTTPError(f"ollama {r.status_code}: {r.text[:300]}")
    if r.status_code >= 400:
        raise EmbedResponseError(f"ollama {r.status_code}: {r.text[:300]}")
    return r.json()


def embed_text(
    text: str,
    *,
    model: str = DEFAULT_EMBED_MODEL,
    timeout_s: float = DEFAULT_TIMEOUT_S,
) -> list[float]:
    """Return raw embedding vector. Raises EmbedResponseError on dim mismatch.

    Default ``qwen3-embedding:0.6b`` is natively 1024-d so no padding needed.
    Legacy ``nomic-embed-text-v2-moe`` is 768-d Matryoshka — zero-padded to
    EMBED_DIM. Cosine similarity over the padded space equals cosine over the
    native space (zeros contribute nothing to dot product or L2 norm).
    Vectors longer than EMBED_DIM raise (no silent truncation).
    """
    payload = {"model": model, "prompt": text}
    response = _post_embed(payload, timeout_s)
    vec = response.get("embedding")
    if not isinstance(vec, list) or not all(
        isinstance(x, (int, float)) and not isinstance(x, bool) for x in vec
    ):
        raise EmbedResponseError(f"missing/invalid 'embedding' field: {response!r}")
    if len(vec) > EMBED_DIM:
        raise EmbedResponseError(
            f"expected dim <= {EMBED_DIM}, got {len(vec)} for model {model}"
        )
    out = [float(x) for x in vec]
    if len(out) < EMBED_DIM:
        out.extend([0.0] * (EMBED_DIM - len(out)))
    return out


@retry(
    retry=retry_if_exception_type(APIError),
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    reraise=True,
)
def upsert_embedding(
    *,
    entity_type: str,
    entity_id: str,
    vec: list[float],
    model: str = DEFAULT_EMBED_MODEL,
) -> None:
    """Upsert one embedding row. Validates entity_type + dim before hitting DB."""
    if entity_type not in ALLOWED_ENTITY_TYPES:
        raise EmbedResponseError(
            f"unknown entity_type {entity_type!r}; allowed: {sorted(ALLOWED_ENTITY_TYPES)}"
        )
    if len(vec) != EMBED_DIM:
        raise EmbedResponseError(f"expected dim {EMBED_DIM}, got {len(vec)}")
    supabase().table("embeddings").upsert(
        {
            "entity_type": entity_type,
            "entity_id": entity_id,
            "model": model,
            # halfvec accepts pgvector textual repr like "[0.1, 0.2, ...]".
            "vec": _to_vec_literal(vec),
        },
        on_conflict="entity_type,entity_id,model",
    ).execute()


def _to_vec_literal(vec: list[float]) -> str:
    # Postgres halfvec/vector textual format: '[v1,v2,...]'
    return "[" + ",".join(f"{v:.6f}" for v in vec) + "]"


def embed_and_store(
    *,
    text: str,
    entity_type: str,
    entity_id: str,
    model: str = DEFAULT_EMBED_MODEL,
    timeout_s: float = DEFAULT_TIMEOUT_S,
) -> EmbedResult:
    """One-shot: embed -> upsert. Pre-validates entity_type so a bad type
    fails before the network call."""
    if entity_type not in ALLOWED_ENTITY_TYPES:
        raise EmbedResponseError(
            f"unknown entity_type {entity_type!r}; allowed: {sorted(ALLOWED_ENTITY_TYPES)}"
        )
    vec = embed_text(text, model=model, timeout_s=timeout_s)
    upsert_embedding(entity_type=entity_type, entity_id=entity_id, vec=vec, model=model)
    return EmbedResult(
        entity_type=entity_type, entity_id=entity_id, model=model, vec=vec
    )


def top_k_similar(
    *,
    query_vec: list[float],
    entity_type: str,
    model: str = DEFAULT_EMBED_MODEL,
    k: int = 10,
) -> list[dict]:
    """Cosine-similarity top-k over the HNSW index. Returns rows w/ entity_id + distance."""
    if entity_type not in ALLOWED_ENTITY_TYPES:
        raise EmbedResponseError(f"unknown entity_type {entity_type!r}")
    if len(query_vec) != EMBED_DIM:
        raise EmbedResponseError(f"expected dim {EMBED_DIM}, got {len(query_vec)}")
    r = (
        supabase()
        .rpc(
            "embeddings_top_k",
            {
                "p_entity_type": entity_type,
                "p_model": model,
                "p_query": _to_vec_literal(query_vec),
                "p_k": k,
            },
        )
        .execute()
    )
    return list(r.data or [])
