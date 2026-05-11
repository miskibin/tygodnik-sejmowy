"""Retrieval metrics for single-relevant-document setup.

Each query has exactly one gold print number (the source from which the
query was paraphrased). Multi-relevant gold can be added later by making
gold a set.
"""
from __future__ import annotations

import math
import random
import statistics
from dataclasses import dataclass


@dataclass(frozen=True)
class QueryResult:
    query: str
    gold_id: str
    ranked_ids: list[str]


def _rank_of_gold(ranked: list[str], gold: str) -> int | None:
    for i, eid in enumerate(ranked):
        if eid == gold:
            return i + 1  # 1-based
    return None


def ndcg_at_k(ranked: list[str], gold: str, k: int) -> float:
    rank = _rank_of_gold(ranked[:k], gold)
    if rank is None:
        return 0.0
    return 1.0 / math.log2(rank + 1)  # ideal DCG=1 (single relevant)


def mrr_at_k(ranked: list[str], gold: str, k: int) -> float:
    rank = _rank_of_gold(ranked[:k], gold)
    return 0.0 if rank is None else 1.0 / rank


def recall_at_k(ranked: list[str], gold: str, k: int) -> float:
    return 1.0 if gold in ranked[:k] else 0.0


def bootstrap_ci(
    scores: list[float],
    *,
    iterations: int = 2000,
    confidence: float = 0.95,
    seed: int = 42,
) -> tuple[float, float]:
    if not scores:
        return (0.0, 0.0)
    rng = random.Random(seed)
    means = []
    n = len(scores)
    for _ in range(iterations):
        sample = [scores[rng.randrange(n)] for _ in range(n)]
        means.append(sum(sample) / n)
    means.sort()
    alpha = (1 - confidence) / 2
    lo = means[int(iterations * alpha)]
    hi = means[int(iterations * (1 - alpha)) - 1]
    return (lo, hi)


@dataclass(frozen=True)
class AggregateScore:
    metric: str
    mean: float
    ci_low: float
    ci_high: float
    n: int


def aggregate(results: list[QueryResult]) -> dict[str, AggregateScore]:
    metrics: dict[str, list[float]] = {
        "ndcg@10": [],
        "mrr@10": [],
        "recall@1": [],
        "recall@5": [],
        "recall@10": [],
    }
    for r in results:
        metrics["ndcg@10"].append(ndcg_at_k(r.ranked_ids, r.gold_id, 10))
        metrics["mrr@10"].append(mrr_at_k(r.ranked_ids, r.gold_id, 10))
        metrics["recall@1"].append(recall_at_k(r.ranked_ids, r.gold_id, 1))
        metrics["recall@5"].append(recall_at_k(r.ranked_ids, r.gold_id, 5))
        metrics["recall@10"].append(recall_at_k(r.ranked_ids, r.gold_id, 10))
    out = {}
    for name, scores in metrics.items():
        mean = statistics.fmean(scores) if scores else 0.0
        lo, hi = bootstrap_ci(scores)
        out[name] = AggregateScore(metric=name, mean=mean, ci_low=lo, ci_high=hi, n=len(scores))
    return out
