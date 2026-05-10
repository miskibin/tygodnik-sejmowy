// Centralized rules for which clubs to surface in aggregate views.
//
// Niezrzeszeni (unaffiliated MPs) are real people who voted, but rolling
// them up as if they were a "klub" produces nonsense narratives ("klub
// niezrzeszonych zagłosował 5/2/0"). User feedback: hide from aggregates
// like heatmap, discipline, voting-by-klub breakdown — keep them in the
// imienny roster where each MP stands on their own.

// Stable rule: anything where club_ref/club_id is null OR matches one of
// these tokens is treated as unaffiliated.
const UNAFFILIATED_TOKENS = new Set([
  "niez.",
  "niez",
  "Niez.",
  "niezrzeszeni",
]);

export function isUnaffiliated(clubId: string | null | undefined): boolean {
  if (clubId == null) return true;
  if (UNAFFILIATED_TOKENS.has(clubId)) return true;
  // Defensive: substring match for "niezrzesz" (handles edge cases like
  // "Posłowie niezrzeszeni" used as club_id).
  if (clubId.toLowerCase().includes("niezrzesz")) return true;
  return false;
}

// Used in heatmap / discipline / voting-by-klub aggregates: drop the row
// before rendering. Caller controls the row shape via the `key` getter.
export function excludeUnaffiliated<T>(
  rows: T[],
  key: (row: T) => string | null | undefined,
): T[] {
  return rows.filter((r) => !isUnaffiliated(key(r)));
}

// Min member count for a klub to count as a meaningful aggregate. Below
// this threshold (mostly singletons after defections), the klub still
// renders in MP-level views but is excluded from "klub × klub" grids.
export const MIN_KLUB_AGGREGATE = 3;
