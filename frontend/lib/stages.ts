// Polish display labels for `process_stages.stage_type` enum values.
// Single source of truth — imported by DrukPage, ProcessStageBar, /watek.
// Add a label-coverage test before touching this dictionary: missing keys
// caused raw enum strings to leak through the UI ("16.04 GovermentPosition")
// per citizen review 2026-05-10.

export const STAGE_TYPE_LABEL: Record<string, string> = {
  Start: "Wpłynięcie",
  Opinion: "Opinia",
  GovermentPosition: "Stanowisko rządu",
  GovernmentPosition: "Stanowisko rządu",
  ExpertOpinion: "Opinia ekspercka",
  Referral: "Skierowanie",
  ReadingReferral: "Skier. do czytania",
  Reading: "I czytanie",
  CommitteeWork: "Praca w komisji",
  CommitteeReport: "Sprawozdanie",
  SejmReading: "Czytanie w Sejmie",
  Voting: "Głosowanie",
  SenatePosition: "Stanowisko Senatu",
  SenateAmendments: "Poprawki Senatu",
  ToPresident: "Przekazano Prezydentowi",
  PresidentSignature: "Podpis Prezydenta",
  PresidentVeto: "Weto Prezydenta",
  ConstitutionalTribunal: "Trybunał Konstytucyjny",
  Promulgation: "Publikacja w Dz.U.",
  End: "Zakończono",
  Withdrawn: "Wycofany",
  Rejected: "Odrzucony",
};

export function stageLabel(stageType: string | null | undefined, fallback?: string | null): string {
  if (!stageType) return fallback ?? "—";
  return STAGE_TYPE_LABEL[stageType] ?? fallback ?? stageType;
}
