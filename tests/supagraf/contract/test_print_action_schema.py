"""Contract tests for PrintCitizenActionOutput Pydantic schema.

Schema is the source of truth for what the LLM may emit; these tests pin
the strict-forbid + length bounds so a sloppy schema edit fails CI.
"""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from supagraf.enrich.print_action import PrintCitizenActionOutput


def test_extra_fields_rejected():
    with pytest.raises(ValidationError):
        PrintCitizenActionOutput.model_validate({
            "action": "Zrób X.",
            "rationale": "Bo tak trzeba dla obywatela.",
            "extra": "no",
        })


def test_action_none_accepted_with_valid_rationale():
    out = PrintCitizenActionOutput.model_validate({
        "action": None,
        "rationale": "Ustawa proceduralna bez wpływu obywatelskiego.",
    })
    assert out.action is None
    assert out.rationale.startswith("Ustawa")


def test_action_default_is_none():
    out = PrintCitizenActionOutput.model_validate({
        "rationale": "Proceduralne, brak akcji.",
    })
    assert out.action is None


def test_action_over_140_chars_rejected():
    with pytest.raises(ValidationError):
        PrintCitizenActionOutput.model_validate({
            "action": "x" * 141,
            "rationale": "Wystarczająco długi opis.",
        })


def test_action_exactly_140_chars_accepted():
    out = PrintCitizenActionOutput.model_validate({
        "action": "x" * 140,
        "rationale": "Wystarczająco długi opis.",
    })
    assert len(out.action) == 140


def test_rationale_under_10_chars_rejected():
    with pytest.raises(ValidationError):
        PrintCitizenActionOutput.model_validate({
            "action": None,
            "rationale": "krotkie",
        })


def test_rationale_over_300_chars_rejected():
    with pytest.raises(ValidationError):
        PrintCitizenActionOutput.model_validate({
            "action": None,
            "rationale": "y" * 301,
        })
