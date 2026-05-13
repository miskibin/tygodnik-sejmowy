/**
 * Bill-outcome resolver — maps (motion polarity, motion vote result) to the
 * bill-level status that should appear on the timeline / status chip.
 *
 * Issue #25: print 10/2449 page rendered "ustawa odrzucona" even though the
 * only recorded Sejm vote was a FAILED "wniosek o odrzucenie projektu" — i.e.
 * the motion-to-reject lost, so the bill SURVIVES and goes to committee. The
 * old code in predict_stages.ts mapped `passed=false` (motion outcome) directly
 * to "ustawa odrzucona" regardless of what the motion was about.
 *
 * Canonical truth table mirrored in:
 *   tests/supagraf/unit/test_bill_outcome.py   (parametrised real-case fixtures)
 *   frontend/scripts/test_bill_outcome.mjs     (runnable TS-side validator)
 *
 * If you change this, change BOTH the Python mirror and the .mjs validator —
 * the tests will diverge otherwise.
 */

import type { MotionPolarity } from "@/lib/promiseAlignment";

export type BillOutcome = "passed" | "rejected" | "continues" | "indeterminate";

export function computeBillOutcome(
  polarity: MotionPolarity | null,
  motionPassed: boolean,
): BillOutcome {
  if (polarity === "pass") return motionPassed ? "passed" : "rejected";
  if (polarity === "reject") return motionPassed ? "rejected" : "continues";
  // amendment / minority / procedural / unclassified — never invent a bill claim.
  return "indeterminate";
}

const LABEL_PL: Record<BillOutcome, string> = {
  passed: "ustawa przyjęta w trzecim czytaniu",
  rejected: "ustawa odrzucona",
  continues: "wniosek o odrzucenie odrzucony — projekt skierowany do dalszej pracy",
  indeterminate: "głosowanie nad wnioskiem proceduralnym — etap projektu bez zmian",
};

export function billOutcomeLabel(outcome: BillOutcome): string {
  return LABEL_PL[outcome];
}

/**
 * Verdict-stamp words for the giant headline on /glosowanie/[id].
 *
 * Pre-fix: stamp showed huge motion-level verb (PRZYJĘTY/ODRZUCONY) coloured
 * by motion outcome, with bill consequence ("projekt zamknięty" etc.) demoted
 * to a tiny gray sublabel. Citizen review (druk 2197 / voting 1513): reading
 * giant green "PRZYJĘTY" — even with "WNIOSEK" above — gets parsed as "bill
 * passed" when in fact a successful reject-motion KILLED the bill.
 *
 * New design inverts the hierarchy: the BIG label is the bill-level outcome
 * (the thing a citizen actually cares about), coloured green/red by bill
 * fate, and the motion-level description goes underneath in muted italic.
 *
 *   bill outcome      headline             color    motion description below
 *   ───────────────────────────────────────────────────────────────────────
 *   passed            USTAWA PRZYJĘTA      success  „głosowanie nad całością — przyjęte"
 *   rejected (pass)   USTAWA ODRZUCONA     red      „głosowanie nad całością — odrzucone"
 *   rejected (reject) USTAWA ODRZUCONA     red      „wniosek o odrzucenie przyjęty"
 *   continues         PROJEKT IDZIE DALEJ  success  „wniosek o odrzucenie odrzucony"
 *   indeterminate     <motion-subject + verb, neutral>  ""
 *
 * Headline subject/verb agreement (Polish gender):
 *   USTAWA / POPRAWKA  (f) → PRZYJĘTA / ODRZUCONA
 *   WNIOSEK / PROJEKT  (m) → PRZYJĘTY / ODRZUCONY / IDZIE DALEJ
 *   GŁOSOWANIE         (n) → PRZYJĘTE / ODRZUCONE
 */
export type VerdictStampWords = {
  /** Big italic headline — what happened to the project (or motion if indeterminate). */
  headline: string;
  /** Color token name used by the stamp. */
  tone: "success" | "destructive" | "neutral";
  /** Smaller line below describing the motion. Empty when no motion-level context to add. */
  motionDescription: string;
};

function motionDescriptionFor(polarity: MotionPolarity | null, motionPassed: boolean): string {
  if (polarity === "pass") {
    return motionPassed
      ? "głosowanie nad całością projektu"
      : "głosowanie nad całością projektu odrzucone";
  }
  if (polarity === "reject") {
    return motionPassed
      ? "wniosek o odrzucenie przyjęty"
      : "wniosek o odrzucenie odrzucony";
  }
  return "";
}

function indeterminateHeadline(polarity: MotionPolarity | null, motionPassed: boolean): { headline: string; tone: "neutral" } {
  // Subjects + Polish gender for non-bill-claim polarities.
  const subj = polarity === "amendment"
    ? { word: "POPRAWKA", gender: "f" as const }
    : polarity === "minority"
      ? { word: "WNIOSEK MNIEJSZOŚCI", gender: "m" as const }
      : polarity === "procedural"
        ? { word: "WNIOSEK", gender: "m" as const }
        : { word: "GŁOSOWANIE", gender: "n" as const };
  const verb = subj.gender === "f"
    ? (motionPassed ? "PRZYJĘTA" : "ODRZUCONA")
    : subj.gender === "m"
      ? (motionPassed ? "PRZYJĘTY" : "ODRZUCONY")
      : (motionPassed ? "PRZYJĘTE" : "ODRZUCONE");
  return { headline: `${subj.word} ${verb}`, tone: "neutral" };
}

export function verdictStampWords(
  polarity: MotionPolarity | null,
  motionPassed: boolean,
): VerdictStampWords {
  const outcome = computeBillOutcome(polarity, motionPassed);
  if (outcome === "indeterminate") {
    const { headline, tone } = indeterminateHeadline(polarity, motionPassed);
    return { headline, tone, motionDescription: "" };
  }
  let headline: string;
  let tone: "success" | "destructive";
  if (outcome === "passed") {
    headline = "USTAWA PRZYJĘTA";
    tone = "success";
  } else if (outcome === "rejected") {
    headline = "USTAWA ODRZUCONA";
    tone = "destructive";
  } else {
    // continues — failed reject-motion; bill goes back to committee.
    headline = "PROJEKT IDZIE DALEJ";
    tone = "success";
  }
  return { headline, tone, motionDescription: motionDescriptionFor(polarity, motionPassed) };
}

/** Short chip label for VotingRow.verdict on /proces pages. */
const VERDICT_LABEL_PL: Record<BillOutcome, string> = {
  passed: "ustawa przyjęta",
  rejected: "ustawa odrzucona",
  continues: "projekt dalej",
  indeterminate: "—",
};

export function verdictChipLabel(outcome: BillOutcome): string {
  return VERDICT_LABEL_PL[outcome];
}

/**
 * Whether the bill timeline continues past the Sejm vote.
 * - "passed":      yes — render Senate / Prezydent / Dz.U. stages
 * - "rejected":    no  — terminal
 * - "continues":   no  — bill goes back to committee, not to Senate
 * - "indeterminate": no — this vote alone doesn't move the bill out of Sejm
 */
export function billAdvancesToSenate(outcome: BillOutcome): boolean {
  return outcome === "passed";
}
