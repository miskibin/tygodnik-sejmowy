"""Qwen3 embedding via Ollama, eval-only wrapper.

Wraps the existing production embed_text() so the eval uses the exact same
code path as the live pipeline. Pre-normalises vectors to unit length so
cosine == dot-product (matches sentence-transformers' `normalize_embeddings`
default in mmlw_backend).
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Iterable

import numpy as np

from supagraf.enrich.embed import embed_text

MODEL_NAME = os.environ.get("EMBED_EVAL_QWEN_MODEL", "qwen3-embedding:0.6b")
TIMEOUT_S = float(os.environ.get("EMBED_EVAL_QWEN_TIMEOUT_S", "120"))
_WARMED = False


def _warmup() -> None:
    """First call after Ollama loads the model can take 30+ s on CPU.

    Run a single dummy embed with a generous timeout so subsequent batch
    calls hit the hot model and respect the normal per-request timeout.
    """
    global _WARMED
    if _WARMED:
        return
    embed_text("rozgrzewka", model=MODEL_NAME, timeout_s=TIMEOUT_S)
    _WARMED = True


@dataclass(frozen=True)
class EmbeddingResult:
    vectors: np.ndarray
    model: str
    dim: int


def _l2_normalise(mat: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(mat, axis=1, keepdims=True)
    norms[norms == 0.0] = 1.0
    return mat / norms


def _encode_batch(texts: Iterable[str]) -> np.ndarray:
    _warmup()
    rows = [embed_text(t, model=MODEL_NAME, timeout_s=TIMEOUT_S) for t in texts]
    arr = np.asarray(rows, dtype=np.float32)
    return _l2_normalise(arr)


def encode_queries(texts: Iterable[str], batch_size: int | None = None) -> EmbeddingResult:
    del batch_size  # Ollama serialises calls; batching has no effect.
    vecs = _encode_batch(texts)
    return EmbeddingResult(vectors=vecs, model=MODEL_NAME, dim=vecs.shape[1])


def encode_passages(texts: Iterable[str], batch_size: int | None = None) -> EmbeddingResult:
    del batch_size
    vecs = _encode_batch(texts)
    return EmbeddingResult(vectors=vecs, model=MODEL_NAME, dim=vecs.shape[1])
