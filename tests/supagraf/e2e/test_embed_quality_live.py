"""Live quality regression — hits real Ollama, checks retrieval still works.

Skipped unless `RUN_EMBED_QUALITY=1`. Encodes the mini-corpus queries and
passages with the production embedding backend and asserts top-1 hit rate
>= baseline. The baseline is derived from the frozen fixture (every gold
must be top-1 there) and re-checked against fresh vectors here.

Use this to verify a model upgrade BEFORE re-embedding 200M tokens. If
top-1 hit rate drops, fail and stop the migration.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import numpy as np
import pytest

from supagraf.enrich.embed import DEFAULT_EMBED_MODEL, embed_text

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_EMBED_QUALITY") != "1",
    reason="live quality test against Ollama; set RUN_EMBED_QUALITY=1 to enable",
)

FIXTURE = Path(__file__).resolve().parents[2] / "fixtures" / "embed_eval" / "mini_corpus.json"
# Threshold: 100% top-1 on this hand-picked subset is what the frozen fixture
# represents. Allow one miss in case of network/model nondeterminism.
MIN_TOP1_HIT_RATE = 0.8


def _l2_normalise(vec: list[float]) -> np.ndarray:
    a = np.asarray(vec, dtype=np.float32)
    n = np.linalg.norm(a)
    if n == 0:
        return a
    return a / n


def test_live_backend_matches_frozen_quality():
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    passages = fixture["passages"]
    queries = fixture["queries"]

    p_vecs = np.stack([
        _l2_normalise(embed_text(p["text"], model=DEFAULT_EMBED_MODEL, timeout_s=120))
        for p in passages
    ])
    p_ids = [p["number"] for p in passages]

    hits = 0
    misses: list[tuple[str, str, str]] = []
    for q in queries:
        qvec = _l2_normalise(embed_text(q["query"], model=DEFAULT_EMBED_MODEL, timeout_s=120))
        sims = p_vecs @ qvec
        top1 = p_ids[int(np.argmax(sims))]
        if top1 == q["expected_print_number"]:
            hits += 1
        else:
            misses.append((q["query"], q["expected_print_number"], top1))

    rate = hits / len(queries)
    assert rate >= MIN_TOP1_HIT_RATE, (
        f"top-1 hit rate {rate:.2f} below {MIN_TOP1_HIT_RATE}. "
        f"misses: {misses}. "
        f"If you intentionally changed the embedding model/strategy, "
        f"rebuild the fixture with scripts/embed_eval/build_test_fixture.py "
        f"and update DEFAULT_EMBED_MODEL accordingly."
    )
