// Hand-curated historical events overlaid on every time-series chart in the
// app (poll trend sparklines, MP voting bars, MP statement activity).
//
// Edit this file to add or remove events — they go live on next deploy.
// Global events (no partyCode) show on every chart. Party-scoped events show
// only on that party's poll sparkline and on the chart of every MP belonging
// to that party (mapping via KLUB_TO_POLL_PARTY below).

export type TimelineEventKind =
  | "election"
  | "leadership"
  | "coalition"
  | "scandal"
  | "policy"
  | "other";

export type TimelineEvent = {
  date: string; // ISO YYYY-MM-DD
  title: string;
  partyCode?: string; // omitted = global; matches POLL_PARTY_COLORS keys
  kind: TimelineEventKind;
  description?: string;
};

// Add events here. Keep titles short — hover description carries detail.
export const TIMELINE_EVENTS: TimelineEvent[] = [
  // — Global —
  {
    date: "2024-04-07",
    title: "Wybory samorządowe",
    kind: "election",
    description: "Pierwsza tura wyborów samorządowych 2024.",
  },
  {
    date: "2024-06-09",
    title: "Wybory do PE",
    kind: "election",
    description: "Wybory do Parlamentu Europejskiego 2024.",
  },
  {
    date: "2025-05-18",
    title: "Wybory prezydenckie — I tura",
    kind: "election",
  },
  {
    date: "2025-06-01",
    title: "Wybory prezydenckie — II tura",
    kind: "election",
  },
  {
    date: "2025-08-06",
    title: "Zaprzysiężenie prezydenta",
    kind: "other",
    description: "Zaprzysiężenie Karola Nawrockiego jako Prezydenta RP.",
  },

  // — Party-scoped —
  {
    date: "2025-07-25",
    title: "Odejście Szymona Hołowni",
    partyCode: "Polska2050",
    kind: "leadership",
    description:
      "Szymon Hołownia ogłasza rezygnację z funkcji lidera Polski 2050.",
  },
];

// Mirrors KLUB_LABELS keys from lib/atlas/constants.ts. Maps parliamentary
// klub codes to the poll-party code used in TIMELINE_EVENTS.partyCode and in
// POLL_PARTY_COLORS. Some klub codes have no obvious poll counterpart (e.g.
// "niez.", Republikanie) and are left unmapped — MPs in those klubs see only
// global events.
export const KLUB_TO_POLL_PARTY: Record<string, string> = {
  KO: "KO",
  PiS: "PiS",
  Polska2050: "Polska2050",
  Lewica: "Lewica",
  "PSL-TD": "PSL",
  Konfederacja: "Konfederacja",
  Konfederacja_KP: "KKP",
  Razem: "Razem",
};

export function pollPartyForKlub(klubRef: string | null | undefined): string | null {
  if (!klubRef) return null;
  return KLUB_TO_POLL_PARTY[klubRef] ?? null;
}

function inWindow(iso: string, from?: string, to?: string): boolean {
  if (from && iso < from) return false;
  if (to && iso > to) return false;
  return true;
}

// Events to show on a chart scoped to `partyCode` (undefined = global-only).
// Date strings are ISO and lexicographic-compare works.
export function getEventsForChart({
  partyCode,
  from,
  to,
}: {
  partyCode?: string | null;
  from?: string;
  to?: string;
}): TimelineEvent[] {
  return TIMELINE_EVENTS.filter((e) => {
    if (e.partyCode && e.partyCode !== partyCode) return false;
    return inWindow(e.date, from, to);
  }).sort((a, b) => a.date.localeCompare(b.date));
}

// Convenience for MP-page charts. Pass the MP's klub ref; returns global
// events plus events for that klub's poll party (if mapped).
export function getEventsForMp({
  klubRef,
  from,
  to,
}: {
  klubRef: string | null | undefined;
  from?: string;
  to?: string;
}): TimelineEvent[] {
  const partyCode = pollPartyForKlub(klubRef) ?? undefined;
  return getEventsForChart({ partyCode, from, to });
}
