"""Bill-outcome truth table — from motion_polarity + per-vote pass/fail.

Issue #25: print 10/2449 page shows "ustawa odrzucona" even though the only
recorded Sejm vote was a failed "wniosek o odrzucenie" — i.e. the motion to
reject the bill lost, so the bill SURVIVES. The old `predictStages` mapped
`processes.passed=false` directly to the "ustawa odrzucona" label without
considering what the underlying motion was actually about.

The truth table:

    polarity   motion-passed   bill outcome    rendered as
    ──────────────────────────────────────────────────────
    pass       true            passed          "ustawa przyjęta w trzecim czytaniu"
    pass       false           rejected        "ustawa odrzucona w trzecim czytaniu"
    reject     true            rejected        "ustawa odrzucona"
    reject     false           continues       "wniosek o odrzucenie odrzucony — projekt skierowany dalej"  ← BUG CASE
    amendment  any             indeterminate   per-vote chip only — no bill claim
    minority   any             indeterminate
    procedural any             indeterminate
    null       any             indeterminate

This file is the canonical truth table. Mirror:
    - frontend/lib/voting/bill_outcome.ts  (production)
    - frontend/scripts/test_bill_outcome.mjs  (TS validator)

Fixtures are real `votings` rows pulled 2026-05-13 from db.msulawiak.pl.
Do not synthesize — citizen-review bugs come from real-world phrasings, not
fixtures invented by the author.
"""
from __future__ import annotations

from typing import Literal

import pytest

BillOutcome = Literal["passed", "rejected", "continues", "indeterminate"]
MotionPolarity = Literal["pass", "reject", "amendment", "minority", "procedural"] | None


# ─── Canonical computation (Python; TS mirror lives at frontend/lib/voting/bill_outcome.ts) ──

def compute_bill_outcome(polarity: MotionPolarity, motion_passed: bool) -> BillOutcome:
    """Map (motion polarity, motion vote outcome) → bill-level status.

    Returns "indeterminate" when this single vote can't legitimately claim a
    bill-level outcome — never guess (the UI must fall back to per-vote copy).
    """
    if polarity == "pass":
        return "passed" if motion_passed else "rejected"
    if polarity == "reject":
        return "rejected" if motion_passed else "continues"
    return "indeterminate"


def bill_outcome_label(outcome: BillOutcome) -> str:
    """Polish copy for the bill-level outcome chip on the timeline."""
    if outcome == "passed":
        return "ustawa przyjęta w trzecim czytaniu"
    if outcome == "rejected":
        return "ustawa odrzucona"
    if outcome == "continues":
        return "wniosek o odrzucenie odrzucony — projekt skierowany do dalszej pracy"
    return "głosowanie nad wnioskiem proceduralnym — etap projektu bez zmian"


# ─── Real fixtures sourced from production DB (term 10, fetched 2026-05-13) ──
# Each row: (voting_id, polarity, yes, no, majority_votes, expected_outcome, topic).
# voting_id is informational — lets a reviewer pull the row from Supabase to
# verify the tally. Tests assert (polarity, motion_passed) → outcome, where
# motion_passed = yes >= majority_votes.

REAL_FIXTURES: list[tuple[int, MotionPolarity, int, int, int, BillOutcome, str]] = [
    # ── reject-motion FAILED → bill continues (the user-reported #25 bug case) ──
    (1517, "reject", 201, 242, 243, "continues",
     "wniosek o odrzucenie projektu w pierwszym czytaniu."),  # druk 10/2449 (Prawo oświatowe)
    (446,  "reject", 188, 228, 229, "continues",
     "wniosek o odrzucenie projektu w pierwszym czytaniu."),  # druk 1424 (rynek kryptoaktywów)
    (55,   "reject", 203, 223, 224, "continues",
     "wniosek o odrzucenie w całości projektu."),             # druk 923 (wybory prezydenckie)
    (58,   "reject", 204, 240, 241, "continues",
     "wniosek o odrzucenie w całości projektu."),             # druk 926 (wykonywanie mandatu)
    (60,   "reject", 204, 240, 241, "continues",
     "wniosek o odrzucenie w całości projektu."),             # druk 906 (Prokuratura Europejska)
    (77,   "reject", 132, 218, 219, "continues",
     "wniosek o odrzucenie w całości projektu."),             # druk 956 (biokomponenty)
    (108,  "reject",  30, 394, 395, "continues",
     "wniosek o odrzucenie w całości projektu."),             # druk 924 (ochrona cudzoziemców)
    (151,  "reject", 179, 251, 252, "continues",
     "wniosek o odrzucenie projektu w pierwszym czytaniu."),  # Rada Ministrów
    (207,  "reject",  26, 234, 235, "continues",
     "wniosek o odrzucenie w całości projektu."),             # NIW
    (214,  "reject", 195, 235, 236, "continues",
     "wniosek o odrzucenie w całości projektu."),             # ochrona środowiska
    (216,  "reject", 194, 234, 235, "continues",
     "wniosek o odrzucenie w całości projektu."),             # drogi publiczne
    # ── reject-motion PASSED → bill genuinely rejected ──
    (65,   "reject", 237, 188, 189, "rejected",
     "wniosek o odrzucenie projektu w pierwszym czytaniu."),  # druk 962 (ceny energii)
    (147,  "reject", 238, 193, 194, "rejected",
     "wniosek o odrzucenie projektu w pierwszym czytaniu."),  # Kodeks karny
    (148,  "reject", 241, 194, 195, "rejected",
     "wniosek o odrzucenie projektu w pierwszym czytaniu."),  # podatek od spadków
    (232,  "reject", 233, 187, 188, "rejected",
     "wniosek o odrzucenie projektu w pierwszym czytaniu."),  # zwolnienie p...
    (1148, "reject", 240, 200, 201, "rejected",
     "wniosek o odrzucenie projektu w pierwszym czytaniu."),  # obywatelstwo polskie
    (1513, "reject", 244, 207, 208, "rejected",
     "wniosek o odrzucenie projektu w pierwszym czytaniu."),  # opłaty lokalne (psy)
    (2024, "reject", 244, 198, 199, "rejected",
     "wniosek o odrzucenie projektu w pierwszym czytaniu."),  # prezydencki projekt
    # ── third-reading PASS-motion succeeded → bill passed ──
    (299,  "pass",   415,   0,   1, "passed",
     "głosowanie nad całością projektu."),                    # repatriacja
    (527,  "pass",   430,   0,   1, "passed",
     "głosowanie nad całością projektu."),                    # Karta Nauczyciela
    (579,  "pass",   410,   0,   1, "passed",
     "głosowanie nad całością projektu."),                    # fundusz sołecki
    (774,  "pass",   339,  78,  79, "passed",
     "głosowanie nad całością projektu."),                    # ochrona zwierząt
    (899,  "pass",   434,   3,   4, "passed",
     "głosowanie nad całością projektu."),                    # podatek akcyzowy
    (1113, "pass",   241, 183, 184, "passed",
     "głosowanie nad całością projektu."),                    # rynek kryptoaktywów (final reading)
    # ── third-reading PASS-motion failed → bill rejected at third reading ──
    (1978, "pass",   199, 231, 232, "rejected",
     "głosowanie nad całością projektu."),                    # ograniczenie biurokracji (druki 558/1420)
    # ── amendment / minority / procedural → indeterminate ──
    # (Per-vote chips like "wniosek przyjęty" stay correct; bill-level claim must abstain.)
    (136, "amendment",  238, 200, 201, "indeterminate", "poprawki nr 2, 5 i 11"),
    (135, "amendment",   30, 410, 411, "indeterminate", "poprawki nr 1, 4 i 10"),
    (900, "minority",   202, 232, 233, "indeterminate", "wniosek mniejszości 1"),
    (935, "minority",   200, 240, 241, "indeterminate", "wniosek mniejszości 1"),
    (44,  "procedural", 190, 241, 242, "indeterminate", "Wniosek o przerwę"),
    (157, "procedural", 194, 240, 241, "indeterminate", "Wniosek o przerwę"),
    # ── null polarity (unclassified topic) → indeterminate ──
    (20,  None,         230, 170, 171, "indeterminate",
     "wniosek o skrócenie terminu, o którym mowa w art. 44 ust. 3 regulaminu Sejmu w sprawie planowanego sprawozdania do druku nr 2459."),
]


def _motion_passed(yes: int, majority_votes: int) -> bool:
    return yes >= majority_votes


@pytest.mark.parametrize("voting_id,polarity,yes,no,maj,expected,topic", REAL_FIXTURES,
                         ids=lambda v: f"v{v}" if isinstance(v, int) else None)
def test_bill_outcome_real_cases(voting_id, polarity, yes, no, maj, expected, topic) -> None:
    actual = compute_bill_outcome(polarity, _motion_passed(yes, maj))
    assert actual == expected, (
        f"voting {voting_id} ({polarity}, yes={yes} vs maj={maj}): "
        f"got {actual!r}, expected {expected!r}. Topic: {topic!r}"
    )


def test_labels_distinct_per_outcome() -> None:
    # Two-sided sanity: every outcome maps to a non-empty Polish label, and the
    # four labels are pairwise distinct (otherwise the UI would conflate cases).
    labels = {o: bill_outcome_label(o) for o in ("passed", "rejected", "continues", "indeterminate")}
    assert all(s for s in labels.values())
    assert len(set(labels.values())) == 4


def test_bug_case_distinguishable_from_legacy_logic() -> None:
    """Regression guard: the old `passed`-only logic (predictStages pre-fix)
    rendered every motion-to-reject failure as "ustawa odrzucona". This test
    captures the bug case (voting 1517 — Bosak / druk 10/2449) and asserts
    the new computation yields the opposite outcome.
    """
    # Voting 1517: motion-to-reject lost (yes=201 < majority=243). Old logic
    # used `passed` (motion outcome) directly → "ustawa odrzucona" (wrong).
    motion_passed = _motion_passed(201, 243)
    assert motion_passed is False
    legacy_label = "ustawa odrzucona" if not motion_passed else "ustawa przyjęta w trzecim czytaniu"
    new_outcome = compute_bill_outcome("reject", motion_passed)
    new_label = bill_outcome_label(new_outcome)
    assert new_outcome == "continues"
    assert new_label != legacy_label, (
        "Bug fix regressed: motion-to-reject failure still rendering "
        "as 'ustawa odrzucona'. Recheck predict_stages.ts and bill_outcome.ts."
    )


def test_pass_motion_failure_is_rejection_not_continuation() -> None:
    """Voting 1978 — third-reading pass-motion failed → bill genuinely rejected.
    Distinct from the reject-motion-failed case: third-reading "całość projektu"
    is the bill itself, so failure IS final rejection.
    """
    assert compute_bill_outcome("pass", False) == "rejected"


@pytest.mark.parametrize("polarity", ["amendment", "minority", "procedural", None])
def test_non_bill_level_motions_never_claim_outcome(polarity) -> None:
    """Amendment / minority / procedural / unclassified motions must NEVER
    return a bill-level outcome — UI would invent claims otherwise.
    """
    assert compute_bill_outcome(polarity, True) == "indeterminate"
    assert compute_bill_outcome(polarity, False) == "indeterminate"
