"""Unit tests for print-committee_sitting agenda matching helpers."""
from __future__ import annotations

from supagraf.backfill.committee_sitting_links import _extract_agenda_print_numbers


def test_extract_agenda_print_numbers_simple():
    html = "<p>Rozpatrzenie druku nr 2484.</p>"
    assert _extract_agenda_print_numbers(html) == ["2484"]


def test_extract_agenda_print_numbers_multi_separators():
    html = "<p>Sprawy: druki nr 2459, 2461 oraz 2461-A i 2480.</p>"
    assert _extract_agenda_print_numbers(html) == ["2459", "2461", "2461-A", "2480"]


def test_extract_agenda_print_numbers_inflected_druku_form():
    html = "<p>Pierwsze czytanie projektu ustawy z druku nr 3112.</p>"
    assert _extract_agenda_print_numbers(html) == ["3112"]


def test_extract_agenda_print_numbers_slash_variant():
    html = "<p>Omowienie druku nr 1234/1.</p>"
    assert _extract_agenda_print_numbers(html) == ["1234/1"]


def test_extract_agenda_print_numbers_dedupes():
    html = "<p>druki nr 2484, 2484, 2485</p>"
    assert _extract_agenda_print_numbers(html) == ["2484", "2485"]


def test_extract_agenda_print_numbers_requires_druk_keyword():
    html = "<p>Nr 2484 i nr 2485</p>"
    assert _extract_agenda_print_numbers(html) == []

