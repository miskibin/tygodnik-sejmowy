import "server-only";

import { supabase } from "@/lib/supabase";

const DEFAULT_TERM = 10;

export type MpCardStat = {
  mpId: number;
  attendancePct: number | null;
  attendanceTotal: number | null;
  loyaltyPct: number | null;
  loyaltyVotes: number | null;
  questionCount: number;
  statementCount: number;
};

// Reads the three existing pre-aggregated matviews (mp_attendance,
// mp_discipline_summary, mp_activity_summary) in parallel and merges them
// in JS, keyed by mp_id. Daily refresh of those matviews keeps this fresh.
//
// Limit 1000 is a safety cap above Sejm's hard ceiling of ~460 mandates per
// term — filtered by term so we never see cross-term rows. If a future
// term introduces split mandates pushing above 1000, this query silently
// truncates; revisit then.
export async function getAllMpCardStats(term = DEFAULT_TERM): Promise<Map<number, MpCardStat>> {
  const sb = supabase();
  const [attRes, discRes, actRes] = await Promise.all([
    sb.from("mp_attendance")
      .select("mp_id, total_votes, pct_attended")
      .eq("term", term)
      .limit(1000),
    sb.from("mp_discipline_summary")
      .select("mp_id, n_votes, pct_aligned")
      .eq("term", term)
      .limit(1000),
    sb.from("mp_activity_summary")
      .select("mp_id, n_statements, n_questions")
      .eq("term", term)
      .limit(1000),
  ]);

  if (attRes.error) throw attRes.error;
  if (discRes.error) throw discRes.error;
  if (actRes.error) throw actRes.error;

  const out = new Map<number, MpCardStat>();
  const ensure = (mpId: number): MpCardStat => {
    let s = out.get(mpId);
    if (!s) {
      s = {
        mpId,
        attendancePct: null,
        attendanceTotal: null,
        loyaltyPct: null,
        loyaltyVotes: null,
        questionCount: 0,
        statementCount: 0,
      };
      out.set(mpId, s);
    }
    return s;
  };

  for (const r of (attRes.data ?? []) as Array<{
    mp_id: number;
    total_votes: number | null;
    pct_attended: string | number | null;
  }>) {
    const s = ensure(r.mp_id);
    s.attendancePct = r.pct_attended != null ? Number(r.pct_attended) : null;
    s.attendanceTotal = r.total_votes != null ? Number(r.total_votes) : null;
  }

  for (const r of (discRes.data ?? []) as Array<{
    mp_id: number;
    n_votes: number | null;
    pct_aligned: string | number | null;
  }>) {
    const s = ensure(r.mp_id);
    s.loyaltyPct = r.pct_aligned != null ? Number(r.pct_aligned) : null;
    s.loyaltyVotes = r.n_votes != null ? Number(r.n_votes) : null;
  }

  for (const r of (actRes.data ?? []) as Array<{
    mp_id: number;
    n_statements: number | null;
    n_questions: number | null;
  }>) {
    const s = ensure(r.mp_id);
    s.statementCount = Number(r.n_statements ?? 0);
    s.questionCount = Number(r.n_questions ?? 0);
  }

  return out;
}
