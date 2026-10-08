import type { PollAverageRow } from "@/lib/db/polls";
import {
  RESIDUAL_CODES,
  SEJM_SEATS,
  SEJM_THRESHOLD_PCT,
} from "@/app/sondaze/_components/partyMeta";

export type SeatRow = {
  party_code: string;
  pct: number;
  seats: number;
  qualified: boolean;
};

// Largest-remainder (Hare-Niemeyer) allocation of `cap` seats across
// fractional shares. Pure arithmetic — no electoral geography (D'Hondt).
export function allocateLargestRemainder(cap: number, weights: number[]): number[] {
  const total = weights.reduce((s, n) => s + n, 0);
  if (total === 0) return weights.map(() => 0);
  const ideal = weights.map((n) => (cap * n) / total);
  const floor = ideal.map((x) => Math.floor(x));
  const allocated = floor.reduce((s, n) => s + n, 0);
  const remainder = cap - allocated;
  const sortedByFrac = ideal
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac);
  const out = floor.slice();
  for (let k = 0; k < remainder; k++) out[sortedByFrac[k % sortedByFrac.length].i]++;
  return out;
}

// Project Sejm seats for every main party (residual codes excluded). Parties
// below SEJM_THRESHOLD_PCT keep their `pct` but get 0 seats.
export function projectSeats(rows: PollAverageRow[]): SeatRow[] {
  const main = dedupeCoalitionRows(rows).filter((r) => !RESIDUAL_CODES.has(r.party_code));
  const qualified = main.filter((r) => r.percentage_avg >= SEJM_THRESHOLD_PCT);
  const sizes = qualified.map((r) => r.percentage_avg);
  const seats = allocateLargestRemainder(SEJM_SEATS, sizes);
  const seatBy = new Map(qualified.map((r, i) => [r.party_code, seats[i]]));
  return main.map((r) => ({
    party_code: r.party_code,
    pct: r.percentage_avg,
    seats: seatBy.get(r.party_code) ?? 0,
    qualified: r.percentage_avg >= SEJM_THRESHOLD_PCT,
  }));
}

// Map view for O(1) lookups by party_code.
export function projectSeatsMap(rows: PollAverageRow[]): Map<string, SeatRow> {
  return new Map(projectSeats(rows).map((r) => [r.party_code, r]));
}

// Explicit arithmetic scenarios, not claims about membership of the current government.
export const COALITION_GOV = new Set(["KO", "PSL", "TD", "Polska2050", "Lewica"]);
export const COALITION_OPP = new Set(["PiS", "Konfederacja", "KKP", "PJJ"]);

// If a poll has TD *and* one of its components, drop the components so we
// don't double-count. Returns a new array; doesn't mutate input.
export function dedupeCoalitionRows<T extends { party_code: string }>(rows: T[]): T[] {
  const codes = new Set(rows.map((r) => r.party_code));
  if (!codes.has("TD")) return rows;
  return rows.filter((r) => r.party_code !== "PSL" && r.party_code !== "Polska2050");
}
