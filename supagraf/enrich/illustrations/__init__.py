"""Reviewed, provenance-first editorial illustration planning.

This package deliberately contains no CLI, search provider or GPU implementation.
Those adapters are injected by the caller so preview runs remain isolated.
"""

from .models import Article, Candidate, Plan, Review
from .pipeline import run_pipeline

__all__ = ["Article", "Candidate", "Plan", "Review", "run_pipeline"]
