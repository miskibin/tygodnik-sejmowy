// Display-name mappings — keep raw enum/slug values out of citizen-facing UI.

const AFFECTED_GROUP_LABELS: Record<string, string> = {
  "najemca": "najemca",
  "wlasciciel-mieszkania": "właściciel mieszkania",
  "rodzic-ucznia": "rodzic ucznia",
  "uczen": "uczeń",
  "student": "student",
  "jdg": "samozatrudniony / JDG",
  "przedsiebiorca-pracodawca": "pracodawca",
  "mikroprzedsiebiorca": "mikroprzedsiębiorca",
  "pacjent-nfz": "pacjent NFZ",
  "lekarz": "lekarz",
  "pielegniarka": "pielęgniarka",
  "emeryt": "emeryt",
  "rencista": "rencista",
  "kierowca-prywatny": "kierowca prywatny",
  "kierowca-zawodowy": "kierowca zawodowy",
  "rolnik": "rolnik",
  "pracownik": "pracownik",
  "bezrobotny": "bezrobotny",
  "podatnik": "podatnik",
  "konsument": "konsument",
};

export function affectedGroupLabel(slug: string): string {
  return AFFECTED_GROUP_LABELS[slug] ?? slug.replace(/-/g, " ");
}

export type Severity = "low" | "medium" | "high";

export function severityDots(severity: Severity): string {
  return severity === "high" ? "●●●" : severity === "medium" ? "●●○" : "●○○";
}

export function severityLabel(severity: Severity): string {
  return severity === "high" ? "mocno dotyczy" : severity === "medium" ? "dotyczy" : "lekko dotyczy";
}

export function severityColor(severity: Severity): string {
  return severity === "high"
    ? "var(--destructive)"
    : severity === "medium"
    ? "var(--warning)"
    : "var(--muted-foreground)";
}

const PROMISE_STATUS_LABELS: Record<string, string> = {
  "in_progress": "w realizacji",
  "completed": "zrealizowane",
  "fulfilled": "zrealizowane",
  "broken": "złamane",
  "not_started": "bez działań",
  "stalled": "zawieszone",
  "partial": "częściowo zrealizowane",
};

export function promiseStatusLabel(status: string | null): string | null {
  if (!status) return null;
  return PROMISE_STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

// document_category enum (migration 0042) → human Polish labels for the
// druk header chip. `projekt_ustawy` deliberately falls back to null so we
// don't double-up with the "Druk Sejmowy" kicker that's already there.
const CATEGORY_LABELS: Record<string, string> = {
  projekt_ustawy: "projekt ustawy",
  opinia_organu: "opinia organu",
  sprawozdanie_komisji: "sprawozdanie komisji",
  autopoprawka: "autopoprawka",
  wniosek_personalny: "wniosek personalny",
  pismo_marszalka: "pismo marszałka",
  uchwala_upamietniajaca: "uchwała upamiętniająca",
  uchwala_senatu: "uchwała Senatu",
  weto_prezydenta: "weto prezydenta",
  wotum_nieufnosci: "wotum nieufności",
  wniosek_organizacyjny: "wniosek organizacyjny",
  informacja: "informacja",
  inne: "inny dokument",
};

export function documentCategoryLabel(category: string | null): string | null {
  if (!category) return null;
  return CATEGORY_LABELS[category] ?? null;
}

// Procedural/meta categories never carry a real citizen action. Defensive
// fallback for the rare case where an older LLM run left a value in
// `citizen_action` for one of these. Mirrors the list in the ETL prompt.
const PROCEDURAL_CATEGORIES: ReadonlySet<string> = new Set([
  "opinia_organu",
  "autopoprawka",
  "wniosek_organizacyjny",
  "pismo_marszalka",
  "uchwala_upamietniajaca",
  "uchwala_senatu",
  "wniosek_personalny",
  "informacja",
  "wotum_nieufnosci",
  "weto_prezydenta",
]);

export function isProceduralCategory(c: string | null | undefined): boolean {
  return !!c && PROCEDURAL_CATEGORIES.has(c);
}

// Sponsor authority — coarse origin of the bill, from `prints.sponsor_authority`.
// Citizen-facing label + short blurb for the druk sidebar.
const SPONSOR_AUTHORITY_LABELS: Record<string, string> = {
  rzad: "Rząd",
  prezydent: "Prezydent",
  klub_poselski: "Klub poselski",
  senat: "Senat",
  komisja: "Komisja sejmowa",
  prezydium: "Prezydium Sejmu",
  obywatele: "Inicjatywa obywatelska",
  inne: "Inne",
};

export function sponsorAuthorityLabel(authority: string | null): string | null {
  if (!authority) return null;
  return SPONSOR_AUTHORITY_LABELS[authority] ?? authority;
}

// Opinion-issuer codes from prints.opinion_source (mig 0047). Closed vocabulary
// — see prints_opinion_source_check. Maps to the institution name as it
// appears on Sejm.gov.pl print pages.
const OPINION_SOURCE_LABELS: Record<string, string> = {
  BAS: "Biuro Analiz Sejmowych",
  SN: "Sąd Najwyższy",
  KRS: "Krajowa Rada Sądownictwa",
  KRRP: "Krajowa Rada Radców Prawnych",
  NRA: "Naczelna Rada Adwokacka",
  NRL: "Naczelna Rada Lekarska",
  NBP: "Narodowy Bank Polski",
  PG: "Prokurator Generalny",
  RPO: "Rzecznik Praw Obywatelskich",
  PKDP: "Państwowa Komisja ds. Pedofilii",
  OSR: "Ocena Skutków Regulacji",
  RDS: "Rada Dialogu Społecznego",
  GUS: "Główny Urząd Statystyczny",
  RDPP: "Rada Działalności Pożytku Publicznego",
  HFPC: "Helsińska Fundacja Praw Człowieka",
  RM: "Rada Ministrów",
  RZAD: "Stanowisko Rządu",
  UODO: "Urząd Ochrony Danych Osobowych",
  PRM: "Prezes Rady Ministrów",
  SLDO: "Stanowisko Lewicy",
  UDSC: "Urząd ds. Cudzoziemców",
  WNIOSKODAWCA: "Wnioskodawca",
  SLR: "Stanowisko Lewicy",
  OZZL: "Ogólnopolski Związek Zawodowy Lekarzy",
  BRPO: "Biuro RPO",
  SLDR: "Stanowisko Klubu",
  INNY: "Inny organ",
};

const OPINION_SOURCE_SHORT: Record<string, string> = {
  BAS: "BAS", SN: "SN", KRS: "KRS", KRRP: "KRRP", NRA: "NRA", NRL: "NRL",
  NBP: "NBP", PG: "PG", RPO: "RPO", PKDP: "PKDP", OSR: "OSR", RDS: "RDS",
  GUS: "GUS", RDPP: "RDPP", HFPC: "HFPC", RM: "RM", RZAD: "Rząd",
  UODO: "UODO", PRM: "PRM", SLDO: "Lewica", UDSC: "UdSC",
  WNIOSKODAWCA: "Wnioskodawca", SLR: "Lewica", OZZL: "OZZL", BRPO: "BRPO",
  SLDR: "Klub", INNY: "Inne",
};

export function opinionSourceLabel(code: string | null): string | null {
  if (!code) return null;
  return OPINION_SOURCE_LABELS[code] ?? code;
}

export function opinionSourceShort(code: string | null): string | null {
  if (!code) return null;
  return OPINION_SOURCE_SHORT[code] ?? code;
}

// Format est_population (raw integer) as a short Polish phrase.
//   2_600_000 → "2,6 mln"
//   600_000   → "600 tys."
//   12_000    → "12 tys."
//   543       → "543"
export function formatPopulation(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n) || n <= 0) return null;
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${m.toLocaleString("pl-PL", { maximumFractionDigits: 1 })} mln`;
  }
  if (n >= 1_000) {
    const k = Math.round(n / 1_000);
    return `${k.toLocaleString("pl-PL")} tys.`;
  }
  return n.toLocaleString("pl-PL");
}

// Strips, in order of likelihood, the prefixes that precede actual speech content
// in `proceeding_statements.body_text`. Each pattern is anchored to start of string
// so we never chop content from the middle.
const STRIP_PREFIXES: RegExp[] = [
  // "10. kadencja, 49. posiedzenie, 2. dzień (09-01-2026) 10. punkt porządku dziennego: Pytania w sprawach bieżących. "
  // — eats metadata block + the topic sentence in one go.
  /^\d+\.\s*kadencja,\s*\d+\.\s*posiedzenie[^:]+:\s*[^.]+\.\s*/u,
  // Defensive shorter variants if the joiner string differs.
  /^\d+\.\s*kadencja,\s*\d+\.\s*posiedzenie[^:]+:\s*/u,
  /^\d+\.\s*punkt\s+porządku\s+dziennego[^.]*\.\s*/u,
  // Speaker tag — any leading capitalised phrase ending in ":" (no "!" or "?"
  // can appear inside, so we won't eat a salutation by accident).
  /^[\p{Lu}][\p{L}\s.-]{2,120}:\s+/u,
  // Salutations: "Szanowny Panie Marszałku!", "Panie Ministrze!", etc.
  /^(Szanown[aey]?\s+)?(Pan(ie)?|Państwo)\s+(Marszał\w+|Minist\w+|Premier\w*|Prezydent\w*|Posł\w+|Senator\w*)[!,.\s]+/u,
  /^(Szanown[aey]?\s+)?(Pan(ie)?|Państwo)\s+\w+[!,.\s]+/u,
  /^Wysoka\s+Izbo[!,.\s]+/u,
  /^Szanown\w+\s+Pa[nń]\w*\s+\w+[!,.\s]+/u,
];

export function stripSpeechBoilerplate(text: string): string {
  let s = text.trim();
  for (let i = 0; i < 8; i++) {
    let changed = false;
    for (const re of STRIP_PREFIXES) {
      const next = s.replace(re, "").trim();
      if (next !== s) {
        s = next;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return s;
}
