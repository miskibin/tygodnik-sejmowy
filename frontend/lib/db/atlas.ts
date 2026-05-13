import "server-only";

import { supabase } from "@/lib/supabase";

// Re-export client-safe constants so existing server-side imports keep
// working. Client components should import from `@/lib/atlas/constants`
// directly (those modules can't pull in `server-only`).
import {
  KLUB_COLORS,
  KLUB_LABELS,
  TOPICS_ENUM,
  type TopicId,
} from "@/lib/atlas/constants";

export { KLUB_COLORS, KLUB_LABELS, TOPICS_ENUM };
export type { TopicId };

// Klubs we treat as "main" (>=10 members in any current club snapshot).
// Smaller circles + niezrzeszeni dilute heatmap signal — exclude.
const MAIN_KLUBS = ["KO", "PiS", "Polska2050", "Lewica", "PSL-TD", "Konfederacja", "Razem"] as const;

// ──────────────────────────────────────────────────────────────────────────
// 2. HEATMAP — % vote agreement between every klub pair.
// Reads pre-aggregated klub_pair_agreement_mv (mig 0051) — replaces the
// old in-process cross-tab over voting_by_club which timed out on Vercel.
// ──────────────────────────────────────────────────────────────────────────
export type HeatmapCell = {
  a: string;          // klub short
  b: string;
  agreement: number;  // 0..1
  votings: number;    // n joint votings counted
};

export type KlubHeatmap = {
  klubs: string[];           // axis order
  cells: HeatmapCell[];      // upper+lower triangle filled (symmetric)
  totalVotings: number;
};

export async function getKlubHeatmap(term = 10): Promise<KlubHeatmap> {
  const sb = supabase();
  const { data, error } = await sb
    .from("klub_pair_agreement_mv")
    .select("club_a_short, club_b_short, votings_with_both, votings_agreed, agreement_pct")
    .eq("term", term)
    .in("club_a_short", [...MAIN_KLUBS])
    .in("club_b_short", [...MAIN_KLUBS]);
  if (error) throw error;

  type Row = {
    club_a_short: string;
    club_b_short: string;
    votings_with_both: number;
    votings_agreed: number;
    agreement_pct: number | string;
  };
  const rows = (data ?? []) as Row[];

  const klubs = [...MAIN_KLUBS];
  const cells: HeatmapCell[] = [];
  const lookup = new Map<string, Row>();
  for (const r of rows) lookup.set(`${r.club_a_short}|${r.club_b_short}`, r);

  let maxVotings = 0;
  for (const a of klubs) {
    for (const b of klubs) {
      if (a === b) {
        cells.push({ a, b, agreement: 1, votings: 0 });
        continue;
      }
      const direct = lookup.get(`${a}|${b}`);
      const reverse = lookup.get(`${b}|${a}`);
      const r = direct ?? reverse;
      if (!r) {
        cells.push({ a, b, agreement: 0, votings: 0 });
        continue;
      }
      const pct = typeof r.agreement_pct === "string" ? parseFloat(r.agreement_pct) : r.agreement_pct;
      cells.push({
        a, b,
        agreement: (pct ?? 0) / 100,
        votings: r.votings_with_both ?? 0,
      });
      if ((r.votings_with_both ?? 0) > maxVotings) maxVotings = r.votings_with_both ?? 0;
    }
  }

  // totalVotings = max votings_with_both across pairs (best proxy for sample
  // size without requiring an extra round-trip to count(distinct voting_id)).
  return { klubs, cells, totalVotings: maxVotings };
}

// ──────────────────────────────────────────────────────────────────────────
// 5. PARTY DISCIPLINE — % of klub members voting with klub majority,
// averaged across all votings the klub participated in (>=5 voting members).
// ──────────────────────────────────────────────────────────────────────────
export type DisciplineRow = {
  klub: string;
  loyalty: number;       // 0..1, mean of per-voting loyalty
  votings: number;       // n votings counted (>=5 voting members)
  totalMembersAvg: number; // avg total members per voting (rough klub size)
  dissents: number;      // total member-votes against the klub line across votings
};

export async function getPartyDiscipline(term = 10): Promise<DisciplineRow[]> {
  const sb = supabase();
  const { data, error } = await sb
    .from("voting_by_club")
    .select("club_short, yes, no, abstain, total")
    .eq("term", term)
    .in("club_short", [...MAIN_KLUBS]);
  if (error) throw error;

  type Acc = { sumLoyalty: number; n: number; sumTotal: number; dissents: number };
  const acc = new Map<string, Acc>();

  for (const r of (data ?? []) as Array<{
    club_short: string; yes: number; no: number; abstain: number; total: number;
  }>) {
    const yes = r.yes ?? 0;
    const no = r.no ?? 0;
    const abstain = r.abstain ?? 0;
    const voting = yes + no + abstain;
    if (voting < 5) continue; // too thin to define a "klub line"
    const winner = Math.max(yes, no, abstain);
    const loyalty = winner / voting;
    const a = acc.get(r.club_short) ?? { sumLoyalty: 0, n: 0, sumTotal: 0, dissents: 0 };
    a.sumLoyalty += loyalty;
    a.n += 1;
    a.sumTotal += r.total ?? 0;
    a.dissents += voting - winner;
    acc.set(r.club_short, a);
  }

  const rows: DisciplineRow[] = [];
  for (const k of MAIN_KLUBS) {
    const a = acc.get(k);
    if (!a || a.n === 0) continue;
    rows.push({
      klub: k,
      loyalty: a.sumLoyalty / a.n,
      votings: a.n,
      totalMembersAvg: a.sumTotal / a.n,
      dissents: a.dissents,
    });
  }
  rows.sort((x, y) => y.loyalty - x.loyalty);
  return rows;
}

// ──────────────────────────────────────────────────────────────────────────
// 6. TOPIC TRENDS — distribution of persona_tags across time buckets.
// Bucket = month of `change_date` (the data span is currently Q1+Q2 2026 only;
// per-month gives 4-6 columns of signal). Stacked share per bucket.
// ──────────────────────────────────────────────────────────────────────────
// TOPICS_ENUM + TopicId moved to lib/atlas/constants.ts and re-exported above.

export type TopicTrend = {
  buckets: string[];               // "2024-Q1" etc, ascending
  topics: readonly TopicId[];      // fixed enum order
  shares: number[][];              // [bucketIdx][topicIdx] = 0..1 (rows sum to 1)
  totalsPerBucket: number[];       // n prints contributing per bucket
};

function quarterOf(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `${y}-Q${q}`;
}

export async function getTopicTrends(term = 10): Promise<TopicTrend> {
  const sb = supabase();
  // Read from prints.topic enum (mig 0052 + 0052 backfill A8).
  const { data, error } = await sb
    .from("prints")
    .select("change_date, document_date, topic")
    .eq("term", term)
    .eq("document_category", "projekt_ustawy")
    .eq("is_meta_document", false)
    .eq("is_procedural", false)
    .not("topic", "is", null);
  if (error) throw error;

  type Row = { change_date: string | null; document_date: string | null; topic: TopicId | null };
  const rows = (data ?? []) as Row[];

  const topicIdx = new Map(TOPICS_ENUM.map((t, i) => [t, i] as const));
  const bucketCounts = new Map<string, number[]>();
  for (const r of rows) {
    const iso = r.change_date ?? r.document_date;
    if (!iso) continue;
    const bucket = quarterOf(iso);
    if (!bucket) continue;
    const arr = bucketCounts.get(bucket) ?? new Array(TOPICS_ENUM.length).fill(0);
    const idx = r.topic ? topicIdx.get(r.topic) : undefined;
    if (idx === undefined) {
      arr[topicIdx.get("inne")!] += 1;
    } else {
      arr[idx] += 1;
    }
    bucketCounts.set(bucket, arr);
  }

  const buckets = [...bucketCounts.keys()].sort();
  const shares: number[][] = [];
  const totalsPerBucket: number[] = [];
  for (const b of buckets) {
    const arr = bucketCounts.get(b) ?? [];
    const total = arr.reduce((s, v) => s + v, 0);
    totalsPerBucket.push(total);
    shares.push(arr.map((v) => (total > 0 ? v / total : 0)));
  }

  return { buckets, topics: TOPICS_ENUM, shares, totalsPerBucket };
}

// ──────────────────────────────────────────────────────────────────────────
// 1. MAP — district_klub_stats view (mig 0053 A2) gives dominant klub +
// turnout + mp_count + avg_age per district_num. Coordinates stay hardcoded
// (city centroids — no GeoJSON in repo).
// ──────────────────────────────────────────────────────────────────────────
export type MapDistrict = {
  id: number;
  name: string;
  klub: string;          // dominant
  turnout: number;       // %
  mpCount: number | null;
  avgAge: number | null;
  lon: number;
  lat: number;
  isMock: boolean;       // true = klub/turnout fabricated; false = from view
};

export type MapData = { districts: MapDistrict[]; isMock: boolean };

// Hardcoded coords + fallback klub assignment (used when view returns no row
// for a district). Lifted from mockup; coords are real city centroids.
const OKREGI_COORDS: Array<[number, string, string, number, number, number]> = [
  [1, "Legnica", "KO", 91, 16.16, 51.21],
  [2, "Wałbrzych", "KO", 88, 16.28, 50.78],
  [3, "Wrocław", "KO", 93, 17.04, 51.11],
  [4, "Bydgoszcz", "PiS", 86, 18.0, 53.12],
  [5, "Toruń", "PiS", 82, 18.6, 53.01],
  [6, "Lublin", "PiS", 88, 22.57, 51.25],
  [7, "Chełm", "PiS", 79, 23.47, 51.14],
  [8, "Zielona Góra", "KO", 90, 15.51, 51.94],
  [9, "Łódź", "KO", 92, 19.46, 51.76],
  [10, "Piotrków", "PiS", 83, 19.7, 51.4],
  [11, "Sieradz", "KO", 85, 18.73, 51.6],
  [12, "Chrzanów", "KO", 88, 19.4, 50.14],
  [13, "Kraków", "Lewica", 94, 19.94, 50.06],
  [14, "Nowy Sącz", "PiS", 76, 20.69, 49.62],
  [15, "Tarnów", "PiS", 81, 20.99, 50.01],
  [16, "Płock", "PSL-TD", 87, 19.71, 52.55],
  [17, "Radom", "PiS", 84, 21.15, 51.4],
  [18, "Siedlce", "PiS", 80, 22.27, 52.17],
  [19, "Warszawa I", "KO", 95, 21.01, 52.23],
  [20, "Warszawa II", "KO", 93, 21.1, 52.3],
  [21, "Opole", "KO", 89, 17.92, 50.67],
  [22, "Krosno", "PiS", 78, 21.77, 49.69],
  [23, "Rzeszów", "PiS", 82, 22.0, 50.04],
  [24, "Białystok", "PiS", 83, 23.16, 53.13],
  [25, "Gdańsk", "KO", 92, 18.65, 54.35],
  [26, "Gdynia", "KO", 91, 18.53, 54.52],
  [27, "Bielsko-Biała", "KO", 90, 19.04, 49.82],
  [28, "Częstochowa", "PiS", 82, 19.12, 50.81],
  [29, "Katowice", "KO", 91, 19.02, 50.27],
  [30, "Rybnik", "KO", 86, 18.55, 50.1],
  [31, "Sosnowiec", "Lewica", 93, 19.13, 50.29],
  [32, "Katowice II", "KO", 89, 19.06, 50.2],
  [33, "Kielce", "PiS", 85, 20.63, 50.87],
  [34, "Elbląg", "PiS", 79, 19.4, 54.16],
  [35, "Olsztyn", "PiS", 81, 20.49, 53.78],
  [36, "Kalisz", "KO", 87, 18.08, 51.76],
  [37, "Konin", "PSL-TD", 85, 18.25, 52.22],
  [38, "Piła", "KO", 86, 16.74, 53.15],
  [39, "Poznań", "KO", 93, 16.93, 52.41],
  [40, "Koszalin", "KO", 88, 16.18, 54.19],
  [41, "Szczecin", "KO", 91, 14.55, 53.43],
];

export async function getDistrictMap(term = 10): Promise<MapData> {
  const sb = supabase();
  const { data, error } = await sb
    .from("district_klub_stats")
    .select("district_num, dominant_club_short, mp_count, avg_age, turnout_pct")
    .eq("term", term);
  if (error) throw error;

  type Row = {
    district_num: number;
    dominant_club_short: string | null;
    mp_count: number | null;
    avg_age: number | string | null;
    turnout_pct: number | string | null;
  };
  const byNum = new Map<number, Row>();
  for (const r of (data ?? []) as Row[]) byNum.set(r.district_num, r);

  let anyMock = false;
  const districts: MapDistrict[] = OKREGI_COORDS.map(([id, name, fbKlub, fbTurn, lon, lat]) => {
    const row = byNum.get(id);
    if (!row || !row.dominant_club_short) {
      anyMock = true;
      return { id, name, klub: fbKlub, turnout: fbTurn, mpCount: null, avgAge: null, lon, lat, isMock: true };
    }
    const turnout = typeof row.turnout_pct === "string" ? parseFloat(row.turnout_pct) : (row.turnout_pct ?? fbTurn);
    const avgAge = typeof row.avg_age === "string" ? parseFloat(row.avg_age) : row.avg_age;
    return {
      id, name,
      klub: row.dominant_club_short,
      turnout: turnout ?? fbTurn,
      mpCount: row.mp_count ?? null,
      avgAge: avgAge ?? null,
      lon, lat,
      isMock: false,
    };
  });
  return { districts, isMock: anyMock };
}

// Kept for back-compat so callers that imported the old name still build;
// internally just delegates to getDistrictMap and falls back to coords-only
// if the view query throws.
// Coords-only fallback if district_klub_stats query fails. Uses the same
// hardcoded coords as getDistrictMap; klub + turnout are illustrative.
export function getMapPlaceholder(): MapData {
  const districts: MapDistrict[] = OKREGI_COORDS.map(([id, name, klub, turnout, lon, lat]) => ({
    id, name, klub, turnout, mpCount: null, avgAge: null, lon, lat, isMock: true,
  }));
  return { isMock: true, districts };
}

// ──────────────────────────────────────────────────────────────────────────
// 3. SANKEY — real data from klub_flow_quarter (mig 0058 A5) joined with
// current clubs.members_count. We compute "before quarter" sizes by inverting
// the deltas: start_size = current_size + sum(outflows) − sum(inflows).
// ──────────────────────────────────────────────────────────────────────────
export type SankeyNode = { id: string; name: string; n: number; color: string; side: "L" | "R" };
export type SankeyFlow = { from: string; to: string; n: number };
export type SankeyData = { nodes: SankeyNode[]; flows: SankeyFlow[]; isMock: boolean; quarter: string | null };

const SANKEY_KLUB_COLOR_FALLBACK = "#1e6091"; // for clubs (e.g. Centrum) not in KLUB_COLORS

function nodeColor(klub: string): string {
  return KLUB_COLORS[klub] ?? SANKEY_KLUB_COLOR_FALLBACK;
}

export async function getKlubFlow(term = 10): Promise<SankeyData> {
  const sb = supabase();
  const [flowRes, clubsRes] = await Promise.all([
    sb.from("klub_flow_quarter")
      .select("quarter, from_club_short, to_club_short, mp_count")
      .eq("term", term)
      .order("quarter", { ascending: false })
      .order("mp_count", { ascending: false }),
    sb.from("clubs").select("club_id, members_count").eq("term", term),
  ]);
  if (flowRes.error) throw flowRes.error;
  if (clubsRes.error) throw clubsRes.error;

  type FlowRow = { quarter: string; from_club_short: string; to_club_short: string; mp_count: number };
  type ClubRow = { club_id: string; members_count: number | null };
  const allFlows = (flowRes.data ?? []) as FlowRow[];
  if (allFlows.length === 0) {
    return { nodes: [], flows: [], isMock: false, quarter: null };
  }
  // Latest quarter only — single-quarter sankey reads cleanest. When multi-
  // quarter selector lands we'll group these.
  const latestQuarter = allFlows[0].quarter;
  const flows = allFlows.filter((f) => f.quarter === latestQuarter);

  const currentSize = new Map<string, number>();
  for (const c of (clubsRes.data ?? []) as ClubRow[]) {
    currentSize.set(c.club_id, c.members_count ?? 0);
  }

  const involved = new Set<string>();
  for (const f of flows) {
    involved.add(f.from_club_short);
    involved.add(f.to_club_short);
  }
  const outflowSum = new Map<string, number>();
  const inflowSum = new Map<string, number>();
  for (const f of flows) {
    outflowSum.set(f.from_club_short, (outflowSum.get(f.from_club_short) ?? 0) + f.mp_count);
    inflowSum.set(f.to_club_short, (inflowSum.get(f.to_club_short) ?? 0) + f.mp_count);
  }

  const nodes: SankeyNode[] = [];
  for (const klub of involved) {
    const end = currentSize.get(klub) ?? 0;
    const start = end + (outflowSum.get(klub) ?? 0) - (inflowSum.get(klub) ?? 0);
    if (start > 0) {
      nodes.push({ id: `${klub}_L`, name: klub, n: start, color: nodeColor(klub), side: "L" });
    }
    if (end > 0) {
      nodes.push({ id: `${klub}_R`, name: klub, n: end, color: nodeColor(klub), side: "R" });
    }
  }

  // Self-flows: club members who stayed put. Compute as min(start, end) − inflow
  // contributions to that node. Approximation (good enough for visualization).
  const allClubs = new Set([...involved]);
  const sankeyFlows: SankeyFlow[] = [];
  for (const klub of allClubs) {
    const end = currentSize.get(klub) ?? 0;
    const out = outflowSum.get(klub) ?? 0;
    const stayed = Math.max(0, end - (inflowSum.get(klub) ?? 0));
    if (stayed > 0) {
      // Add stayed-in-place ribbon — only if both L and R nodes exist for this klub.
      const hasL = (currentSize.get(klub) ?? 0) + out - (inflowSum.get(klub) ?? 0) > 0;
      if (hasL && end > 0) {
        sankeyFlows.push({ from: `${klub}_L`, to: `${klub}_R`, n: stayed });
      }
    }
  }
  for (const f of flows) {
    sankeyFlows.push({ from: `${f.from_club_short}_L`, to: `${f.to_club_short}_R`, n: f.mp_count });
  }

  return { nodes, flows: sankeyFlows, isMock: false, quarter: latestQuarter };
}

// Back-compat name; aliased for the orchestrator page that imports both
// real and mock paths through `safe()`.
export function getSankeyPlaceholder(): SankeyData {
  return { nodes: [], flows: [], isMock: true, quarter: null };
}

// ──────────────────────────────────────────────────────────────────────────
// 4. SLOW MINISTERS — real data from mp_minister_reply_lag (mig 0058 A6).
// Aggregates interpellation reply lag per recipient ministry. We surface
// the resort label (no minister name yet — recipient is the office, not
// the person; coupling person→office requires a separate join we may add).
// ──────────────────────────────────────────────────────────────────────────
export type MinisterRow = {
  name: string;       // resort label (used as the headline; no person yet)
  resort: string;     // shorter resort short for the meta line
  avgDays: number;
  count: number;
  late: number;       // count past 30-day limit (derived from overdue_30d_pct × total)
  klubColor: string;
  isMock: boolean;
};

export type SlowMinisters = { rows: MinisterRow[]; limitDays: number; isMock: boolean };

// Heuristic: most current ministers come from the ruling coalition (KO/PSL-TD)
// in X kadencja. Without a real recipient→klub join we color all bars KO ink
// and let the per-row over-limit override paint red. Acceptable for now.
const DEFAULT_BAR_COLOR = "#d97706"; // KO orange, matches KLUB_COLORS.KO

function shortResort(label: string): string {
  // "minister rodziny, pracy i polityki społecznej" → "Rodziny, Pracy i Polit. Społ."
  // Drop the "minister" / "prezes Rady Ministrów" prefix; keep what follows.
  const trimmed = label.replace(/^minister\s+/i, "").replace(/^prezes\s+/i, "Prezes ");
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export async function getSlowMinisters(): Promise<SlowMinisters> {
  const sb = supabase();
  const { data, error } = await sb
    .from("mp_minister_reply_lag")
    .select("recipient_label, total_questions, avg_lag_days, median_lag_days, overdue_30d_pct")
    .gte("total_questions", 5)
    .order("avg_lag_days", { ascending: false, nullsFirst: false })
    .limit(10);
  if (error) throw error;

  type Row = {
    recipient_label: string;
    total_questions: number;
    avg_lag_days: number | string | null;
    median_lag_days: number | string | null;
    overdue_30d_pct: number | string | null;
  };
  const rows = ((data ?? []) as Row[]).map((r): MinisterRow => {
    const avg = typeof r.avg_lag_days === "string" ? parseFloat(r.avg_lag_days) : (r.avg_lag_days ?? 0);
    const overduePct = typeof r.overdue_30d_pct === "string" ? parseFloat(r.overdue_30d_pct) : (r.overdue_30d_pct ?? 0);
    return {
      name: shortResort(r.recipient_label),
      resort: r.recipient_label,
      avgDays: Math.round((avg ?? 0) * 10) / 10,
      count: r.total_questions,
      late: Math.round((r.total_questions * (overduePct ?? 0)) / 100),
      klubColor: DEFAULT_BAR_COLOR,
      isMock: false,
    };
  });
  return { rows, limitDays: 30, isMock: false };
}

// Coords-only fallback if the view query fails on Vercel.
export function getSlowMinistersPlaceholder(): SlowMinisters {
  return { rows: [], limitDays: 30, isMock: true };
}
