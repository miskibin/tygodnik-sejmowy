import "server-only";

import { supabase } from "@/lib/supabase";

// Probe a small set of daily-touched tables, return the freshest loaded_at.
// Treats "data update" as the most recent successful refresh of any
// daily-driven resource (whichever finished last).
//
// Each probe is its own SELECT max() so a single missing/renamed table
// (e.g. fresh DB without committee_sittings yet) doesn't blow up the
// whole footer — it just gets ignored.

const PROBES: Array<{ table: string; termFilter: boolean }> = [
  { table: "votings", termFilter: true },
  { table: "prints", termFilter: true },
  { table: "committee_sittings", termFilter: true },
  { table: "committees", termFilter: true },
  { table: "acts", termFilter: false },
];

const DEFAULT_TERM = 10;

export async function getLastDataUpdate(term = DEFAULT_TERM): Promise<Date | null> {
  const sb = supabase();
  const results = await Promise.all(
    PROBES.map(async ({ table, termFilter }) => {
      try {
        let q = sb.from(table).select("loaded_at").order("loaded_at", { ascending: false, nullsFirst: false }).limit(1);
        if (termFilter) q = q.eq("term", term);
        const { data, error } = await q;
        if (error) return null;
        const row = data?.[0] as { loaded_at?: string | null } | undefined;
        return row?.loaded_at ? new Date(row.loaded_at) : null;
      } catch {
        return null;
      }
    }),
  );
  const valid = results.filter((d): d is Date => d instanceof Date && !Number.isNaN(d.getTime()));
  if (valid.length === 0) return null;
  return new Date(Math.max(...valid.map((d) => d.getTime())));
}
