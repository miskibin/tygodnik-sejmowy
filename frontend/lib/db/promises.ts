import "server-only";

import { unstable_cache } from "next/cache";
import { supabase } from "@/lib/supabase";

const PROMISES_REVALIDATE_SEC = 300;

const getEnrichedPromisesCached = unstable_cache(
  async () => fetchEnrichedPromises(),
  ["promises-enriched-all", "v1"],
  { revalidate: PROMISES_REVALIDATE_SEC },
);

// 5-status enum from migration 0027 CHECK constraint. Anything else stored is
// a DB-violation and should be rendered as "—".
export type PromiseStatus =
  | "fulfilled"
  | "in_progress"
  | "broken"
  | "contradicted_by_vote"
  | "no_action";

export const PROMISE_STATUSES: ReadonlyArray<PromiseStatus> = [
  "fulfilled",
  "in_progress",
  "broken",
  "contradicted_by_vote",
  "no_action",
];

// Citizen-facing party labels. DB stores compact codes (KO/L/Konf/P2050/PiS/PSL/TD).
export const PARTY_LABEL: Record<string, string> = {
  KO: "Koalicja Obywatelska",
  L: "Lewica",
  P2050: "Polska 2050",
  PSL: "PSL",
  TD: "Trzecia Droga",
  PiS: "PiS",
  Konf: "Konfederacja",
};

export const PARTY_SHORT: Record<string, string> = {
  KO: "KO",
  L: "Lewica",
  P2050: "P2050",
  PSL: "PSL",
  TD: "TD",
  PiS: "PiS",
  Konf: "Konfederacja",
};

// Bridge promises party_code → ClubBadge `klub` key (atlas constants).
export const PARTY_TO_KLUB: Record<string, string> = {
  KO: "KO",
  L: "Lewica",
  P2050: "Polska2050",
  PSL: "PSL-TD",
  TD: "PSL-TD",
  PiS: "PiS",
  Konf: "Konfederacja",
};

// Plan default: 5 main parties as primary cards, everything else rolled into "Pozostałe".
export const PRIMARY_PARTIES: ReadonlyArray<string> = ["KO", "PiS", "Konf", "L", "PSL"];

export function partyLabel(code: string): string {
  return PARTY_LABEL[code] ?? code;
}
export function partyShort(code: string): string {
  return PARTY_SHORT[code] ?? code;
}

export function statusLabel(status: string | null): string {
  switch (status) {
    case "fulfilled":
      return "zrealizowane";
    case "in_progress":
      return "w realizacji";
    case "broken":
      return "złamane";
    case "contradicted_by_vote":
      return "sprzeczne z głosem";
    case "no_action":
      return "brak działań";
    default:
      return "—";
  }
}

// Status → indicator color (token). Green = delivered, amber = active, red =
// broken/contradicted, muted = silent.
export function statusColor(status: string | null): string {
  switch (status) {
    case "fulfilled":
      return "var(--success)";
    case "in_progress":
      return "var(--warning)";
    case "broken":
    case "contradicted_by_vote":
      return "var(--destructive)";
    case "no_action":
      return "var(--muted-foreground)";
    default:
      return "var(--muted-foreground)";
  }
}

// One enriched ledger row with everything the cards/detail need.
export type PromiseRow = {
  id: number;
  partyCode: string | null;
  slug: string | null;
  title: string;
  status: string | null;
  sourceYear: number | null;
  sourceUrl: string | null;
  sourceQuote: string | null;
  confidence: number | null;
  // top confirmed match (highest similarity), if any
  matchCount: number;
  topMatchTerm: number | null;
  topMatchNumber: string | null;
  topMatchSimilarity: number | null;
  topMatchRationale: string | null;
  topMatchPrintTitle: string | null;
  topMatchPrintTopic: string | null;
};

export type PromiseDashboardRow = {
  partyCode: string;
  fulfilled: number;
  in_progress: number;
  broken: number;
  contradicted_by_vote: number;
  no_action: number;
  total: number;
};

export type PromiseFilters = {
  parties?: string[];
  statuses?: string[];
  topics?: string[];
  search?: string;
};

// Internal helper — fetch base promises + enrich with top-1 confirmed match.
async function fetchEnrichedPromises(): Promise<PromiseRow[]> {
  const sb = supabase();

  const { data: promiseRows, error: pe } = await sb
    .from("promises")
    .select(
      "id, party_code, slug, title, status, source_year, source_url, source_quote, confidence",
    )
    .order("source_year", { ascending: false })
    .order("title", { ascending: true });
  if (pe) throw pe;
  const promises = (promiseRows ?? []) as Array<Record<string, unknown>>;
  if (promises.length === 0) return [];

  const ids = promises.map((p) => p.id as number);
  const { data: matchRows, error: me } = await sb
    .from("promise_print_candidates")
    .select(
      "promise_id, print_term, print_number, similarity, match_rationale",
    )
    .eq("match_status", "confirmed")
    .in("promise_id", ids);
  if (me) throw me;

  type MatchAccum = {
    count: number;
    topTerm: number | null;
    topNumber: string | null;
    topSim: number | null;
    topRationale: string | null;
  };
  const byPromise = new Map<number, MatchAccum>();
  for (const r of (matchRows ?? []) as Array<Record<string, unknown>>) {
    const pid = r.promise_id as number;
    const term = (r.print_term as number | null) ?? null;
    const num = (r.print_number as string | null) ?? null;
    const sim = r.similarity == null ? null : Number(r.similarity);
    const rat = (r.match_rationale as string | null) ?? null;
    const acc = byPromise.get(pid);
    if (!acc) {
      byPromise.set(pid, {
        count: 1,
        topTerm: term,
        topNumber: num,
        topSim: sim,
        topRationale: rat,
      });
    } else {
      acc.count += 1;
      if ((sim ?? 0) > (acc.topSim ?? 0)) {
        acc.topTerm = term;
        acc.topNumber = num;
        acc.topSim = sim;
        acc.topRationale = rat;
      }
    }
  }

  // Pull short_title + topic for the top match prints in one round-trip.
  type PrintKey = string;
  const printKey = (term: number, num: string): PrintKey => `${term}__${num}`;
  const printsToFetch = new Map<PrintKey, { term: number; num: string }>();
  for (const acc of byPromise.values()) {
    if (acc.topTerm != null && acc.topNumber != null) {
      printsToFetch.set(printKey(acc.topTerm, acc.topNumber), {
        term: acc.topTerm,
        num: acc.topNumber,
      });
    }
  }
  const printMeta = new Map<PrintKey, { title: string | null; topic: string | null }>();
  if (printsToFetch.size > 0) {
    // Group by term for efficient `in('number', [...])` filter per term.
    const byTerm = new Map<number, string[]>();
    for (const { term, num } of printsToFetch.values()) {
      const list = byTerm.get(term) ?? [];
      list.push(num);
      byTerm.set(term, list);
    }
    for (const [term, nums] of byTerm.entries()) {
      const { data: rows, error } = await sb
        .from("prints")
        .select("term, number, short_title, title, topic")
        .eq("term", term)
        .in("number", nums);
      if (error) throw error;
      for (const r of (rows ?? []) as Array<Record<string, unknown>>) {
        const t = r.term as number;
        const n = r.number as string;
        const title =
          (r.short_title as string | null) ?? (r.title as string | null) ?? null;
        const topic = (r.topic as string | null) ?? null;
        printMeta.set(printKey(t, n), { title, topic });
      }
    }
  }

  return promises.map((p) => {
    const id = p.id as number;
    const m = byPromise.get(id);
    const pkey =
      m && m.topTerm != null && m.topNumber != null
        ? printKey(m.topTerm, m.topNumber)
        : null;
    const meta = pkey ? printMeta.get(pkey) ?? null : null;
    return {
      id,
      partyCode: (p.party_code as string) ?? null,
      slug: (p.slug as string) ?? null,
      title: (p.title as string) ?? "",
      status: (p.status as string) ?? null,
      sourceYear: (p.source_year as number) ?? null,
      sourceUrl: (p.source_url as string) ?? null,
      sourceQuote: (p.source_quote as string) ?? null,
      confidence: p.confidence == null ? null : Number(p.confidence),
      matchCount: m?.count ?? 0,
      topMatchTerm: m?.topTerm ?? null,
      topMatchNumber: m?.topNumber ?? null,
      topMatchSimilarity: m?.topSim ?? null,
      topMatchRationale: m?.topRationale ?? null,
      topMatchPrintTitle: meta?.title ?? null,
      topMatchPrintTopic: meta?.topic ?? null,
    } satisfies PromiseRow;
  });
}

const STATUS_RANK: Record<string, number> = {
  fulfilled: 0,
  in_progress: 1,
  broken: 2,
  contradicted_by_vote: 3,
  no_action: 4,
};
function statusRank(s: string | null): number {
  if (!s) return 9;
  return STATUS_RANK[s] ?? 8;
}

function defaultSort(rows: PromiseRow[]): PromiseRow[] {
  return rows.sort((a, b) => {
    const sr = statusRank(a.status) - statusRank(b.status);
    if (sr !== 0) return sr;
    const ya = a.sourceYear ?? 0;
    const yb = b.sourceYear ?? 0;
    if (yb !== ya) return yb - ya;
    return a.title.localeCompare(b.title, "pl");
  });
}

// Default ledger — used by feed; respects optional filters. Server-side joins
// already trimmed to confirmed matches; party/status filtering is in-memory.
export async function getPromisesFiltered(
  filters: PromiseFilters = {},
): Promise<PromiseRow[]> {
  const all = await getEnrichedPromisesCached();
  const parties = filters.parties && filters.parties.length > 0 ? new Set(filters.parties) : null;
  const statuses = filters.statuses && filters.statuses.length > 0 ? new Set(filters.statuses) : null;
  const topics = filters.topics && filters.topics.length > 0 ? new Set(filters.topics) : null;
  const search = (filters.search ?? "").trim().toLocaleLowerCase("pl");

  const filtered = all.filter((r) => {
    if (parties && (!r.partyCode || !parties.has(r.partyCode))) return false;
    if (statuses && (!r.status || !statuses.has(r.status))) return false;
    if (topics) {
      // Only promises whose top-match print topic falls in the set.
      if (!r.topMatchPrintTopic || !topics.has(r.topMatchPrintTopic)) return false;
    }
    if (search) {
      const hay = `${r.title}\n${r.sourceQuote ?? ""}`.toLocaleLowerCase("pl");
      if (!hay.includes(search)) return false;
    }
    return true;
  });
  return defaultSort(filtered);
}

// Per-party rollup with the 5-status breakdown for the dashboard cards.
async function loadPromiseDashboard(): Promise<PromiseDashboardRow[]> {
  const sb = supabase();
  const { data, error } = await sb.from("promises").select("party_code, status");
  if (error) throw error;
  const rows = (data ?? []) as Array<{ party_code: string | null; status: string | null }>;
  const byParty = new Map<string, PromiseDashboardRow>();
  for (const r of rows) {
    const code = r.party_code ?? "?";
    const acc =
      byParty.get(code) ??
      ({
        partyCode: code,
        fulfilled: 0,
        in_progress: 0,
        broken: 0,
        contradicted_by_vote: 0,
        no_action: 0,
        total: 0,
      } satisfies PromiseDashboardRow);
    acc.total += 1;
    switch (r.status) {
      case "fulfilled":
        acc.fulfilled += 1;
        break;
      case "in_progress":
        acc.in_progress += 1;
        break;
      case "broken":
        acc.broken += 1;
        break;
      case "contradicted_by_vote":
        acc.contradicted_by_vote += 1;
        break;
      case "no_action":
        acc.no_action += 1;
        break;
      default:
        break;
    }
    byParty.set(code, acc);
  }
  return [...byParty.values()].sort((a, b) => b.total - a.total);
}

export function getPromiseDashboard(): Promise<PromiseDashboardRow[]> {
  return unstable_cache(
    async () => loadPromiseDashboard(),
    ["promise-dashboard", "v1"],
    { revalidate: PROMISES_REVALIDATE_SEC },
  )();
}

// Distinct party codes present in the table (legacy helper; preserved so any
// external imports don't break — used to build filter chips).
async function loadPartyCodesWithCounts(): Promise<Array<{ code: string; count: number }>> {
  const sb = supabase();
  const { data, error } = await sb.from("promises").select("party_code");
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const r of (data ?? []) as Array<{ party_code: string | null }>) {
    if (!r.party_code) continue;
    counts.set(r.party_code, (counts.get(r.party_code) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count);
}

export function getPartyCodesWithCounts(): Promise<Array<{ code: string; count: number }>> {
  return unstable_cache(
    async () => loadPartyCodesWithCounts(),
    ["promise-party-counts", "v1"],
    { revalidate: PROMISES_REVALIDATE_SEC },
  )();
}

// Detail page — full record + all confirmed candidates + voting timeline.
export type PromiseEvidence = {
  printTerm: number;
  printNumber: string;
  printShortTitle: string | null;
  printTitle: string | null;
  printTopic: string | null;
  similarity: number | null;
  rationale: string | null;
  rerankedAt: string | null;
};

export type PromiseVotingEntry = {
  votingId: number;
  term: number;
  date: string | null;
  title: string | null;
  printId: number | null;
  printShortTitle: string | null;
  result: "passed" | "failed" | "pending" | null;
};

export type PromiseDetail = PromiseRow & {
  normalizedText: string | null;
  evidence: PromiseEvidence[];
  votings: PromiseVotingEntry[];
  related: Array<Pick<PromiseRow, "id" | "partyCode" | "slug" | "title" | "status">>;
};

async function loadPromiseDetail(
  partyCode: string,
  slug: string,
): Promise<PromiseDetail | null> {
  const sb = supabase();
  const { data, error } = await sb
    .from("promises")
    .select(
      "id, party_code, slug, title, normalized_text, status, source_year, source_url, source_quote, confidence",
    )
    .eq("party_code", partyCode)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return buildDetail(data as Record<string, unknown>);
}

export function getPromiseDetail(
  partyCode: string,
  slug: string,
): Promise<PromiseDetail | null> {
  return unstable_cache(
    async () => loadPromiseDetail(partyCode, slug),
    ["promise-detail", partyCode, slug],
    { revalidate: PROMISES_REVALIDATE_SEC },
  )();
}

async function loadPromiseDetailById(id: number): Promise<PromiseDetail | null> {
  const sb = supabase();
  const { data, error } = await sb
    .from("promises")
    .select(
      "id, party_code, slug, title, normalized_text, status, source_year, source_url, source_quote, confidence",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return buildDetail(data as Record<string, unknown>);
}

export function getPromiseDetailById(id: number): Promise<PromiseDetail | null> {
  return unstable_cache(
    async () => loadPromiseDetailById(id),
    ["promise-detail-id", String(id)],
    { revalidate: PROMISES_REVALIDATE_SEC },
  )();
}

async function buildDetail(p: Record<string, unknown>): Promise<PromiseDetail> {
  const sb = supabase();
  const id = p.id as number;
  const partyCode = (p.party_code as string) ?? null;

  const [evidenceRes, votingRes, relatedRes] = await Promise.all([
    sb
      .from("promise_print_candidates")
      .select(
        "print_term, print_number, similarity, match_rationale, reranked_at",
      )
      .eq("promise_id", id)
      .eq("match_status", "confirmed")
      .order("similarity", { ascending: false }),
    sb
      .from("voting_promise_link_mv")
      .select("voting_id, term, print_id, print_short_title")
      .eq("promise_id", id),
    partyCode
      ? sb
          .from("promises")
          .select("id, party_code, slug, title, status")
          .eq("party_code", partyCode)
          .neq("id", id)
          .order("source_year", { ascending: false })
          .limit(6)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
  ]);
  if (evidenceRes.error) throw evidenceRes.error;
  if (votingRes.error) throw votingRes.error;
  if ("error" in relatedRes && relatedRes.error) throw relatedRes.error;

  const evidenceRaw = (evidenceRes.data ?? []) as Array<Record<string, unknown>>;
  // Pull print short_title + topic for evidence rows.
  const printMeta = new Map<string, { title: string | null; short: string | null; topic: string | null }>();
  if (evidenceRaw.length > 0) {
    const byTerm = new Map<number, string[]>();
    for (const r of evidenceRaw) {
      const t = r.print_term as number;
      const n = r.print_number as string;
      const list = byTerm.get(t) ?? [];
      list.push(n);
      byTerm.set(t, list);
    }
    for (const [term, nums] of byTerm.entries()) {
      const { data, error } = await sb
        .from("prints")
        .select("term, number, short_title, title, topic")
        .eq("term", term)
        .in("number", nums);
      if (error) throw error;
      for (const r of (data ?? []) as Array<Record<string, unknown>>) {
        const t = r.term as number;
        const n = r.number as string;
        printMeta.set(`${t}__${n}`, {
          short: (r.short_title as string | null) ?? null,
          title: (r.title as string | null) ?? null,
          topic: (r.topic as string | null) ?? null,
        });
      }
    }
  }

  const evidence: PromiseEvidence[] = evidenceRaw.map((r) => {
    const t = r.print_term as number;
    const n = r.print_number as string;
    const meta = printMeta.get(`${t}__${n}`) ?? null;
    return {
      printTerm: t,
      printNumber: n,
      printShortTitle: meta?.short ?? null,
      printTitle: meta?.title ?? null,
      printTopic: meta?.topic ?? null,
      similarity: r.similarity == null ? null : Number(r.similarity),
      rationale: (r.match_rationale as string | null) ?? null,
      rerankedAt: (r.reranked_at as string | null) ?? null,
    };
  });

  // Voting metadata join.
  const votingRaw = (votingRes.data ?? []) as Array<Record<string, unknown>>;
  const votingIds = [...new Set(votingRaw.map((v) => v.voting_id as number))];
  const votingMeta = new Map<number, { date: string | null; title: string | null; yes: number; no: number }>();
  if (votingIds.length > 0) {
    const { data: vData, error: vErr } = await sb
      .from("votings")
      .select("id, date, title, yes, no")
      .in("id", votingIds);
    if (vErr) throw vErr;
    for (const v of (vData ?? []) as Array<Record<string, unknown>>) {
      votingMeta.set(v.id as number, {
        date: (v.date as string | null) ?? null,
        title: (v.title as string | null) ?? null,
        yes: typeof v.yes === "number" ? v.yes : Number(v.yes ?? 0),
        no: typeof v.no === "number" ? v.no : Number(v.no ?? 0),
      });
    }
  }

  const votings: PromiseVotingEntry[] = votingRaw.map((r) => {
    const vid = r.voting_id as number;
    const meta = votingMeta.get(vid);
    const yes = meta?.yes ?? 0;
    const no = meta?.no ?? 0;
    let result: "passed" | "failed" | "pending" | null = null;
    if (yes + no > 0) result = yes > no ? "passed" : "failed";
    return {
      votingId: vid,
      term: r.term as number,
      date: meta?.date ?? null,
      title: meta?.title ?? null,
      printId: (r.print_id as number | null) ?? null,
      printShortTitle: (r.print_short_title as string | null) ?? null,
      result,
    };
  });
  votings.sort((a, b) => {
    const da = a.date ?? "";
    const db = b.date ?? "";
    return db.localeCompare(da);
  });

  const related = ((relatedRes.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as number,
    partyCode: (r.party_code as string) ?? null,
    slug: (r.slug as string) ?? null,
    title: (r.title as string) ?? "",
    status: (r.status as string) ?? null,
  }));

  return {
    id,
    partyCode,
    slug: (p.slug as string) ?? null,
    title: (p.title as string) ?? "",
    status: (p.status as string) ?? null,
    sourceYear: (p.source_year as number) ?? null,
    sourceUrl: (p.source_url as string) ?? null,
    sourceQuote: (p.source_quote as string) ?? null,
    confidence: p.confidence == null ? null : Number(p.confidence),
    normalizedText: (p.normalized_text as string | null) ?? null,
    matchCount: evidence.length,
    topMatchTerm: evidence[0]?.printTerm ?? null,
    topMatchNumber: evidence[0]?.printNumber ?? null,
    topMatchSimilarity: evidence[0]?.similarity ?? null,
    topMatchRationale: evidence[0]?.rationale ?? null,
    topMatchPrintTitle: evidence[0]?.printShortTitle ?? evidence[0]?.printTitle ?? null,
    topMatchPrintTopic: evidence[0]?.printTopic ?? null,
    evidence,
    votings,
    related,
  };
}

// Ledger row shape — back-compat export for any external import. The fields
// match the old `getPromiseLedger()` contract; the dead 9-status enum was
// removed, but the row shape is a strict superset (matchCount preserved).
export type PromiseLedgerRow = {
  id: number;
  partyCode: string | null;
  slug: string | null;
  title: string;
  status: string | null;
  sourceYear: number | null;
  sourceUrl: string | null;
  matchCount: number;
  firstMatchTerm: number | null;
  firstMatchNumber: string | null;
};

export async function getPromiseLedger(): Promise<PromiseLedgerRow[]> {
  const rows = await getEnrichedPromisesCached();
  const sorted = defaultSort(rows);
  return sorted.map((r) => ({
    id: r.id,
    partyCode: r.partyCode,
    slug: r.slug,
    title: r.title,
    status: r.status,
    sourceYear: r.sourceYear,
    sourceUrl: r.sourceUrl,
    matchCount: r.matchCount,
    firstMatchTerm: r.topMatchTerm,
    firstMatchNumber: r.topMatchNumber,
  }));
}
