"""Fail-closed image review using the existing DeepSeek structured vision call."""
from __future__ import annotations

import json
import re
import hashlib
import unicodedata
from io import BytesIO

from PIL import Image
from pathlib import Path

from supagraf.enrich import LLM_MODELS
from supagraf.enrich.llm import call_structured

from .models import Article, Candidate, Plan, Review, VisionReview

REVIEW_MODEL = LLM_MODELS["vision"]
REVIEW_PROMPT = "illustration_review"
REVIEW_PROMPT_VERSION = 4
FEEDBACK_POLICY_VERSION = "2026-09-12-courtroom-rejection-v1"
# Human editorial feedback: exact rejected trial bytes are permanently excluded.
REJECTED_SHA256 = {
    "4edd75f9d6d41a13c9537876d019f336f562bdadae6ffc73933d3d1ee5285592",
    "14f1e01b8bde723099391617a8067c10d69583860bab1f1e17e7d1326a11bc08",
}


def _tokens(value: str) -> tuple[str, ...]:
    folded = unicodedata.normalize("NFKD", value.casefold()).encode("ascii", "ignore").decode()
    return tuple(re.findall(r"[a-z0-9]+", folded))


def _contains(tokens: tuple[str, ...], phrase: tuple[str, ...]) -> bool:
    return any(tokens[i:i + len(phrase)] == phrase for i in range(len(tokens) - len(phrase) + 1))


def identity_matches(plan: Plan, candidate: Candidate) -> bool:
    if not plan.required_identity:
        return True
    expected = _tokens(plan.required_identity)
    observed = _tokens(" ".join(str(x) for x in (candidate.identity, candidate.metadata.get("identity", ""), candidate.metadata.get("source_identity", ""), candidate.metadata.get("source_title", ""))))
    aliases = (("etpc",), ("echr",), ("european", "court", "of", "human", "rights"), ("cour", "europeenne", "des", "droits", "de", "l", "homme"))
    if any(_contains(expected, alias) for alias in aliases):
        return any(_contains(observed, alias) for alias in aliases)
    return bool(expected and _contains(observed, expected))


def has_authenticated_source(candidate: Candidate) -> bool:
    return (candidate.provider in {"wikimedia_commons", "pixabay"} and bool(candidate.source_url) and bool(candidate.author) and bool(candidate.license) and bool(candidate.license_url) and bool(candidate.metadata.get("source_title") or candidate.metadata.get("source_identity") or candidate.metadata.get("source_tags")))


def _review_images(image_bytes: bytes) -> list[bytes]:
    """Full frame plus four detail crops; analysis only, never changes the asset."""
    with Image.open(BytesIO(image_bytes)) as source:
        image = source.convert("RGB")
        width, height = image.size
        frames = [image]
        for top in (0, height // 2):
            for left in (0, width // 2):
                frames.append(image.crop((left, top, left + width // 2, top + height // 2)))
        result: list[bytes] = []
        for frame in frames:
            frame.thumbnail((2048, 2048))
            buffer = BytesIO(); frame.save(buffer, format="JPEG", quality=88, optimize=True)
            result.append(buffer.getvalue())
        return result

def _review_input(article: Article, plan: Plan, candidate: Candidate) -> str:
    return json.dumps({"article": article.model_dump(), "plan": plan.model_dump(),
                       "candidate": candidate.model_dump(exclude={"local_path"})}, ensure_ascii=False)


def review_candidate(article: Article, plan: Plan, candidate: Candidate, *, llm=call_structured,
                     model: str = REVIEW_MODEL) -> tuple[Review, dict]:
    """Review one candidate. Any unreadable image or LLM failure is needs_review."""
    if plan.route == "authentic" and (not has_authenticated_source(candidate) or not identity_matches(plan, candidate) or (plan.required_identity and not (candidate.metadata.get("source_title") or candidate.metadata.get("source_identity")))):
        return Review(status="rejected", reason="Authenticated source metadata does not match required identity."), {}
    path = Path(candidate.local_path)
    if not path.is_file():
        return Review(status="needs_review", reason="Candidate image is unavailable for visual review."), {}
    image_bytes = path.read_bytes()
    image_sha256 = hashlib.sha256(image_bytes).hexdigest()
    if image_sha256 in REJECTED_SHA256:
        return Review(status="rejected", reason="Rejected by durable editorial feedback policy."), {
            "feedback_policy_version": FEEDBACK_POLICY_VERSION, "image_sha256": image_sha256,
        }
    try:
        call = llm(model=model, prompt_name=REVIEW_PROMPT, prompt_version=REVIEW_PROMPT_VERSION,
                   user_input=_review_input(article, plan, candidate), output_model=VisionReview,
                   images=_review_images(image_bytes), thinking="off", max_tokens=800)
    except Exception as exc:  # Review failures must never silently approve a candidate.
        return Review(status="needs_review", reason=f"Vision review unavailable: {type(exc).__name__}."), {}
    review = Review.model_validate(call.parsed.model_dump())
    approved = (review.status == "approved" and review.semantic_relevance and review.physical_geometry_ok and not review.has_people_or_faces
                and not review.has_text_or_logos and not review.has_synthetic_artifacts
                and (plan.route != "authentic" or review.identity_supported))
    if review.status == "rejected" or review.has_people_or_faces or review.has_text_or_logos or review.has_synthetic_artifacts:
        review.status = "rejected"
    elif approved:
        review.status = "approved"
    else:
        review.status = "needs_review"
    if not review.reason:
        review.reason = "All required checks passed." if approved else "One or more required checks did not pass."
    return review, {"model": call.model, "prompt_version": call.prompt.version, "prompt_sha256": call.prompt.sha256, "feedback_policy_version": FEEDBACK_POLICY_VERSION, "image_sha256": image_sha256, "usage": call.usage.model_dump(), "raw_response_sha256": hashlib.sha256(getattr(call, "raw_response", "").encode()).hexdigest()}
