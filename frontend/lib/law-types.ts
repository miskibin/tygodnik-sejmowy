export type LawUnit = {
  id: string; version_id: string; root_eli_id: string; document_eli_id: string;
  anchor: string; label: string; article_number: string | null; ordinal: number;
  context: string[]; body: string; body_sha256: string; references_json: string[];
  act_title: string; source_url: string; source_sha256: string; source_type: string;
  captured_at: string; document_date: string | null; extraction_quality: string; extraction_method: string;
  currency_status: string; currency_reason: string; verified_at: string | null;
  valid_from: string | null; valid_to: string | null; dependency_sha256: string;
  included_changes: unknown[]; unresolved_changes: unknown[];
  context_verified: boolean; coverage_verified: boolean;
};

export function isLegalBasis(unit: LawUnit, date: string): boolean {
  return unit.currency_status === "verified" && unit.extraction_quality === "structured"
    && !!unit.valid_from && !!unit.verified_at && unit.valid_from <= date
    && date <= (unit.valid_to ?? unit.verified_at.slice(0, 10))
    && unit.unresolved_changes.length === 0;
}

export function lawUnitUrl(unit: Pick<LawUnit, "root_eli_id" | "version_id" | "anchor">): string {
  return `https://tygodniksejmowy.pl/prawo/${unit.root_eli_id}?version=${unit.version_id}#${encodeURIComponent(unit.anchor)}`;
}

export function validDate(input?: string | null): string {
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw" }).format(new Date());
  if (!input) return today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input) || Number.isNaN(Date.parse(input)) || new Date(input).toISOString().slice(0, 10) !== input) throw new Error("Nieprawidłowa data.");
  return input;
}

export function validEli(input: string): boolean { return /^(DU|MP)\/\d{4}\/\d+$/.test(input); }

export function packUnits(units: LawUnit[], maxCharacters: number): { items: LawUnit[]; omitted: string[] } {
  const items: LawUnit[] = [], omitted: string[] = [];
  let size = 0;
  for (const unit of units) {
    const length = JSON.stringify(unit).length;
    if (size + length > maxCharacters) omitted.push(unit.id);
    else { items.push(unit); size += length; }
  }
  return { items, omitted };
}
