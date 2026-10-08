"""Evaluate a frozen, human-reviewed legal retrieval set through the shared API."""
import argparse
import hashlib
import json
import math
import statistics
import time
from pathlib import Path

import httpx

CATEGORIES = {"exact", "colloquial", "exception", "repealed", "future", "unsupported"}


def validate(cases):
    if not 100 <= len(cases) <= 200 or len({c["id"] for c in cases}) != len(cases):
        raise ValueError("Require 100–200 unique cases")
    if not CATEGORIES <= {c["category"] for c in cases}:
        raise ValueError("Missing required legal categories")
    if sum(c["split"] == "holdout" for c in cases) < 30:
        raise ValueError("At least 30 frozen holdout questions are required")
    for case in cases:
        if case.get("review_status") != "human_accepted" or not case.get("reviewer") or not case.get("evidence_urls"):
            raise ValueError("Unreviewed proposals cannot serve as quality evidence")
        if not isinstance(case.get("expected_answerable"), bool) or not isinstance(case.get("expected_units"), dict):
            raise ValueError("Missing reviewed refusal decision or graded exact unit IDs")
        if case["split"] not in {"dev", "holdout"}:
            raise ValueError("Missing frozen split")


def metrics(expected, ids):
    relevant = {key for key, grade in expected.items() if grade > 0}
    recall = len(relevant.intersection(ids)) / len(relevant) if relevant else None
    dcg = sum((2 ** expected.get(key, 0) - 1) / math.log2(i + 2) for i, key in enumerate(ids))
    ideal = sum((2 ** grade - 1) / math.log2(i + 2) for i, grade in enumerate(sorted(expected.values(), reverse=True)[:10]))
    return {"recall_at_10": recall, "ndcg_at_10": dcg / ideal if ideal else None}


def evaluate(dataset, base_url, split, output):
    raw = dataset.read_bytes()
    cases = [json.loads(line) for line in raw.decode().splitlines() if line.strip()]
    validate(cases)
    rows = []
    with httpx.Client(timeout=45) as client:
        for case in (c for c in cases if c["split"] == split):
            started = time.perf_counter()
            response = client.get(base_url.rstrip("/") + "/api/prawo/search", params={"q": case["query"], "date": case["date"],
                                  **({"eli": case["act"]} if case.get("act") else {})})
            response.raise_for_status()
            data = response.json()
            items = data["items"]
            ids = [item["unit_id"] for item in data.get("ranking", [])][:10]
            rows.append({"id": case["id"], "latency_ms": 1000 * (time.perf_counter() - started), **metrics(case["expected_units"], ids),
                         "returned_units": ids, "retrieval": data["retrieval"], "warnings": data["warnings"],
                         "refusal_correct": data["answerable"] == case["expected_answerable"],
                         "version_correct": all(item["version_id"] in case.get("expected_versions", []) for item in items) if items else None,
                         "citation_sources_present": all(item["source_url"] and item["url"] and item["source_sha256"] for item in items)})
    latency = sorted(row["latency_ms"] for row in rows)
    report = {"dataset_sha256": hashlib.sha256(raw).hexdigest(), "base_url": base_url, "split": split, "count": len(rows),
              "p95_ms": latency[math.ceil(.95 * len(latency)) - 1], "rows": rows,
              "metrics": {key: statistics.mean(values) if (values := [r[key] for r in rows if r[key] is not None]) else None
                          for key in ("recall_at_10", "ndcg_at_10", "refusal_correct", "version_correct", "citation_sources_present")},
              "context_completeness": "requires separate reviewed answer-basis judgments; not inferred from ranking",
              "answer_quality": "not measured by this retrieval-only runner"}
    output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("dataset", type=Path)
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--split", choices=["dev", "holdout"], default="dev")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(evaluate(args.dataset, args.base_url, args.split, args.output)["metrics"]))
