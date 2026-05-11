"""Build a frozen mini-corpus fixture for offline quality tests.

Picks 10 diverse prints + 5 of the *easy* queries (rank-of-gold == 1 in
the winning cell) and freezes their pre-computed qwen3 vectors into
`tests/fixtures/embed_eval/mini_corpus.json`.

The unit test (`test_embed_quality.py`) reads this fixture and verifies
that recomputing cosine similarity over the frozen vectors still puts
gold at top-1. No model call, no Ollama — pure linear algebra. Catches
dim/normalisation regressions and silent vector-format changes.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

from scripts.embed_eval.corpus import load_corpus
from scripts.embed_eval.passage_builders import STRATEGIES
from scripts.embed_eval import qwen_backend

FIXTURE_PATH = Path("tests/fixtures/embed_eval/mini_corpus.json")
QUERIES_PATH = Path("tests/fixtures/embed_eval/queries_pl.jsonl")
RESULTS_PATH = Path("scripts/embed_eval/_cache/results.json")

CORPUS_SIZE = 20
QUERY_SIZE = 5
WINNING_BACKEND = "qwen3-embedding:0.6b"
WINNING_STRATEGY = "title_plus_summary"


def main() -> int:
    results = json.loads(RESULTS_PATH.read_text(encoding="utf-8"))
    cell = next(
        c for c in results["cells"]
        if c["backend"] == WINNING_BACKEND and c["strategy"] == WINNING_STRATEGY
    )
    easy = [q for q in cell["per_query"] if q["rank_of_gold"] == 1]
    queries_full = {q["query"]: q for q in (
        json.loads(line)
        for line in QUERIES_PATH.read_text(encoding="utf-8").splitlines()
        if line.strip()
    )}
    picked_q: list[dict] = []
    for q in easy:
        full = queries_full.get(q["query"])
        if not full:
            continue
        picked_q.append(full)
        if len(picked_q) >= QUERY_SIZE:
            break
    if len(picked_q) < QUERY_SIZE:
        raise RuntimeError(f"only {len(picked_q)} easy queries found, need {QUERY_SIZE}")

    rows = load_corpus(term=10, limit=500)
    gold_numbers = {q["expected_print_number"] for q in picked_q}
    by_num = {r.number: r for r in rows}
    # Include the gold prints plus diverse distractors (first N not in gold).
    corpus_rows = [by_num[n] for n in gold_numbers if n in by_num]
    for r in rows:
        if r.number in gold_numbers:
            continue
        corpus_rows.append(r)
        if len(corpus_rows) >= CORPUS_SIZE:
            break

    builder = STRATEGIES[WINNING_STRATEGY]
    passages = [builder(r.as_dict()) for r in corpus_rows]
    pvecs = qwen_backend.encode_passages(passages).vectors
    qvecs = qwen_backend.encode_queries([q["query"] for q in picked_q]).vectors

    fixture = {
        "backend": WINNING_BACKEND,
        "strategy": WINNING_STRATEGY,
        "passages": [
            {"number": r.number, "text": passages[i], "vec": pvecs[i].tolist()}
            for i, r in enumerate(corpus_rows)
        ],
        "queries": [
            {
                "query": q["query"],
                "expected_print_number": q["expected_print_number"],
                "vec": qvecs[i].tolist(),
            }
            for i, q in enumerate(picked_q)
        ],
    }
    FIXTURE_PATH.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE_PATH.write_text(json.dumps(fixture, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {FIXTURE_PATH} ({len(corpus_rows)} passages, {len(picked_q)} queries)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
