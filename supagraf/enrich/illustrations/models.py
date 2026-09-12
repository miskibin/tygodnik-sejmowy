"""Stable data contracts for the editorial illustration pipeline."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Article(BaseModel):
    term: int = Field(default=10, ge=1)
    number: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=2000)
    summary: str = Field(default="", max_length=8000)


class Plan(BaseModel):
    route: Literal["generate", "authentic", "none"]
    subject: str
    reason: str
    prompt: str = ""
    search_queries: list[str] = Field(default_factory=list)
    required_identity: str = ""


class Candidate(BaseModel):
    id: str
    provider: str
    local_path: str
    source_url: str = ""
    author: str = ""
    license: str = ""
    license_url: str = ""
    caption: str = ""
    identity: str = ""
    metadata: dict = Field(default_factory=dict)


class Review(BaseModel):
    """A conservative visual and provenance decision, never a quality score."""

    status: Literal["approved", "needs_review", "rejected"] = "needs_review"
    reason: str = ""
    semantic_relevance: bool = False
    physical_geometry_ok: bool = False
    has_people_or_faces: bool = False
    has_text_or_logos: bool = False
    has_synthetic_artifacts: bool = False
    identity_supported: bool = False

class VisionReview(BaseModel):
    """Strict wire schema; prevents default values masking malformed LLM JSON."""
    model_config = ConfigDict(extra="forbid")
    status: Literal["approved", "needs_review", "rejected"]
    reason: str
    semantic_relevance: bool
    physical_geometry_ok: bool
    has_people_or_faces: bool
    has_text_or_logos: bool
    has_synthetic_artifacts: bool
    identity_supported: bool