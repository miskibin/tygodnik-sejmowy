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
 * Pre-fix the stamp always read "PRZYJĘTA" / "ODRZUCONA" — feminine, matching
 * "ustawa". That's misleading when the vote is a "wniosek o odrzucenie": the
 * MOTION was rejected but the BILL survives. Issue #25 follow-up: vary the
 * subject by polarity so the stamp says "WNIOSEK ODRZUCONY" (masculine) for
 * motion votes, avoiding the "ustawa odrzucona" misread entirely.
 *
 * Verb agrees grammatically with the subject:
 *   USTAWA / POPRAWKA (feminine)         → PRZYJĘTA / ODRZUCONA
 *   WNIOSEK / WNIOSEK MNIEJSZOŚCI (masc) → PRZYJĘTY / ODRZUCONY
 *   GŁOSOWANIE (neuter)                  → PRZYJĘTE / ODRZUCONE
 *
 * Sublabel describes the bill-level consequence ("projekt skierowany do
 * dalszych prac", "ustawa odrzucona w trzecim czytaniu", etc.) so the reader
 * gets both the motion result and what it means for the bill.
 */
export type VerdictStampWords = {
  subject: string;
  verb: string;
  /** Bill-level consequence, one short line. Empty string when no claim. */
  sublabel: string;
};

import type { MotionPolarity as _MP } from "@/lib/promiseAlignment";

function subjectFor(polarity: _MP | null): { subject: string; gender: "f" | "m" | "n" } {
  if (polarity === "pass") return { subject: "USTAWA", gender: "f" };
  if (polarity === "reject") return { subject: "WNIOSEK", gender: "m" };
  if (polarity === "amendment") return { subject: "POPRAWKA", gender: "f" };
  if (polarity === "minority") return { subject: "WNIOSEK MNIEJSZOŚCI", gender: "m" };
  if (polarity === "procedural") return { subject: "WNIOSEK", gender: "m" };
  return { subject: "GŁOSOWANIE", gender: "n" };
}

function verbFor(motionPassed: boolean, gender: "f" | "m" | "n"): string {
  if (gender === "f") return motionPassed ? "PRZYJĘTA" : "ODRZUCONA";
  if (gender === "m") return motionPassed ? "PRZYJĘTY" : "ODRZUCONY";
  return motionPassed ? "PRZYJĘTE" : "ODRZUCONE";
}

function sublabelFor(outcome: BillOutcome): string {
  if (outcome === "passed") return "ustawa przyjęta w trzecim czytaniu";
  if (outcome === "rejected") return "projekt zamknięty";
  if (outcome === "continues") return "projekt skierowany do dalszych prac";
  return "";
}

export function verdictStampWords(
  polarity: _MP | null,
  motionPassed: boolean,
): VerdictStampWords {
  const { subject, gender } = subjectFor(polarity);
  const verb = verbFor(motionPassed, gender);
  const sublabel = sublabelFor(computeBillOutcome(polarity, motionPassed));
  return { subject, verb, sublabel };
}

/** Short chip label for VotingRow.verdict on /druk pages. */
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
