// Party color + label table used across /sondaze. Mirrors KLUB_COLORS from
// lib/atlas/constants but extended to poll-only codes (KKP, TD, BS, PJJ).
// Polls use slightly different codes than parliament clubs.

export const POLL_PARTY_COLORS: Record<string, string> = {
  KO: "#d97706",
  PiS: "#1e3a8a",
  Konfederacja: "#1f2937",
  Lewica: "#9f1239",
  Razem: "#be123c",
  KKP: "#374151",
  PSL: "#15803d",
  Polska2050: "#6b21a8",
  TD: "#15803d",
  BS: "#0e7490",
  PJJ: "#92400e",
  Niezdecydowani: "#9ca3af",
  Inne: "#6e6356",
};

export const POLL_PARTY_LABELS: Record<string, string> = {
  KO: "Koalicja Obywatelska",
  PiS: "Prawo i Sprawiedliwość",
  Konfederacja: "Konfederacja",
  Lewica: "Lewica",
  Razem: "Razem",
  KKP: "Konf. Korony Polskiej (Braun)",
  PSL: "PSL",
  Polska2050: "Polska 2050",
  TD: "Trzecia Droga",
  BS: "Bezpartyjni Samorządowcy",
  PJJ: "Polska Jest Jedna",
  Niezdecydowani: "Niezdecydowani",
  Inne: "Inne",
};

export function partyColor(code: string): string {
  return POLL_PARTY_COLORS[code] ?? "var(--muted-foreground)";
}

export function partyLabel(code: string): string {
  return POLL_PARTY_LABELS[code] ?? code;
}

// Codes excluded from the main "Aktualnie" grid — shown in a thin tail row.
export const RESIDUAL_CODES = new Set(["Niezdecydowani", "Inne"]);

// Poll-code → /public/club-logos/<file> mapping. Sejm-club logos exist for
// most poll codes; PSL/TD share PSL-TD; KKP maps to Konfederacja_KP; the rest
// (BS, PJJ, Niezdecydowani, Inne) have no logo asset.
const POLL_LOGO_FILES: Record<string, string> = {
  KO: "KO.jpg",
  PiS: "PiS.jpg",
  Konfederacja: "Konfederacja.jpg",
  KKP: "Konfederacja_KP.jpg",
  Lewica: "Lewica.jpg",
  Razem: "Razem.jpg",
  Polska2050: "Polska2050.jpg",
  PSL: "PSL-TD.jpg",
  TD: "PSL-TD.jpg",
};

export function partyLogoSrc(code: string): string | null {
  const f = POLL_LOGO_FILES[code];
  return f ? `/club-logos/${f}` : null;
}

// Polish Sejm electoral threshold (single-party). Coalitions are 8% but
// polls don't expose that distinction so we simplify.
export const SEJM_THRESHOLD_PCT = 5;
export const SEJM_SEATS = 460;
