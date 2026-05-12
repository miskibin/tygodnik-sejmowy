// Pure types + constants + helpers safely usable in client components.
// No DB code lives here — that stays in promises.ts (server-only).

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

export const PARTY_TO_KLUB: Record<string, string> = {
  KO: "KO",
  L: "Lewica",
  P2050: "Polska2050",
  PSL: "PSL-TD",
  TD: "PSL-TD",
  PiS: "PiS",
  Konf: "Konfederacja",
};

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

// ---- Hub redesign types/constants ----

export type ActivityFilter = "all" | "with-prints" | "confirmed" | "stale";
export const ACTIVITY_FILTERS: ReadonlyArray<ActivityFilter> = [
  "all",
  "with-prints",
  "confirmed",
  "stale",
];

export function isActivityFilter(v: string | null | undefined): v is ActivityFilter {
  return v != null && (ACTIVITY_FILTERS as ReadonlyArray<string>).includes(v);
}

export const ACTIVITY_LABEL: Record<ActivityFilter, string> = {
  all: "Wszystkie",
  "with-prints": "Z drukami w Sejmie",
  confirmed: "Z potwierdzonym ruchem",
  stale: "Bez ruchu",
};

export type PromiseHubRow = {
  id: number;
  partyCode: string | null;
  slug: string | null;
  title: string;
  sourceUrl: string | null;
  sourceQuote: string | null;
  confirmedCount: number;
  candidateCount: number;
  lastActivityAt: string | null;
};

export type HubSort = "evidence" | "alpha" | "recent";
export const HUB_SORTS: ReadonlyArray<HubSort> = ["evidence", "alpha", "recent"];
export function isHubSort(v: string | null | undefined): v is HubSort {
  return v != null && (HUB_SORTS as ReadonlyArray<string>).includes(v);
}

export type HubFilters = {
  parties?: string[];
  activity?: ActivityFilter;
  q?: string;
  sort?: HubSort;
};

export type HubCounts = {
  total: number;
  withPrints: number;
  confirmed: number;
  stale: number;
  byParty: Array<{ code: string; count: number }>;
};
