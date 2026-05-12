import "server-only";

import { supabase } from "@/lib/supabase";

// Poll-code → Sejm club_short mapping. Polls use slightly finer codes than
// what shows up as a parliamentary club (PSL and TD sit in one PSL-TD klub;
// KKP/PJJ aren't separate Sejm clubs at all, so they have no voting record
// and contribute nothing to a coalition's cohesion score).
const POLL_TO_KLUB_SHORT: Record<string, string | null> = {
  KO: "KO",
  PiS: "PiS",
  Konfederacja: "Konfederacja",
  Lewica: "Lewica",
  Razem: "Razem",
  Polska2050: "Polska2050",
  PSL: "PSL-TD",
  TD: "PSL-TD",
  KKP: null,
  PJJ: null,
};

export function pollCodeToKlubShort(code: string): string | null {
  return POLL_TO_KLUB_SHORT[code] ?? null;
}

export type KlubPairAgreement = {
  // Symmetric lookup: both `${a}|${b}` and `${b}|${a}` populated.
  byPair: Map<string, { agreement: number; votings: number }>;
};

// Reads klub_pair_agreement_mv (mig 0051). Returns 0..1 agreement +
// joint-voting count per unordered pair of Sejm club shorts.
export async function getKlubPairAgreement(term = 10): Promise<KlubPairAgreement> {
  const sb = supabase();
  const { data, error } = await sb
    .from("klub_pair_agreement_mv")
    .select("club_a_short, club_b_short, votings_with_both, agreement_pct")
    .eq("term", term);
  if (error) throw error;

  type Row = {
    club_a_short: string;
    club_b_short: string;
    votings_with_both: number | null;
    agreement_pct: number | string | null;
  };

  const byPair = new Map<string, { agreement: number; votings: number }>();
  for (const r of (data ?? []) as Row[]) {
    if (r.club_a_short === r.club_b_short) continue;
    const pct = typeof r.agreement_pct === "string" ? parseFloat(r.agreement_pct) : r.agreement_pct;
    if (pct == null || Number.isNaN(pct)) continue;
    const entry = { agreement: pct / 100, votings: r.votings_with_both ?? 0 };
    byPair.set(`${r.club_a_short}|${r.club_b_short}`, entry);
    byPair.set(`${r.club_b_short}|${r.club_a_short}`, entry);
  }
  return { byPair };
}
