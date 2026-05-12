/**
 * Promise-vote alignment: TS mirror of the SQL function
 * `compute_promise_alignment` defined in supabase/migrations/0087.
 *
 * Why a mirror exists: the per-MP vote data and per-(voting,promise)
 * polarity/stance live in different tables, and joining all three +
 * applying the function via PostgREST RPC is chatty for a tab that
 * already pulls ~50 votes per MP. We compute client-side with the same
 * truth table; the SQL function stays canonical (tested in
 * tests/supagraf/unit/test_motion_polarity.py — alignment table parametrised).
 *
 * If you change the rule, change BOTH:
 *   - supabase/migrations/0087_motion_polarity_promise_alignment.sql
 *   - this file
 * The unit test will fail loudly if they drift apart.
 */

import type { VoteValue } from "@/lib/db/posel-tabs";

export type MotionPolarity = "pass" | "reject" | "amendment" | "procedural" | "minority";
export type PromiseStance = "pro_bill" | "anti_bill";
export type PromiseAlignment = "aligned" | "opposed" | "neutral" | "absent";

export function computePromiseAlignment(
  vote: VoteValue,
  polarity: MotionPolarity | null,
  stance: PromiseStance,
): PromiseAlignment {
  if (vote === "ABSENT" || vote === "PRESENT") return "absent";
  if (vote === "ABSTAIN") return "neutral";
  if (polarity === null || polarity === "amendment" || polarity === "procedural" || polarity === "minority") {
    return "neutral";
  }
  const billAdvances = (polarity === "pass" && vote === "YES") || (polarity === "reject" && vote === "NO");
  if (billAdvances) return stance === "pro_bill" ? "aligned" : "opposed";
  return stance === "pro_bill" ? "opposed" : "aligned";
}

const ALIGNMENT_LABEL_PL: Record<PromiseAlignment, string> = {
  aligned: "Zgodne z obietnicą",
  opposed: "Niezgodne z obietnicą",
  // Amendments / procedural / abstain — bill-level alignment can't be claimed.
  neutral: "Bez wpływu na obietnicę",
  absent:  "Nieobecny lub nie głosował",
};

export function alignmentAriaLabel(alignment: PromiseAlignment): string {
  return ALIGNMENT_LABEL_PL[alignment];
}
