"""Pydantic edge cases for Promise."""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from supagraf.schema.promises import Promise


_BASE = {
    "slug": "demo-promise",
    "party_code": "KO",
    "title": "Demo title",
    "normalized_text": "Demo text",
    "source_year": 2023,
    "source_url": "https://example.org/",
    "status": "in_progress",
}


def test_round_trip():
    p = Promise.model_validate(_BASE)
    assert p.party_code == "KO"
    assert p.confidence is None


def test_extra_rejected():
    with pytest.raises(ValidationError):
        Promise.model_validate({**_BASE, "junk": 1})


def test_status_enum_enforced():
    with pytest.raises(ValidationError):
        Promise.model_validate({**_BASE, "status": "invented"})


def test_slug_must_be_lowercase_kebab():
    with pytest.raises(ValidationError):
        Promise.model_validate({**_BASE, "slug": "Demo_Promise"})


def test_confidence_bounds():
    with pytest.raises(ValidationError):
        Promise.model_validate({**_BASE, "confidence": 1.5})
    with pytest.raises(ValidationError):
        Promise.model_validate({**_BASE, "confidence": -0.1})


def test_source_year_minimum():
    with pytest.raises(ValidationError):
        Promise.model_validate({**_BASE, "source_year": 1989})
