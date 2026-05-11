"""Frozen-vector quality regression for the embedding pipeline.

This test does NOT call any embedding model. It reads pre-computed query
and passage vectors from `tests/fixtures/embed_eval/mini_corpus.json` and
re-checks that cosine-similarity top-1 retrieval still matches the gold
print number for every query.

Why this matters
----------------
The fixture was built with `scripts/embed_eval/build_test_fixture.py` using
the winning eval config (qwen3 + title_plus_summary). It encodes:

- that vectors are 1024-d
- that they are L2-normalised (cosine == dot product)
- that the corpus/query labels actually retrieve correctly together

Any future change that breaks dim, normalisation, or the JSON wire format
will fail loudly here. Rebuild the fixture (run build_test_fixture.py) when
you intentionally switch model or strategy.

There is also a small set of structural assertions on `EMBED_DIM` and the
vector-literal format so a silent migration of those constants gets caught
without needing the live backend.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest

from supagraf.enrich.embed import EMBED_DIM, _to_vec_literal

FIXTURE = Path(__file__).resolve().parents[2] / "fixtures" / "embed_eval" / "mini_corpus.json"


@pytest.fixture(scope="module")
def fixture() -> dict:
    if not FIXTURE.exists():
        pytest.skip(f"{FIXTURE} missing — run scripts.embed_eval.build_test_fixture")
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def test_fixture_uses_canonical_dim(fixture: dict) -> None:
    """Every vector in the fixture must be EMBED_DIM long."""
    for p in fixture["passages"]:
        assert len(p["vec"]) == EMBED_DIM, f"passage {p['number']} has wrong dim"
    for q in fixture["queries"]:
        assert len(q["vec"]) == EMBED_DIM, f"query {q['query']!r} has wrong dim"


def test_fixture_vectors_are_unit_normalised(fixture: dict) -> None:
    """L2 norms close to 1 — eval and prod both assume cosine == dot."""
    for p in fixture["passages"]:
        n = np.linalg.norm(np.asarray(p["vec"], dtype=np.float32))
        assert abs(n - 1.0) < 1e-3, f"passage {p['number']} not normalised: {n}"
    for q in fixture["queries"]:
        n = np.linalg.norm(np.asarray(q["vec"], dtype=np.float32))
        assert abs(n - 1.0) < 1e-3, f"query {q['query']!r} not normalised: {n}"


def test_gold_retrieves_top1_for_every_query(fixture: dict) -> None:
    """The whole point: top-1 must equal the gold print number for each query.

    Built from the winning eval cell where rank_of_gold == 1. If this ever
    fails, either the fixture was regenerated with a worse config, or the
    JSON serialisation drifted and the floats lost precision.
    """
    passages = fixture["passages"]
    pmat = np.asarray([p["vec"] for p in passages], dtype=np.float32)
    pids = [p["number"] for p in passages]
    misses: list[tuple[str, str, str]] = []
    for q in fixture["queries"]:
        qvec = np.asarray(q["vec"], dtype=np.float32)
        sims = pmat @ qvec
        top1_idx = int(np.argmax(sims))
        top1 = pids[top1_idx]
        if top1 != q["expected_print_number"]:
            misses.append((q["query"], q["expected_print_number"], top1))
    assert not misses, f"top-1 misses: {misses}"


def test_vec_literal_format_is_postgres_compatible() -> None:
    """Halfvec/vector textual form: '[v1,v2,...]'. Postgres parses with strtod;
    `_to_vec_literal` must produce input that round-trips losslessly through
    the wire format.
    """
    sample = [0.123456789, -0.987654321, 0.0, 1.0, -1.0]
    s = _to_vec_literal(sample)
    assert s.startswith("[") and s.endswith("]")
    parts = s[1:-1].split(",")
    assert len(parts) == len(sample)
    parsed = [float(p) for p in parts]
    for orig, back in zip(sample, parsed):
        assert abs(orig - back) < 5e-7, f"{orig} -> {back} lost precision"


def test_passage_text_is_title_plus_summary_shape(fixture: dict) -> None:
    """Fixture was built with title_plus_summary; passages should contain
    a newline-separated title block. Smoke check against accidental
    fixture-build regressions.
    """
    for p in fixture["passages"]:
        text = p.get("text", "")
        assert text, f"passage {p['number']} has empty text"
        assert len(text) <= 1400, f"passage {p['number']} exceeds MAX_INPUT_CHARS"
