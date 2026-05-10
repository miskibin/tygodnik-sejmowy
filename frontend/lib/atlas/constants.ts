// Client-safe constants extracted from lib/db/atlas.ts so client components
// can import without pulling in `server-only`.

export const KLUB_COLORS: Record<string, string> = {
  KO: "#d97706",
  PiS: "#1e3a8a",
  Polska2050: "#6b21a8",
  Lewica: "#9f1239",
  "PSL-TD": "#15803d",
  Konfederacja: "#1f2937",
  Konfederacja_KP: "#374151",
  Razem: "#be123c",
  Republikanie: "#7f1d1d",
  "niez.": "#6e6356",
};

export const KLUB_LABELS: Record<string, string> = {
  KO: "KO",
  PiS: "PiS",
  Polska2050: "P2050",
  Lewica: "Lewica",
  "PSL-TD": "PSL",
  Konfederacja: "Konf.",
  Konfederacja_KP: "Konf.KP",
  Razem: "Razem",
  Republikanie: "Rep.",
  "niez.": "niez.",
};

export const TOPICS_ENUM = [
  "mieszkania", "zdrowie", "energetyka", "obrona", "rolnictwo",
  "edukacja", "sprawiedliwosc", "podatki", "inne",
] as const;
export type TopicId = typeof TOPICS_ENUM[number];

// Real voivodeship polygons live in `lib/atlas/poland-shapes.ts` (auto-generated
// from ppatrzyk/polska-geojson, DP-simplified). Import from there directly.
