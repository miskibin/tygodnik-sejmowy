type PartySeriesMeta = {
  // Date from which the party should be allowed to appear on the quarterly
  // history chart. We compare against quarter END, not quarter START, so a
  // party launched mid-quarter can still appear for that quarter.
  chartActiveFrom?: string;
};

const POLL_PARTY_META: Record<string, PartySeriesMeta> = {
  // Razem left the parliamentary club of Lewica in late Oct 2024; earlier
  // quarters should not render a standalone Razem line.
  Razem: { chartActiveFrom: "2024-10-28" },
  // KKP existed earlier as Braun's formation, but became meaningfully polled
  // as a standalone post-Konfederacja split in 2025.
  KKP: { chartActiveFrom: "2025-01-01" },
};

export function isQuarterVisibleForParty(code: string, quarterStart: string): boolean {
  const activeFrom = POLL_PARTY_META[code]?.chartActiveFrom;
  if (!activeFrom) return true;
  const quarterEnd = new Date(`${quarterStart}T00:00:00Z`);
  quarterEnd.setUTCMonth(quarterEnd.getUTCMonth() + 3);
  quarterEnd.setUTCDate(quarterEnd.getUTCDate() - 1);
  const activeFromDate = new Date(`${activeFrom}T00:00:00Z`);
  return quarterEnd >= activeFromDate;
}

export const NON_ADDITIVE_SERIES_NOTE =
  "Suma serii nie musi dawać 100%: część pracowni pyta o całe bloki, a część o odłamy (np. Lewica/Razem, Konfederacja/KKP).";
