// Citizen-persona chip taxonomy — secondary "I am X" filter, hidden behind
// a toggle on the homepage (see frontend/app/page.tsx + BriefList.tsx).
//
// Replaced the original 7-persona set (najemca, rodzic, JDG, pacjent NFZ,
// emeryt, kierowca, rolnik) with these 9 broader personas because:
//   - 4 of the original 7 (najemca, rodzic, pacjent, emeryt) had ZERO
//     matching prints in the DB
//   - the most-tagged DB groups (pracownik-najemny, konsument,
//     wlasciciel-mieszkania, odbiorca-energii, niepelnosprawny) had no chip
//   - homeowners (~19M) outnumber renters (~4.5M) ~4× yet only renters
//     had a chip — renamed najemca → mieszkaniec to cover both.
//
// Topic chips (see frontend/lib/topics.ts) are the PRIMARY filter row and
// match what's actually in print titles. Personas remain useful for the
// "show me what affects me as a person" subset.

export type PersonaId =
  | "pracownik"
  | "przedsiebiorca"
  | "rolnik"
  | "rodzic"
  | "pacjent"
  | "emeryt"
  | "kierowca"
  | "mieszkaniec"
  | "podatnik"
  | "imigrant";

export const PERSONAS: Record<
  PersonaId,
  { label: string; icon: string; color: string; section: string }
> = {
  pracownik:      { label: "pracownik",      icon: "⚒", color: "#4a3d2a",       section: "Praca" },
  przedsiebiorca: { label: "przedsiębiorca", icon: "◧", color: "#3d4a6b",       section: "Działalność gospodarcza" },
  rolnik:         { label: "rolnik",         icon: "☘", color: "#3d6b3d",       section: "Rolnictwo" },
  rodzic:         { label: "rodzic",         icon: "✦", color: "#7a4a1a",       section: "Edukacja i rodzina" },
  pacjent:        { label: "pacjent",        icon: "✚", color: "#3d6b3d",       section: "Zdrowie" },
  emeryt:         { label: "emeryt",         icon: "◷", color: "var(--muted-foreground)", section: "Emerytury" },
  kierowca:       { label: "kierowca",       icon: "◎", color: "#5a4a2a",       section: "Transport" },
  mieszkaniec:    { label: "mieszkaniec",    icon: "⌂", color: "var(--destructive)", section: "Mieszkanie" },
  podatnik:       { label: "podatnik",       icon: "₧", color: "#5a4a6b",       section: "Podatki" },
  imigrant:       { label: "imigrant",       icon: "✈", color: "#2a5a6b",       section: "Cudzoziemcy" },
};

export const PERSONA_IDS = Object.keys(PERSONAS) as PersonaId[];

// DB persona_tags (26-tag taxonomy from supagraf/enrich/print_personas.py)
// → frontend persona chip. Mapping is intentionally many-to-few:
//   - jdg + przedsiebiorca-pracodawca + podatnik-vat → przedsiebiorca
//   - najemca + wlasciciel-mieszkania + odbiorca-energii → mieszkaniec
//   - pacjent-nfz + niepelnosprawny + opiekun-seniora → pacjent
//   - rodzic-ucznia + beneficjent-rodzinny → rodzic
//   - rolnik + hodowca → rolnik
//   - kierowca-prywatny + kierowca-zawodowy → kierowca
//   - podatnik-pit + konsument → podatnik
//   - pracownik-najemny → pracownik
//   - emeryt → emeryt
//   - imigrant → imigrant
// Tags not listed (student, wies, duze-miasto, dzialkowicz, wedkarz, mysliwy)
// don't surface as chips — too narrow for a homepage filter row.
const DB_TAG_TO_PERSONA: Record<string, PersonaId> = {
  "pracownik-najemny": "pracownik",

  "jdg": "przedsiebiorca",
  "przedsiebiorca-pracodawca": "przedsiebiorca",
  "podatnik-vat": "przedsiebiorca",

  "rolnik": "rolnik",
  "hodowca": "rolnik",

  "rodzic-ucznia": "rodzic",
  "beneficjent-rodzinny": "rodzic",

  "pacjent-nfz": "pacjent",
  "niepelnosprawny": "pacjent",
  "opiekun-seniora": "pacjent",

  "emeryt": "emeryt",

  "kierowca-prywatny": "kierowca",
  "kierowca-zawodowy": "kierowca",

  "najemca": "mieszkaniec",
  "wlasciciel-mieszkania": "mieszkaniec",
  "odbiorca-energii": "mieszkaniec",

  "podatnik-pit": "podatnik",
  "konsument": "podatnik",

  "imigrant": "imigrant",
};

export function dbTagsToPersonas(tags: readonly string[] | null | undefined): PersonaId[] {
  if (!tags) return [];
  const out = new Set<PersonaId>();
  for (const t of tags) {
    const p = DB_TAG_TO_PERSONA[t];
    if (p) out.add(p);
  }
  return [...out];
}
