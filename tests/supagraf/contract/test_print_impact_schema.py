"""Contract tests for PrintImpactOutput Pydantic schema.

Pins tag taxonomy + severity enum + 200-char punch limit so schema drift
fails CI.
"""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from supagraf.enrich.print_impact import (
    MAX_PUNCH_CHARS,
    AffectedGroup,
    PrintImpactOutput,
)


def test_extra_fields_rejected_top_level():
    with pytest.raises(ValidationError):
        PrintImpactOutput.model_validate({
            "impact_punch": "Krotki opis zmiany.",
            "affected_groups": [],
            "extra": "no",
        })


def test_extra_fields_rejected_inside_group():
    with pytest.raises(ValidationError):
        PrintImpactOutput.model_validate({
            "impact_punch": "Krotki opis zmiany.",
            "affected_groups": [
                {"tag": "najemca", "severity": "high", "est_population": None, "extra": "no"}
            ],
        })


def test_invalid_tag_rejected():
    with pytest.raises(ValidationError):
        AffectedGroup.model_validate({
            "tag": "kosmonauta",
            "severity": "high",
            "est_population": None,
        })


def test_invalid_severity_rejected():
    with pytest.raises(ValidationError):
        AffectedGroup.model_validate({
            "tag": "najemca",
            "severity": "extreme",
            "est_population": None,
        })


def test_est_population_must_be_positive():
    with pytest.raises(ValidationError):
        AffectedGroup.model_validate({
            "tag": "najemca",
            "severity": "high",
            "est_population": 0,
        })


def test_est_population_null_default():
    g = AffectedGroup.model_validate({
        "tag": "najemca",
        "severity": "high",
    })
    assert g.est_population is None


def test_punch_over_200_chars_rejected():
    with pytest.raises(ValidationError):
        PrintImpactOutput.model_validate({
            "impact_punch": "x" * (MAX_PUNCH_CHARS + 1),
            "affected_groups": [],
        })


def test_punch_exactly_200_chars_accepted():
    out = PrintImpactOutput.model_validate({
        "impact_punch": "x" * MAX_PUNCH_CHARS,
        "affected_groups": [],
    })
    assert len(out.impact_punch) == MAX_PUNCH_CHARS


def test_empty_affected_groups_accepted():
    # Procedural prints legitimately have no affected groups.
    out = PrintImpactOutput.model_validate({
        "impact_punch": "Ratyfikacja umowy bez bezposredniego wplywu.",
        "affected_groups": [],
    })
    assert out.affected_groups == []


def test_full_payload_accepted():
    out = PrintImpactOutput.model_validate({
        "impact_punch": "Najemcy odlicza do 12 000 zl czynszu rocznie od PIT od 2026 roku.",
        "affected_groups": [
            {"tag": "najemca", "severity": "high", "est_population": 1500000},
            {"tag": "wlasciciel-mieszkania", "severity": "medium", "est_population": None},
            {"tag": "podatnik-pit", "severity": "low", "est_population": None},
        ],
    })
    assert len(out.affected_groups) == 3
    assert out.affected_groups[0].tag == "najemca"
    assert out.affected_groups[0].est_population == 1500000
