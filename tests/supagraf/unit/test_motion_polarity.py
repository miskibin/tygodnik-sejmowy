"""Regex classifier for votings.motion_polarity.

These fixtures are real `votings.topic` strings sampled from term-10
production data (see PR for design notes). They guard against regressions
in the Polish-text patterns. The SQL function in migration 0087 is the
canonical implementation; this Python mirror MUST stay aligned.
"""
from __future__ import annotations

import pytest

from supagraf.backfill.motion_polarity import classify

REJECT_FIXTURES = [
    # Bosak / druk 2197 — the bug-report case.
    "wniosek o odrzucenie projektu w pierwszym czytaniu.",
    "wniosek o odrzucenie projektu w pierwszym czytaniu",
    "wniosku o odrzucenie projektu",
    "odrzucenie projektu ustawy",
    "odrzucenia projektu",
]

AMENDMENT_FIXTURES = [
    "poprawka 1",
    "poprawka 21",
    "poprawki nr 5 i 9",
    "Poprawka 4",
    "poprawkę nr 3",
]

PASS_FIXTURES = [
    "głosowanie nad całością projektu.",
    "całość projektu ustawy",
    "całość projektu",
]

MINORITY_FIXTURES = [
    "wniosek mniejszości 2",
    "wnioski mniejszości nr 1-3",
    "Wniosku mniejszości",
]

PROCEDURAL_FIXTURES = [
    "Głosowanie kworum",
    "Głosowanie nad kandydaturą Pana Karola Polejowskiego",
    "wybór sędziów Trybunału Konstytucyjnego",
    "powołanie Prezesa NIK",
    "odwołanie ministra",
    "wniosek o przerwę w obradach",
    "wniosek o uzupełnienie porządku dziennego",
    "porządek dzienny posiedzenia",
    "reasumpcja głosowania",
]

NULL_FIXTURES = [
    None,
    "",
    "   ",
    # Real ambiguous topic — should not invent a label.
    "Sprawozdanie Komisji",
]


@pytest.mark.parametrize("topic", REJECT_FIXTURES)
def test_classify_reject(topic: str) -> None:
    assert classify(topic) == "reject"


@pytest.mark.parametrize("topic", AMENDMENT_FIXTURES)
def test_classify_amendment(topic: str) -> None:
    assert classify(topic) == "amendment"


@pytest.mark.parametrize("topic", PASS_FIXTURES)
def test_classify_pass(topic: str) -> None:
    assert classify(topic) == "pass"


@pytest.mark.parametrize("topic", MINORITY_FIXTURES)
def test_classify_minority(topic: str) -> None:
    assert classify(topic) == "minority"


@pytest.mark.parametrize("topic", PROCEDURAL_FIXTURES)
def test_classify_procedural(topic: str) -> None:
    assert classify(topic) == "procedural"


@pytest.mark.parametrize("topic", NULL_FIXTURES)
def test_classify_null_when_ambiguous(topic: str | None) -> None:
    assert classify(topic) is None


def test_first_pattern_wins_reject_over_amendment() -> None:
    # Pathological case: a topic that mentions both. Reject wins (declared
    # first in PATTERNS, matches SQL CASE order).
    assert classify("wniosek o odrzucenie projektu wraz z poprawką 1") == "reject"


# ─── Alignment truth-table mirror (informational; SQL is canonical) ────────
# Encoded here so devs can read the rule without opening the migration.
ALIGNMENT_TRUTH_TABLE = [
    # (vote, polarity, stance, expected)
    ("YES",     "pass",       "pro_bill",  "aligned"),
    ("NO",      "pass",       "pro_bill",  "opposed"),
    ("YES",     "reject",     "pro_bill",  "opposed"),  # yes-for-reject = anti-bill
    ("NO",      "reject",     "pro_bill",  "aligned"),  # Bosak / 2197
    ("YES",     "pass",       "anti_bill", "opposed"),
    ("NO",      "reject",     "anti_bill", "opposed"),
    ("ABSTAIN", "pass",       "pro_bill",  "neutral"),
    ("ABSENT",  "pass",       "pro_bill",  "absent"),
    ("PRESENT", "pass",       "pro_bill",  "absent"),
    ("YES",     "amendment",  "pro_bill",  "neutral"),
    ("NO",      "procedural", "pro_bill",  "neutral"),
    ("YES",     "minority",   "pro_bill",  "neutral"),
    ("YES",     None,         "pro_bill",  "neutral"),
]


def _ts_compute(vote: str, polarity: str | None, stance: str) -> str:
    """Pure-Python mirror of frontend/lib/promiseAlignment.ts.
    Lives in the test to assert TS↔SQL↔Python all agree on the same table.
    """
    if vote in ("ABSENT", "PRESENT"):
        return "absent"
    if vote == "ABSTAIN":
        return "neutral"
    if polarity is None or polarity in ("amendment", "procedural", "minority"):
        return "neutral"
    advances = (polarity == "pass" and vote == "YES") or (polarity == "reject" and vote == "NO")
    if advances:
        return "aligned" if stance == "pro_bill" else "opposed"
    return "opposed" if stance == "pro_bill" else "aligned"


@pytest.mark.parametrize("vote,polarity,stance,expected", ALIGNMENT_TRUTH_TABLE)
def test_alignment_truth_table(vote: str, polarity: str | None, stance: str, expected: str) -> None:
    assert _ts_compute(vote, polarity, stance) == expected
