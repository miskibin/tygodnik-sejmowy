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

function isRetryableSupabaseError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { code?: unknown; message?: unknown };
  return maybe.code === "PGRST002"
    || (typeof maybe.message === "string" && maybe.message.includes("schema cache"));
}

async function withSupabaseRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryableSupabaseError(error) || i === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** i));
    }
  }
  throw lastError;
}

function quarterStartOf(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  const month = d.getUTCMonth();
  const quarterMonth = Math.floor(month / 3) * 3;
  return `${d.getUTCFullYear()}-${String(quarterMonth + 1).padStart(2, "0")}-01`;
}

function normalizeTrendRowResults(dateIso: string, source: Map<string, number>): Map<string, number> {
  const out = new Map(source);

  // Pre-2025-06-17 Wikipedia rows often collapse Polska2050+PSL into one TD
  // cell via colspan=2. Historical rows already loaded before the parser fix
  // are shifted right from that point onward, which is how Razem inherited
  // Konfederacja's ~14-15% values.
  if (dateIso < "2025-06-17"
    && out.has("Polska2050")
    && out.has("PSL")
    && out.has("Lewica")
    && out.has("Razem")
    && out.has("Konfederacja")
    && !out.has("KKP")) {
    const p2050 = out.get("Polska2050");
    const psl = out.get("PSL");
    const lewica = out.get("Lewica");
    const razem = out.get("Razem");
    const konf = out.get("Konfederacja");
    if (p2050 != null) out.set("TD", p2050);
    if (psl != null) out.set("Lewica", psl);
    if (lewica != null) out.set("Razem", lewica);
    if (razem != null) out.set("Konfederacja", razem);
    if (konf != null) out.set("KKP", konf);
    out.delete("Polska2050");
    out.delete("PSL");
  }

  // Pre-2024-10-27 rows often collapse Lewica+Razem into one shared cell. The
  // stale imported rows therefore shift Konfederacja into Razem.
  if (dateIso < "2024-10-27"
    && out.has("Lewica")
    && out.has("Razem")
    && !out.has("Konfederacja")) {
    const shiftedKonf = out.get("Razem");
    if (shiftedKonf != null) out.set("Konfederacja", shiftedKonf);
    out.delete("Razem");
  }

  return out;
}

export async function getPollAverages30d(): Promise<PollAverageRow[]> {
  const sb = supabase();
  const { data, error } = await withSupabaseRetry(async () => await sb
    .from("poll_average_30d_mv")
    .select("party_code, percentage_avg, n_polls, last_conducted_at, percentage_min_30d, percentage_max_30d")
    .order("percentage_avg", { ascending: false }));
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
  const { data: polls, error: e1 } = await withSupabaseRetry(async () => await sb
    .from("polls")
    .select("id, conducted_at_end")
    .eq("election_target", "sejm")
    .gte("conducted_at_end", "2023-10-15")
    .order("conducted_at_end", { ascending: true }));
  if (e1) throw e1;
  const pollRows = polls ?? [];
  if (pollRows.length === 0) return [];

  const ids = pollRows.map((p) => p.id as number);
  const { data: results, error: e2 } = await withSupabaseRetry(async () => await sb
    .from("poll_results")
    .select("poll_id, party_code, percentage")
    .in("poll_id", ids));
  if (e2) throw e2;

  const resultsByPoll = new Map<number, Map<string, number>>();
  for (const row of results ?? []) {
    if (row.percentage == null) continue;
    const pollId = row.poll_id as number;
    const partyCode = row.party_code as string;
    const pct = toNum(row.percentage);
    const bucket = resultsByPoll.get(pollId) ?? new Map<string, number>();
    bucket.set(partyCode, pct);
    resultsByPoll.set(pollId, bucket);
  }

  const wanted = new Set(parties);
  const aggregates = new Map<string, { party_code: string; quarter_start: string; sum: number; min: number; max: number; n: number }>();
  for (const poll of pollRows) {
    const pollId = poll.id as number;
    const dateIso = poll.conducted_at_end as string;
    const normalized = normalizeTrendRowResults(dateIso, resultsByPoll.get(pollId) ?? new Map());
    const quarter = quarterStartOf(dateIso);
    for (const party of wanted) {
      const pct = normalized.get(party);
      if (pct == null) continue;
      const key = `${party}__${quarter}`;
      const acc = aggregates.get(key) ?? {
        party_code: party,
        quarter_start: quarter,
        sum: 0,
        min: pct,
        max: pct,
        n: 0,
      };
      acc.sum += pct;
      acc.min = Math.min(acc.min, pct);
      acc.max = Math.max(acc.max, pct);
      acc.n += 1;
      aggregates.set(key, acc);
    }
  }

  return Array.from(aggregates.values())
    .map((r) => ({
      party_code: r.party_code,
      quarter_start: r.quarter_start,
      percentage_avg: Number((r.sum / r.n).toFixed(2)),
      percentage_min: Number(r.min.toFixed(2)),
      percentage_max: Number(r.max.toFixed(2)),
      n_polls: r.n,
    }))
    .filter((r) => isQuarterVisibleForParty(r.party_code, r.quarter_start))
    .sort((a, b) => a.quarter_start.localeCompare(b.quarter_start) || a.party_code.localeCompare(b.party_code));
}

export async function getRecentPolls(limit = 20): Promise<RecentPollRow[]> {
  const sb = supabase();
  const { data: polls, error } = await withSupabaseRetry(async () => await sb
    .from("polls")
    .select("id, pollster, conducted_at_start, conducted_at_end, sample_size, source_url")
    .eq("election_target", "sejm")
    .order("conducted_at_end", { ascending: false })
    .limit(limit));
  if (error) throw error;
  const rows = polls ?? [];
  if (rows.length === 0) return [];
  const pollsterCodes = Array.from(new Set(rows.map((p) => (p.pollster as string) ?? "").filter(Boolean)));
  const pollsterNames = new Map<string, string>();
  if (pollsterCodes.length > 0) {
    const { data: pollsters, error: eNames } = await withSupabaseRetry(async () => await sb
      .from("pollsters")
      .select("code, name_full")
      .in("code", pollsterCodes));
    if (eNames) throw eNames;
    for (const r of pollsters ?? []) {
      pollsterNames.set(
        r.code as string,
        ((r.name_full as string) ?? (r.code as string) ?? "").trim(),
      );
    }
  }
  const ids = rows.map((p) => p.id as number);
  const { data: results, error: e2 } = await withSupabaseRetry(async () => await sb
    .from("poll_results")
    .select("poll_id, party_code, percentage")
    .in("poll_id", ids));
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
    withSupabaseRetry(async () => await sb.from("pollsters").select("code, name_full, website")),
    withSupabaseRetry(async () => await sb.from("polls").select("pollster").eq("election_target", "sejm")),
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
