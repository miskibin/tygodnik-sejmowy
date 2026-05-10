// Topic chip taxonomy — primary homepage filter row.
//
// IDs MUST match the Literal in supagraf/enrich/print_unified.py
// (PrintUnifiedOutput.topic_tags) and migration 0061. Adding/removing
// requires a migration + prompt bump (v5).
//
// Why topic chips: 4 of the 7 persona chips (najemca, rodzic, pacjent,
// emeryt) had ZERO matching prints in the DB while the biggest title
// clusters (sady/kodeksy 65, obrona 35) had no chip at all. Topic chips
// match what's actually in the corpus; persona chips stay as a secondary
// "I am X" filter behind a toggle (see PERSONA_IDS).

export type TopicId =
  | "sady-prawa"
  | "bezpieczenstwo-obrona"
  | "biznes-podatki"
  | "praca-zus"
  | "zdrowie"
  | "edukacja-rodzina"
  | "emerytury"
  | "rolnictwo-wies"
  | "mieszkanie-media"
  | "transport"
  | "srodowisko-klimat";

export const TOPICS: Record<
  TopicId,
  { label: string; icon: string; color: string }
> = {
  "sady-prawa":            { label: "Sądy i prawa",         icon: "⚖", color: "#5a4a6b" },
  "bezpieczenstwo-obrona": { label: "Bezpieczeństwo",       icon: "⛨", color: "#6b3d3d" },
  "biznes-podatki":        { label: "Biznes i podatki",     icon: "◧", color: "#3d4a6b" },
  "praca-zus":             { label: "Praca i ZUS",          icon: "⚒", color: "#4a3d2a" },
  "zdrowie":               { label: "Zdrowie",              icon: "✚", color: "#3d6b3d" },
  "edukacja-rodzina":      { label: "Edukacja i rodzina",   icon: "✦", color: "#7a4a1a" },
  "emerytury":             { label: "Emerytury",            icon: "◷", color: "var(--muted-foreground)" },
  "rolnictwo-wies":        { label: "Rolnictwo i wieś",     icon: "☘", color: "#3d6b3d" },
  "mieszkanie-media":      { label: "Mieszkanie i media",   icon: "⌂", color: "var(--destructive)" },
  "transport":             { label: "Transport",            icon: "◎", color: "#5a4a2a" },
  "srodowisko-klimat":     { label: "Środowisko i klimat",  icon: "❀", color: "#3d6b3d" },
};

export const TOPIC_IDS = Object.keys(TOPICS) as TopicId[];

// Validate + narrow a string[] from the DB to TopicId[]. Unknown values
// (taxonomy drift) are dropped silently — same defensive contract as
// dbTagsToPersonas in personas.ts.
const TOPIC_SET = new Set<string>(TOPIC_IDS);

export function dbTagsToTopics(tags: readonly string[] | null | undefined): TopicId[] {
  if (!tags) return [];
  const out: TopicId[] = [];
  for (const t of tags) {
    if (TOPIC_SET.has(t)) out.push(t as TopicId);
  }
  return out;
}
