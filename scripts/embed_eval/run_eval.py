"""Eval orchestrator: model × passage-strategy grid → metrics + report.

Run:
    .venv/Scripts/python.exe -m scripts.embed_eval.run_eval

Env knobs:
    EMBED_EVAL_SKIP_QWEN=1   skip qwen3 backend (e.g. ollama down)
    EMBED_EVAL_SKIP_MMLW=1   skip mmlw backend (e.g. install broken)
    EMBED_EVAL_CORPUS_LIMIT  default 500 prints

Outputs:
    docs/embedding_eval_<YYYY-MM-DD>.md
    scripts/embed_eval/_cache/results.json
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import pickle
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from loguru import logger

from scripts.embed_eval.corpus import PrintRow, load_corpus
from scripts.embed_eval.metrics import QueryResult, aggregate
from scripts.embed_eval.passage_builders import STRATEGIES

CACHE_DIR = Path("scripts/embed_eval/_cache")
QUERIES_PATH = Path("tests/fixtures/embed_eval/queries_pl.jsonl")
RESULTS_PATH = CACHE_DIR / "results.json"


@dataclass(frozen=True)
class BackendSpec:
    name: str
    encode_queries: callable  # type: ignore[type-arg]
    encode_passages: callable  # type: ignore[type-arg]


def _backends() -> list[BackendSpec]:
    out: list[BackendSpec] = []
    if not os.environ.get("EMBED_EVAL_SKIP_QWEN"):
        from scripts.embed_eval import qwen_backend
        out.append(BackendSpec(
            name=qwen_backend.MODEL_NAME,
            encode_queries=qwen_backend.encode_queries,
            encode_passages=qwen_backend.encode_passages,
        ))
    if not os.environ.get("EMBED_EVAL_SKIP_MMLW"):
        from scripts.embed_eval import mmlw_backend
        out.append(BackendSpec(
            name=mmlw_backend.MODEL_NAME,
            encode_queries=mmlw_backend.encode_queries,
            encode_passages=mmlw_backend.encode_passages,
        ))
    return out


def _load_queries() -> list[dict]:
    if not QUERIES_PATH.exists():
        raise FileNotFoundError(
            f"{QUERIES_PATH} missing — run `python -m scripts.embed_eval.mine_queries` first"
        )
    items: list[dict] = []
    for line in QUERIES_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        items.append(json.loads(line))
    if not items:
        raise RuntimeError(f"{QUERIES_PATH} is empty")
    return items


def _passage_hash(rows: list[PrintRow], strategy: str) -> str:
    builder = STRATEGIES[strategy]
    h = hashlib.sha256()
    h.update(strategy.encode())
    for r in rows:
        h.update(r.number.encode())
        h.update(builder(r.as_dict()).encode("utf-8"))
    return h.hexdigest()[:16]


def _cache_path(model: str, strategy: str, corpus_hash: str) -> Path:
    safe_model = model.replace("/", "__").replace(":", "_")
    return CACHE_DIR / f"vecs__{safe_model}__{strategy}__{corpus_hash}.pkl"


def _embed_corpus(
    backend: BackendSpec, rows: list[PrintRow], strategy: str
) -> tuple[np.ndarray, list[str]]:
    builder = STRATEGIES[strategy]
    corpus_hash = _passage_hash(rows, strategy)
    cache = _cache_path(backend.name, strategy, corpus_hash)
    if cache.exists():
        with cache.open("rb") as fh:
            data = pickle.load(fh)
        logger.info(f"cache hit: {cache.name} ({len(data['ids'])} vecs)")
        return data["vecs"], data["ids"]
    texts = [builder(r.as_dict()) for r in rows]
    ids = [r.number for r in rows]
    logger.info(f"encoding {len(texts)} passages with {backend.name} / {strategy}")
    t = time.time()
    res = backend.encode_passages(texts)
    elapsed = time.time() - t
    logger.info(f"  done in {elapsed:.1f}s ({len(texts)/max(elapsed,1e-3):.1f} passages/s)")
    cache.parent.mkdir(parents=True, exist_ok=True)
    with cache.open("wb") as fh:
        pickle.dump({"vecs": res.vectors, "ids": ids, "elapsed_s": elapsed}, fh)
    return res.vectors, ids


def _embed_queries(backend: BackendSpec, queries: list[str]) -> np.ndarray:
    logger.info(f"encoding {len(queries)} queries with {backend.name}")
    t = time.time()
    res = backend.encode_queries(queries)
    logger.info(f"  done in {time.time()-t:.1f}s")
    return res.vectors


def _rank_topk(query_vecs: np.ndarray, passage_vecs: np.ndarray, ids: list[str], k: int = 50) -> list[list[str]]:
    # cosine == dot (both sides L2-normalised)
    sims = query_vecs @ passage_vecs.T  # (Q, P)
    out: list[list[str]] = []
    k_eff = min(k, sims.shape[1])
    for row in sims:
        top_idx = np.argpartition(-row, k_eff - 1)[:k_eff]
        top_idx = top_idx[np.argsort(-row[top_idx])]
        out.append([ids[i] for i in top_idx])
    return out


@dataclass(frozen=True)
class CellResult:
    backend: str
    strategy: str
    n_queries: int
    n_passages: int
    encode_passages_s: float
    encode_queries_s: float
    metrics: dict[str, dict[str, float]]
    per_query: list[dict]


def run_eval(corpus_limit: int = 500, term: int = 10) -> dict:
    rows = load_corpus(term=term, limit=corpus_limit)
    queries = _load_queries()
    # Filter queries to those whose gold is in the corpus (defensive — should
    # always be true since mining samples from the corpus).
    corpus_ids = {r.number for r in rows}
    queries = [q for q in queries if q["expected_print_number"] in corpus_ids]
    if not queries:
        raise RuntimeError("no queries whose gold print is in the corpus")
    logger.info(f"running eval over {len(queries)} queries × {len(rows)} passages")

    backends = _backends()
    if not backends:
        raise RuntimeError("no backends enabled — both QWEN and MMLW are skipped")

    cells: list[CellResult] = []
    for backend in backends:
        q_texts = [q["query"] for q in queries]
        t = time.time()
        qvecs = _embed_queries(backend, q_texts)
        q_elapsed = time.time() - t
        for strategy in STRATEGIES.keys():
            t = time.time()
            pvecs, pids = _embed_corpus(backend, rows, strategy)
            p_elapsed = time.time() - t
            ranked = _rank_topk(qvecs, pvecs, pids, k=50)
            results = [
                QueryResult(query=q["query"], gold_id=q["expected_print_number"], ranked_ids=r)
                for q, r in zip(queries, ranked)
            ]
            agg = aggregate(results)
            per_query = [
                {
                    "query": q["query"],
                    "gold": q["expected_print_number"],
                    "top1": r[0] if r else None,
                    "rank_of_gold": (r.index(q["expected_print_number"]) + 1)
                    if q["expected_print_number"] in r
                    else None,
                }
                for q, r in zip(queries, ranked)
            ]
            cell = CellResult(
                backend=backend.name,
                strategy=strategy,
                n_queries=len(queries),
                n_passages=len(rows),
                encode_passages_s=p_elapsed,
                encode_queries_s=q_elapsed,
                metrics={
                    m: {"mean": s.mean, "ci_low": s.ci_low, "ci_high": s.ci_high}
                    for m, s in agg.items()
                },
                per_query=per_query,
            )
            cells.append(cell)
            ndcg = agg["ndcg@10"].mean
            recall1 = agg["recall@1"].mean
            logger.success(
                f"  {backend.name} / {strategy}: nDCG@10={ndcg:.3f} R@1={recall1:.3f}"
            )

    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "term": term,
        "corpus_size": len(rows),
        "n_queries": len(queries),
        "cells": [
            {
                "backend": c.backend,
                "strategy": c.strategy,
                "n_queries": c.n_queries,
                "n_passages": c.n_passages,
                "encode_passages_s": c.encode_passages_s,
                "encode_queries_s": c.encode_queries_s,
                "metrics": c.metrics,
                "per_query": c.per_query,
            }
            for c in cells
        ],
    }
    RESULTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    RESULTS_PATH.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    logger.success(f"wrote raw results to {RESULTS_PATH}")
    return summary


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--corpus-limit", type=int, default=int(os.environ.get("EMBED_EVAL_CORPUS_LIMIT", 500)))
    p.add_argument("--term", type=int, default=10)
    args = p.parse_args()
    run_eval(corpus_limit=args.corpus_limit, term=args.term)
    return 0


if __name__ == "__main__":
    sys.exit(main())
