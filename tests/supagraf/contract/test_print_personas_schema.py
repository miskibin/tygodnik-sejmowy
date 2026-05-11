"""Contract tests for PrintPersonasOutput Pydantic schema."""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from supagraf.enrich.print_personas import PERSONA_TAGS, PrintPersonasOutput


def _ok_rationale() -> str:
    return "Uzasadnienie testowe wystarczajaco dlugie."


def test_taxonomy_has_26_tags():
    assert len(PERSONA_TAGS) == 26


def test_extra_field_forbidden():
    with pytest.raises(ValidationError):
        PrintPersonasOutput.model_validate({
            "tags": ["najemca"],
            "rationale": _ok_rationale(),
            "extra": "no",
        })


def test_empty_tags_allowed():
    out = PrintPersonasOutput.model_validate({
        "tags": [],
        "rationale": _ok_rationale(),
    })
    assert out.tags == []


def test_eleven_tags_rejected():
    eleven = list(PERSONA_TAGS[:11])
    with pytest.raises(ValidationError):
        PrintPersonasOutput.model_validate({
            "tags": eleven,
            "rationale": _ok_rationale(),
        })


def test_invalid_tag_literal_rejected():
    with pytest.raises(ValidationError):
        PrintPersonasOutput.model_validate({
            "tags": ["not-a-real-persona"],
            "rationale": _ok_rationale(),
        })


def test_rationale_too_short_rejected():
    with pytest.raises(ValidationError):
        PrintPersonasOutput.model_validate({
            "tags": [],
            "rationale": "krotkie",  # 7 chars
        })


def test_rationale_too_long_rejected():
    with pytest.raises(ValidationError):
        PrintPersonasOutput.model_validate({
            "tags": [],
            "rationale": "x" * 401,
        })


def test_max_ten_tags_accepted():
    ten = list(PERSONA_TAGS[:10])
    out = PrintPersonasOutput.model_validate({
        "tags": ten,
        "rationale": _ok_rationale(),
    })
    assert len(out.tags) == 10
