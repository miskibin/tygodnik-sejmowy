"""sentence-transformers wrapper for sdadas/mmlw-retrieval-roberta-large-v2.

Eval-only. 1024-d native. Polish-specialised. Recommended prefixes per
model card:
- queries: `[query]: <text>`
- passages: no prefix

fp16 + CUDA if available, else fp32 CPU. CPU is acceptable for eval scale
(~500 passages + 30 queries ≈ 530 encodes, RoBERTa-large ~0.3 s/passage CPU
at batch 8 -> ~3 min full corpus).
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from typing import Iterable

import numpy as np

MODEL_NAME = "sdadas/mmlw-retrieval-roberta-large-v2"
QUERY_PREFIX = "[query]: "
DEFAULT_BATCH_SIZE = int(os.environ.get("MMLW_BATCH_SIZE", "8"))


@dataclass(frozen=True)
class EmbeddingResult:
    vectors: np.ndarray  # shape (N, dim), float32, L2-normalised
    model: str
    dim: int


@lru_cache(maxsize=1)
def _load_model():
    # Lazy import — keeps import cost out of the way for non-eval code.
    from sentence_transformers import SentenceTransformer
    import torch

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = SentenceTransformer(MODEL_NAME, device=device)
    if device == "cuda":
        model = model.half()
    return model


def encode_queries(texts: Iterable[str], batch_size: int = DEFAULT_BATCH_SIZE) -> EmbeddingResult:
    model = _load_model()
    prefixed = [QUERY_PREFIX + t for t in texts]
    vecs = model.encode(
        prefixed,
        batch_size=batch_size,
        normalize_embeddings=True,
        convert_to_numpy=True,
        show_progress_bar=False,
    ).astype(np.float32)
    return EmbeddingResult(vectors=vecs, model=MODEL_NAME, dim=vecs.shape[1])


def encode_passages(texts: Iterable[str], batch_size: int = DEFAULT_BATCH_SIZE) -> EmbeddingResult:
    model = _load_model()
    vecs = model.encode(
        list(texts),
        batch_size=batch_size,
        normalize_embeddings=True,
        convert_to_numpy=True,
        show_progress_bar=False,
    ).astype(np.float32)
    return EmbeddingResult(vectors=vecs, model=MODEL_NAME, dim=vecs.shape[1])
