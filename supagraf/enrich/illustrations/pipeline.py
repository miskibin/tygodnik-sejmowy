"""Bounded preview pipeline with content-addressed plan, candidate and review caches."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone
from collections.abc import Callable
from pathlib import Path
from typing import Any

from supagraf.enrich.llm import PROMPTS_DIR

from .models import Article, Candidate, Plan, Review
from .planner import PLAN_PROMPT_VERSION, PLANNER_MODEL, plan_article
from .review import FEEDBACK_POLICY_VERSION, REVIEW_MODEL, REVIEW_PROMPT_VERSION, review_candidate

REPORT_VERSION, MAX_CANDIDATES_PER_ARTICLE = 1, 2
Planner = Callable[[Article], tuple[Plan, dict[str, Any]] | Plan]
Reviewer = Callable[[Article, Plan, Candidate], tuple[Review, dict[str, Any]] | Review]
CandidateFinder = Callable[[Plan, Path], list[Candidate]]


def _digest(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, default=str).encode()).hexdigest()


def _prompt_sha(name: str, version: int) -> str:
    try:
        return hashlib.sha256((PROMPTS_DIR / name / f"v{version}.md").read_bytes()).hexdigest()
    except OSError:
        return "missing"


def _file_sha(path: str) -> str:
    try:
        return hashlib.sha256(Path(path).read_bytes()).hexdigest()
    except OSError:
        return ""


def _load(path: Path) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _unpack(value: tuple[Any, dict] | Any) -> tuple[Any, dict]:
    return value if isinstance(value, tuple) else (value, {})


def _fingerprint(adapter: CandidateFinder | None, supplied: str) -> str:
    return supplied or getattr(adapter, "fingerprint", "adapter-unknown") if adapter else "none"


def _reuse_candidates(entry: dict | None, expires_s: int = 0) -> list[Candidate]:
    """Reuse only well-formed, current manifests whose files match recorded hashes."""
    if not isinstance(entry, dict):
        return []
    try:
        if expires_s and datetime.fromisoformat(entry["created_at"]) < datetime.now(timezone.utc) - timedelta(seconds=expires_s):
            return []
        values = [Candidate.model_validate(value) for value in entry["candidates"]]
        hashes = entry["sha256"]
        return values if values and all(_file_sha(c.local_path) and _file_sha(c.local_path) == hashes.get(c.id) for c in values) else []
    except (KeyError, TypeError, ValueError, OSError):
        return []

def run_pipeline(articles: list[Article], output_dir: Path, generate: bool = False, *,
                 planner: Planner = plan_article, reviewer: Reviewer = review_candidate,
                 authentic_search: CandidateFinder | None = None, generator: CandidateFinder | None = None,
                 generator_fingerprint: str = "", authentic_fingerprint: str = "") -> dict:
    """Write preview-only report/assets. Approval never publishes an image."""
    output_dir.mkdir(parents=True, exist_ok=True)
    assets = output_dir / "assets"; assets.mkdir(exist_ok=True)
    plans_path, candidates_path, reviews_path = (output_dir / "plan-cache.json", output_dir / "candidate-cache.json", output_dir / "review-cache.json")
    plans, candidate_cache, review_cache = _load(plans_path), _load(candidates_path), _load(reviews_path)
    report: dict = {"version": REPORT_VERSION, "mode": "preview", "generate": generate,
                    "publication": "Approved means acceptable for editorial selection; this pipeline never publishes.",
                    "metrics": {"planner_calls": 0, "provider_calls": 0, "review_calls": 0, "candidate_count": 0}, "articles": []}
    for article in articles:
        input_hash = _digest({"article": article.model_dump(), "model": PLANNER_MODEL, "prompt": _prompt_sha("illustration_plan", PLAN_PROMPT_VERSION)})
        cached_plan = plans.get(input_hash)
        try:
            cached_plan_valid = Plan.model_validate(cached_plan["plan"]) if cached_plan else None
        except (KeyError, TypeError, ValueError):
            cached_plan_valid = None
        if cached_plan_valid:
            plan, plan_provenance, plan_hit = cached_plan_valid, cached_plan.get("provenance", {}), True
        else:
            report["metrics"]["planner_calls"] += 1
            try:
                plan, plan_provenance = _unpack(planner(article)); plan = Plan.model_validate(plan)
                plans[input_hash] = {"plan": plan.model_dump(), "provenance": plan_provenance}
            except Exception as exc:
                plan, plan_provenance = Plan(route="none", subject="", reason=f"Planning unavailable: {type(exc).__name__}."), {}
            plan_hit = False
        plan_hash = _digest(plan.model_dump())
        adapter = authentic_search if plan.route == "authentic" else generator if plan.route == "generate" and generate else None
        fp = _fingerprint(adapter, authentic_fingerprint if plan.route == "authentic" else generator_fingerprint)
        candidate_key = _digest({"input": input_hash, "plan": plan_hash, "generate": generate, "adapter": fp})
        candidates = _reuse_candidates(candidate_cache.get(candidate_key), 86400 if plan.route == "authentic" else 0); candidate_error = ""
        candidate_hit = bool(candidates)
        safe_number = hashlib.sha256(article.number.encode()).hexdigest()[:16]
        directory = assets / f"term-{article.term}" / safe_number; directory.mkdir(parents=True, exist_ok=True)
        if adapter and not candidates:
            report["metrics"]["provider_calls"] += 1
            try:
                candidates = [Candidate.model_validate(x) for x in adapter(plan, directory)[:MAX_CANDIDATES_PER_ARTICLE]]
                candidate_cache[candidate_key] = {"candidates": [c.model_dump() for c in candidates], "sha256": {c.id: _file_sha(c.local_path) for c in candidates}, "created_at": datetime.now(timezone.utc).isoformat()}
            except Exception as exc:
                candidate_error = f"{type(exc).__name__}: provider unavailable"; candidates = []
        reviewed = []
        for candidate in candidates:
            image_sha = _file_sha(candidate.local_path)
            review_key = _digest({"plan": plan_hash, "candidate": candidate.model_dump(exclude={"local_path"}), "image_sha256": image_sha,
                                  "model": REVIEW_MODEL, "prompt": _prompt_sha("illustration_review", REVIEW_PROMPT_VERSION), "feedback": {"version": FEEDBACK_POLICY_VERSION, "hashes": sorted(__import__("supagraf.enrich.illustrations.review", fromlist=["REJECTED_SHA256"]).REJECTED_SHA256)}})
            cached_review = review_cache.get(review_key)
            try:
                cached_review_valid = Review.model_validate(cached_review["review"]) if cached_review else None
            except (KeyError, TypeError, ValueError):
                cached_review_valid = None
            if cached_review_valid:
                review, review_provenance, review_hit = cached_review_valid, cached_review.get("provenance", {}), True
            else:
                report["metrics"]["review_calls"] += 1
                try:
                    review, review_provenance = _unpack(reviewer(article, plan, candidate)); review = Review.model_validate(review)
                except Exception as exc:
                    review, review_provenance = Review(status="needs_review", reason=f"Review unavailable: {type(exc).__name__}."), {}
                if review.status != "needs_review" or review_provenance:
                    review_cache[review_key] = {"review": review.model_dump(), "provenance": review_provenance}
                review_hit = False
            reviewed.append({"candidate": candidate.model_dump(), "review": review.model_dump(), "cache_hit": review_hit, "review_provenance": review_provenance})
        selected = next((item["candidate"]["id"] for item in reviewed if item["review"]["status"] == "approved"), "")
        report["metrics"]["candidate_count"] += len(reviewed)
        report["articles"].append({"article": article.model_dump(), "input_hash": input_hash, "cache_hit": plan_hit,
                                   "candidate_cache_hit": candidate_hit, "plan": plan.model_dump(), "plan_provenance": plan_provenance,
                                   "candidate_error": candidate_error, "selected_candidate_id": selected, "candidates": reviewed})
    for path, data in ((plans_path, plans), (candidates_path, candidate_cache), (reviews_path, review_cache)):
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    (output_dir / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report
