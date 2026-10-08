import type { ProcessSummary } from "@/lib/db/threads";

// Coarse legislative-phase grouping used by /proces list page.
//
// `sejm`/`senat`/`prezydent` derive from `lastStageType` for in-flight rows.
// `uchwalone` is set externally by the loader for passed rows (closure_date
// known, no live stage). Single source of truth — both the server fetch
// merge and the client filter chip row consume this.
export type ProcesGroupKey = "sejm" | "senat" | "prezydent" | "zakonczone" | "uchwalone";

export const PROCES_GROUP_HEADING: Record<ProcesGroupKey, string> = {
  zakonczone: "Zakończone bez przyjęcia",
  sejm: "W Sejmie",
  senat: "Stanowisko Senatu",
  prezydent: "Etap prezydencki",
  uchwalone: "Przyjęte",
};

export const PROCES_GROUP_BLURB: Record<ProcesGroupKey, string> = {
  sejm: "Etapy sejmowe, w tym rozpatrywanie stanowiska Senatu i weta prezydenta.",
  senat: "Stanowisko Senatu odnotowane w historii. Nie przesądza o zakończeniu prac nad ustawą.",
  prezydent: "Odnotowano przekazanie ustawy prezydentowi, podpis lub skierowanie do TK.",
  zakonczone: "Odrzucone, wycofane lub zakończone bez potwierdzenia przyjęcia.",
  uchwalone: "Przyjęcie dokumentu nie oznacza wejścia przepisów w życie.",
};

export function classifyInFlight(p: ProcessSummary): Exclude<ProcesGroupKey, "uchwalone"> {
  const t = p.lastStageType ?? "";
  if (["End", "Rejected", "Withdrawn"].includes(t)) return "zakonczone";
  if (t === "SenatePosition") return "senat";
  if (["ToPresident", "PresidentSignature", "ConstitutionalTribunal"].includes(t)) return "prezydent";
  return "sejm";
}

// Polish labels for `prints.sponsor_authority` enum. Null/unknown values fall
// through to "—" at render time — callers should gate display on truthy label.
export const SPONSOR_LABEL: Record<string, string> = {
  rzad: "Rząd",
  prezydent: "Prezydent",
  klub_poselski: "Posłowie",
  senat: "Senat",
  komisja: "Komisja",
  prezydium: "Prezydium",
  obywatele: "Obywatele",
  inne: "Inne",
};
