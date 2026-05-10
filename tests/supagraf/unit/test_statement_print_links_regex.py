"""Unit tests for the regex helpers behind backfill_statement_print_links.

Covers two extraction primitives that drive provenance-tagged links:
  * _extract_agenda_ord  -> 'Pkt. NN' / 'NN. punkt porządku dziennego' ordinal
  * _extract_print_numbers -> 'druk(i) nr X, Y i Z' tokens (incl. -A suffix)

The full backfill is exercised by the e2e suite (RUN_E2E=1); these tests just
guard the parsing surface against regressions like adding new false positives
or dropping suffix support.
"""
from __future__ import annotations

from supagraf.backfill.etl_review import (
    _extract_agenda_ord,
    _extract_print_numbers,
)


# ----- _extract_agenda_ord -------------------------------------------------

def test_extract_agenda_ord_pkt_prefix():
    body = "Pkt. 22 Sprawozdanie Komisji o uchwale Senatu w sprawie ustawy o..."
    assert _extract_agenda_ord(body) == 22


def test_extract_agenda_ord_punkt_porzadku_full():
    body = (
        "10. kadencja, 49. posiedzenie, 1. dzień (08-01-2026) "
        "6. punkt porządku dziennego: Sprawozdanie Komisji..."
    )
    assert _extract_agenda_ord(body) == 6


def test_extract_agenda_ord_punkt_porzadku_no_diacritics():
    # Some transcripts arrive ASCII-fold (legacy ETL).
    body = "10. kadencja, 49. posiedzenie, 1. dzien (08-01-2026) 6. punkt porzadku dziennego: ..."
    assert _extract_agenda_ord(body) == 6


def test_extract_agenda_ord_returns_first_hit():
    # Pkt. prefix wins when it appears first.
    body = "Pkt. 5 ... Sprawozdanie ... 12. punkt porządku dziennego ..."
    assert _extract_agenda_ord(body) == 5


def test_extract_agenda_ord_outside_preamble_window_skipped():
    # Window is 600 chars — anything past that is body content, not preamble.
    body = " " * 700 + "Pkt. 99"
    assert _extract_agenda_ord(body) is None


def test_extract_agenda_ord_no_match():
    assert _extract_agenda_ord("Wysoka Izbo, dziękuję bardzo.") is None


def test_extract_agenda_ord_empty():
    assert _extract_agenda_ord("") is None


# ----- _extract_print_numbers ---------------------------------------------

def test_extract_print_numbers_simple():
    assert _extract_print_numbers("rozpatrzymy druk nr 2484.") == ["2484"]


def test_extract_print_numbers_multi():
    assert _extract_print_numbers("druki nr 2459, 2461 i 2461-A") == ["2459", "2461", "2461-A"]


def test_extract_print_numbers_oraz_separator():
    assert _extract_print_numbers("druki nr 2206, 2234 oraz 2234-A i 2245") == [
        "2206", "2234", "2234-A", "2245",
    ]


def test_extract_print_numbers_autopoprawka_suffix():
    # Suffix-A (autopoprawka) tokens must survive extraction. _DRUKI_RE only
    # matches nominative 'druk'/'druki' (matches voting-title phrasing) — not
    # inflected genitive 'druku' / instr. 'drukami'. Statements may use
    # inflected forms; documenting that those slip through here so future
    # work knows whether to broaden the pattern or accept the gap.
    nums = _extract_print_numbers("rozpatrujemy druk nr 2156-A.")
    assert "2156-A" in nums


def test_extract_print_numbers_inflected_forms_skip_known_gap():
    # Genitive "druku" / instr. "drukami" / dat. "drukowi" not matched today.
    # Fail-safe assertion so a future relaxation of the regex pings this test.
    assert _extract_print_numbers("dotyczy druku nr 2156-A.") == []


def test_extract_print_numbers_no_druk_keyword_no_match():
    # Plain 'nr 2484' (without 'druk') must not match — this is the false-positive
    # guard. Many speeches mention article numbers like 'art. nr 12'.
    assert _extract_print_numbers("art. nr 2484 stanowi, że...") == []


def test_extract_print_numbers_empty_input():
    assert _extract_print_numbers("") == []


def test_extract_print_numbers_dedupes_within_phrase():
    # Same number listed twice in one phrase → kept once.
    nums = _extract_print_numbers("druki nr 2484, 2484, 2485")
    assert nums == ["2484", "2485"]


def test_extract_print_numbers_terminator_handling():
    # The trailing ')' or '.' bounds the chunk.
    assert _extract_print_numbers("(druki nr 1939 i 2114).") == ["1939", "2114"]
    assert _extract_print_numbers("druki nr 1939 i 2114.") == ["1939", "2114"]
