"""Contract tests for PrintPlainPolishOutput Pydantic schema.

Pins ISO 24495 enum + word-count validator so schema drift fails CI.
"""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from supagraf.enrich.print_plain_polish import (
    MAX_WORDS,
    MIN_WORDS,
    PrintPlainPolishOutput,
)


def _summary_with_words(n: int) -> str:
    # Each "slowo" word = 1 token; deterministic word count.
    return " ".join(["slowo"] * n)


def test_extra_fields_rejected():
    with pytest.raises(ValidationError):
        PrintPlainPolishOutput.model_validate({
            "summary_plain": _summary_with_words(150),
            "iso24495_class": "B1",
            "extra": "no",
        })


def test_iso_class_enum_rejects_invalid_band():
    with pytest.raises(ValidationError):
        PrintPlainPolishOutput.model_validate({
            "summary_plain": _summary_with_words(150),
            "iso24495_class": "B3",
        })


@pytest.mark.parametrize("band", ["A1", "A2", "B1", "B2", "C1", "C2"])
def test_iso_class_enum_accepts_all_six_bands(band: str):
    out = PrintPlainPolishOutput.model_validate({
        "summary_plain": _summary_with_words(150),
        "iso24495_class": band,
    })
    assert out.iso24495_class == band


def test_word_count_below_min_rejected():
    with pytest.raises(ValidationError, match="word count"):
        PrintPlainPolishOutput.model_validate({
            "summary_plain": _summary_with_words(MIN_WORDS - 1),
            "iso24495_class": "B1",
        })


def test_word_count_above_max_rejected():
    with pytest.raises(ValidationError, match="word count"):
        PrintPlainPolishOutput.model_validate({
            "summary_plain": _summary_with_words(MAX_WORDS + 1),
            "iso24495_class": "B1",
        })


@pytest.mark.parametrize("n", [MIN_WORDS, (MIN_WORDS + MAX_WORDS) // 2, MAX_WORDS])
def test_word_count_inside_range_accepted(n: int):
    out = PrintPlainPolishOutput.model_validate({
        "summary_plain": _summary_with_words(n),
        "iso24495_class": "B1",
    })
    assert len(out.summary_plain.split()) == n


def test_summary_required():
    with pytest.raises(ValidationError):
        PrintPlainPolishOutput.model_validate({
            "iso24495_class": "B1",
        })
