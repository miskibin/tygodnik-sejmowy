// Polish display labels for `process_stages.stage_type` enum values.
// Single source of truth — imported by DrukPage, ProcessStageBar, /watek.
// Add a label-coverage test before touching this dictionary: missing keys
// caused raw enum strings to leak through the UI ("16.04 GovermentPosition")
// per citizen review 2026-05-10.
//
// stage_type alone collapses I/II/III czytanie (all "SejmReading"). The
// underlying Sejm API ships disambiguated stage_name text ("I czytanie na
// posiedzeniu Sejmu", "II czytanie na posiedzeniu Sejmu", etc.) — we prefer
// stage_name when it carries the czytanie ordinal, since that is the single
// most consequential signal a citizen reads off a process card.
// Evidence (D 2026-05-11, process_stages 9394 rows):
//   SejmReading × "I czytanie na posiedzeniu Sejmu" (247)
//   SejmReading × "II czytanie na posiedzeniu Sejmu" (478)
//   SejmReading × "III czytanie na posiedzeniu Sejmu" (391)
//   Reading     × "I czytanie w komisjach" (354)

export const STAGE_TYPE_LABEL: Record<string, string> = {
  Start: "Wpłynięcie",
  Opinion: "Opinia",
  GovermentPosition: "Stanowisko rządu",
  GovernmentPosition: "Stanowisko rządu",
  ExpertOpinion: "Opinia ekspercka",
  Referral: "Skierowanie",
  ReadingReferral: "Skier. do czytania",
  Reading: "I czytanie w komisjach",
  CommitteeWork: "Praca w komisji",
  CommitteeReport: "Sprawozdanie",
  SejmReading: "Czytanie w Sejmie",
  Voting: "Głosowanie",
  SenatePosition: "Stanowisko Senatu",
  SenatePositionConsideration: "Rozp. stanowiska Senatu",
  SenateAmendments: "Poprawki Senatu",
  ToPresident: "Przekazano Prezydentowi",
  PresidentSignature: "Podpis Prezydenta",
  PresidentVeto: "Weto Prezydenta",
  Veto: "Weto Prezydenta",
  PresidentMotionConsideration: "Rozp. wniosku Prezydenta",
  ConstitutionalTribunal: "Trybunał Konstytucyjny",
  Promulgation: "Publikacja w Dz.U.",
  PublicHearing: "Wysłuchanie publiczne",
  End: "Zakończono",
  Withdrawn: "Wycofany",
  Rejected: "Odrzucony",
};

// Match "I czytanie", "II czytanie", "III czytanie" anywhere in stage_name —
// the API returns full Polish prose; we surface it when present.
const CZYTANIE_RE = /\b(I{1,3})\s+czytanie\b/i;

export function stageLabel(stageType: string | null | undefined, fallback?: string | null): string {
  // Prefer stage_name when it disambiguates czytanie ordinal (I/II/III).
  if (fallback && CZYTANIE_RE.test(fallback)) return fallback;
  if (!stageType) return fallback ?? "—";
  return STAGE_TYPE_LABEL[stageType] ?? fallback ?? stageType;
}
