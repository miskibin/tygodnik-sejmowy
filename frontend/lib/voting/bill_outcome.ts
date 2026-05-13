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
