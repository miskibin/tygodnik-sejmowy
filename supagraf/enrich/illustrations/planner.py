"""Cheap structured planning with non-negotiable provenance guards."""
from __future__ import annotations

import json
import re

from supagraf.enrich import LLM_MODELS
from supagraf.enrich.llm import call_structured

from .models import Article, Plan

PLANNER_MODEL = LLM_MODELS["flash"]
PLAN_PROMPT = "illustration_plan"
PLAN_PROMPT_VERSION = 1

# The rejected ETPC courtroom concept must never be regenerated as generic decor.
_AUTHENTIC_ONLY = re.compile(
    r"\b(?:ETPC|ECHR|Europejski Trybunał Praw Człowieka|European Court of Human Rights|"
    r"Strasbourg|Trybunał Konstytucyjny|Sąd Najwyższy|Sejm|Senat)\b", re.I
)
_INVENTED_INTERIOR = re.compile(r"\b(?:courtroom|court room|sala sądowa|sądowa|hearing room|interior)\b", re.I)


def article_payload(article: Article) -> str:
    return json.dumps(article.model_dump(), ensure_ascii=False, sort_keys=True)


def requires_authentic(article: Article, plan: Plan) -> bool:
    """Known institutions and an LLM-declared identity require a source photo."""
    return bool(_AUTHENTIC_ONLY.search(" ".join([article.title, plan.required_identity]))) or bool(plan.required_identity.strip())


def guard_plan(article: Article, plan: Plan) -> Plan:
    """Apply deterministic policy after an LLM response; never trust its route alone."""
    if requires_authentic(article, plan):
        match = _AUTHENTIC_ONLY.search(article.title + " " + plan.required_identity)
        identity = plan.required_identity.strip() or (match.group(0) if match else article.title)
        queries = plan.search_queries or [identity]
        return Plan(route="authentic", subject=plan.subject or identity,
                    reason="Exact real identity requires an authenticated source image.",
                    prompt="", search_queries=queries[:2], required_identity=identity)
    if plan.route == "generate" and _INVENTED_INTERIOR.search(plan.prompt + " " + plan.subject):
        return Plan(route="none", subject=plan.subject,
                    reason="Generic courtroom or institutional interiors are not generated.",
                    prompt="", search_queries=[], required_identity="")
    if plan.route == "generate":
        return Plan(route="generate", subject=plan.subject, reason=plan.reason,
                    prompt=plan.prompt.strip(), search_queries=[], required_identity="")
    if plan.route == "authentic":
        return Plan(route="authentic", subject=plan.subject, reason=plan.reason,
                    prompt="", search_queries=plan.search_queries[:2], required_identity=plan.required_identity.strip())
    return Plan(route="none", subject=plan.subject, reason=plan.reason, prompt="", search_queries=[], required_identity="")


def plan_article(article: Article, *, llm=call_structured, model: str = PLANNER_MODEL) -> tuple[Plan, dict]:
    """Return a guarded plan and non-secret call provenance suitable for a manifest."""
    call = llm(model=model, prompt_name=PLAN_PROMPT, prompt_version=PLAN_PROMPT_VERSION,
               user_input=article_payload(article), output_model=Plan, thinking="off", max_tokens=600)
    return guard_plan(article, call.parsed), {
        "model": call.model,
        "prompt_version": call.prompt.version,
        "prompt_sha256": call.prompt.sha256, "usage": call.usage.model_dump(),
    }
