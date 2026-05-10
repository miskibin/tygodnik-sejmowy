// Polish display labels for `process_stages.stage_type` enum values.
// Mirrors the dictionary inlined in app/druk/[term]/[number]/page.tsx —
// duplicated here so /watek can render the timeline without importing
// from a route component. Keep in sync until DrukPage migrates to import.

export const STAGE_TYPE_LABEL: Record<string, string> = {
  Start: "Wpłynięcie",
  Opinion: "Opinia",
  Referral: "Skierowanie",
  ReadingReferral: "Skier. do czytania",
  Reading: "I czytanie",
  CommitteeWork: "Praca w komisji",
  CommitteeReport: "Sprawozdanie",
  SejmReading: "Czytanie w Sejmie",
  Voting: "Głosowanie",
  SenatePosition: "Stanowisko Senatu",
  ToPresident: "Do Prezydenta",
  PresidentSignature: "Podpis Prezydenta",
  End: "Zakończono",
};

export function stageLabel(stageType: string | null | undefined, fallback?: string | null): string {
  if (!stageType) return fallback ?? "—";
  return STAGE_TYPE_LABEL[stageType] ?? fallback ?? stageType;
}
