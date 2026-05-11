import "server-only";

import { supabase } from "@/lib/supabase";
import { isQuarterVisibleForParty } from "@/lib/polls/series";

// E3: polls dashboard data layer. Reads matviews populated by E2 ETL
// (poll_average_30d_mv, poll_trend_quarterly_mv) plus raw polls/poll_results
// joined in JS (Postgrest doesn't aggregate well across rows).

export type PollAverageRow = {
  party_code: string;
  percentage_avg: number;
  n_polls: number;
  last_conducted_at: string;
  percentage_min_30d: number;
  percentage_max_30d: number;
};

export type PollTrendRow = {
  party_code: string;
  quarter_start: string;
  percentage_avg: number;
  percentage_min: number;
  percentage_max: number;
  n_polls: number;
};

export type RecentPollRow = {
  poll_id: number;
  pollster: string;
  pollster_code: string;
  conducted_at_start: string;
  conducted_at_end: string;
  sample_size: number | null;
  source_url: string;
  results: { party_code: string; percentage: number | null }[];
};

export type PollsterSummary = {
  code: string;
  name_full: string;
  website: string | null;
  n_polls: number;
};

// Default 5-party set for the trend chart — anything else clutters.
export const TREND_DEFAULT_PARTIES = ["KO", "PiS", "Konfederacja", "Lewica", "PSL"] as const;

function toNum(x: unknown): number {
  if (x === null || x === undefined) return 0;
  if (typeof x === "number") return x;
  return Number(x);
}

export async function getPollAverages30d(): Promise<PollAverageRow[]> {
  const sb = supabase();
  const { data, error } = await sb
    .from("poll_average_30d_mv")
    .select("party_code, percentage_avg, n_polls, last_conducted_at, percentage_min_30d, percentage_max_30d")
    .order("percentage_avg", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    party_code: r.party_code as string,
    percentage_avg: toNum(r.percentage_avg),
    n_polls: r.n_polls as number,
    last_conducted_at: r.last_conducted_at as string,
    percentage_min_30d: toNum(r.percentage_min_30d),
    percentage_max_30d: toNum(r.percentage_max_30d),
  }));
}

export async function getPollTrendQuarterly(parties: string[] = [...TREND_DEFAULT_PARTIES]): Promise<PollTrendRow[]> {
  const sb = supabase();
  const { data, error } = await sb
    .from("poll_trend_quarterly_mv")
    .select("party_code, quarter_start, percentage_avg, percentage_min, percentage_max, n_polls")
    .in("party_code", parties)
    .order("quarter_start", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    party_code: r.party_code as string,
    quarter_start: r.quarter_start as string,
    percentage_avg: toNum(r.percentage_avg),
    percentage_min: toNum(r.percentage_min),
    percentage_max: toNum(r.percentage_max),
    n_polls: r.n_polls as number,
  })).filter((r) => isQuarterVisibleForParty(r.party_code, r.quarter_start));
}

export async function getRecentPolls(limit = 20): Promise<RecentPollRow[]> {
  const sb = supabase();
  const { data: polls, error } = await sb
    .from("polls")
    .select("id, pollster, conducted_at_start, conducted_at_end, sample_size, source_url")
    .eq("election_target", "sejm")
    .order("conducted_at_end", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = polls ?? [];
  if (rows.length === 0) return [];
  const pollsterCodes = Array.from(new Set(rows.map((p) => (p.pollster as string) ?? "").filter(Boolean)));
  const pollsterNames = new Map<string, string>();
  if (pollsterCodes.length > 0) {
    const { data: pollsters, error: eNames } = await sb
      .from("pollsters")
      .select("code, name_full")
      .in("code", pollsterCodes);
    if (eNames) throw eNames;
    for (const r of pollsters ?? []) {
      pollsterNames.set(
        r.code as string,
        ((r.name_full as string) ?? (r.code as string) ?? "").trim(),
      );
    }
  }
  const ids = rows.map((p) => p.id as number);
  const { data: results, error: e2 } = await sb
    .from("poll_results")
    .select("poll_id, party_code, percentage")
    .in("poll_id", ids);
  if (e2) throw e2;
  const byPoll = new Map<number, { party_code: string; percentage: number | null }[]>();
  for (const r of results ?? []) {
    const pid = r.poll_id as number;
    const arr = byPoll.get(pid) ?? [];
    arr.push({
      party_code: r.party_code as string,
      percentage: r.percentage === null ? null : toNum(r.percentage),
    });
    byPoll.set(pid, arr);
  }
  return rows.map((p) => ({
    poll_id: p.id as number,
    pollster: pollsterNames.get((p.pollster as string) ?? "") ?? ((p.pollster as string) ?? ""),
    pollster_code: (p.pollster as string) ?? "",
    conducted_at_start: p.conducted_at_start as string,
    conducted_at_end: p.conducted_at_end as string,
    sample_size: (p.sample_size as number | null) ?? null,
    source_url: (p.source_url as string) ?? "",
    results: (byPoll.get(p.id as number) ?? []).sort(
      (a, b) => (b.percentage ?? 0) - (a.percentage ?? 0)
    ),
  }));
}

export async function getPollsterSummary(): Promise<PollsterSummary[]> {
  const sb = supabase();
  // Two queries: pollster registry + counts from polls. Postgrest can't
  // do COUNT-GROUP-BY directly so aggregate in JS.
  const [{ data: pollsters, error: e1 }, { data: polls, error: e2 }] = await Promise.all([
    sb.from("pollsters").select("code, name_full, website"),
    sb.from("polls").select("pollster").eq("election_target", "sejm"),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const counts = new Map<string, number>();
  for (const r of polls ?? []) {
    const code = (r.pollster as string) ?? "";
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  const seen = new Map<string, PollsterSummary>();
  for (const p of pollsters ?? []) {
    const code = p.code as string;
    seen.set(code, {
      code,
      name_full: (p.name_full as string) ?? code,
      website: (p.website as string | null) ?? null,
      n_polls: counts.get(code) ?? 0,
    });
  }
  // Pollsters in `polls` but missing from registry — surface anyway.
  for (const [code, n] of counts) {
    if (!seen.has(code)) {
      seen.set(code, { code, name_full: code, website: null, n_polls: n });
    }
  }
  return Array.from(seen.values())
    .filter((p) => p.n_polls > 0)
    .sort((a, b) => b.n_polls - a.n_polls);
}
