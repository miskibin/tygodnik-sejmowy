"""Unit tests for the diacritics-restoration validation guard.

We don't mock the LLM call here — we test the pure validation logic that
guards every accepted restoration. The LLM-side integration is exercised
end-to-end by the CLI run.
"""
from __future__ import annotations

import pytest

from supagraf.enrich.llm import LLMResponseError
from supagraf.enrich.restore_diacritics import ascii_fold, validate_restoration


def test_ascii_fold_lowercase():
    assert ascii_fold("ąćęłńóśźż") == "acelnoszz"


def test_ascii_fold_uppercase():
    assert ascii_fold("ĄĆĘŁŃÓŚŹŻ") == "ACELNOSZZ"


def test_ascii_fold_passthrough():
    assert ascii_fold("PiS 2023, 14.") == "PiS 2023, 14."


def test_validate_accepts_pure_diacritic_swap():
    validate_restoration(
        "Wolnosci, swiadczenia 1500 zl",
        "Wolności, świadczenia 1500 zł",
    )


def test_validate_accepts_no_change():
    validate_restoration("Aborcja do 12", "Aborcja do 12")


def test_validate_rejects_added_word():
    with pytest.raises(LLMResponseError, match="length mismatch"):
        validate_restoration("Wolnosc", "Wielka Wolność")


def test_validate_rejects_removed_word():
    with pytest.raises(LLMResponseError, match="length mismatch"):
        validate_restoration("Narodowy Instytut Wolnosci", "Narodowy Instytut")


def test_validate_rejects_punctuation_change():
    with pytest.raises(LLMResponseError, match="fold mismatch"):
        validate_restoration("Wolnosci, Fundusz", "Wolności. Fundusz")


def test_validate_rejects_letter_substitution():
    with pytest.raises(LLMResponseError, match="fold mismatch"):
        validate_restoration("powolanych", "powołanymi")


def test_validate_rejects_case_change():
    with pytest.raises(LLMResponseError, match="fold mismatch"):
        validate_restoration("PiS", "pis")


def test_validate_rejects_word_reorder():
    with pytest.raises(LLMResponseError, match="fold mismatch"):
        validate_restoration("Aktywna mama", "Mama aktywna")
