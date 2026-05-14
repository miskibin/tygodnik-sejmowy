import type { ProcessSummary } from "@/lib/db/threads";

// Coarse legislative-phase grouping used by /proces list page.
//
// `sejm`/`senat`/`prezydent` derive from `lastStageType` for in-flight rows.
// `uchwalone` is set externally by the loader for passed rows (closure_date
// known, no live stage). Single source of truth — both the server fetch
// merge and the client filter chip row consume this.
export type ProcesGroupKey = "sejm" | "senat" | "prezydent" | "uchwalone";

export const PROCES_GROUP_HEADING: Record<ProcesGroupKey, string> = {
  sejm: "W Sejmie",
  senat: "W Senacie",
  prezydent: "U Prezydenta",
  uchwalone: "Ostatnio uchwalone",
};

export const PROCES_GROUP_BLURB: Record<ProcesGroupKey, string> = {
  sejm: "Projekty po wpłynięciu, w komisjach albo w czytaniach plenarnych.",
  senat: "Sejm zakończył pracę, Senat ma 30 dni na decyzję (20 — budżet, 14 — pilna).",
  prezydent:
    "Po głosowaniach w obu izbach. Prezydent ma 21 dni (7 — pilna/budżet) na podpis, weto lub TK.",
  uchwalone: "Uchwalone w ciągu ostatnich 90 dni — opublikowane lub czekające na Dz.U.",
};

const SENATE_STAGE_TYPES = new Set([
  "SenatePosition",
  "SenatePositionConsideration",
  "SenateAmendments",
]);

const PRESIDENT_STAGE_TYPES = new Set([
  "ToPresident",
  "PresidentSignature",
  "PresidentVeto",
  "Veto",
  "PresidentMotionConsideration",
  "ConstitutionalTribunal",
]);

export function classifyInFlight(p: ProcessSummary): Exclude<ProcesGroupKey, "uchwalone"> {
  const t = p.lastStageType ?? "";
  if (SENATE_STAGE_TYPES.has(t)) return "senat";
  if (PRESIDENT_STAGE_TYPES.has(t)) return "prezydent";
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
