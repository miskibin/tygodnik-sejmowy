import { KLUB_COLORS, KLUB_LABELS } from "@/lib/atlas/constants";
import type { ClubTallyRaw } from "@/lib/events-types";

// Fixed left-to-right ordering of clubs in the per-party voting bar.
// Matches the editorial convention on the printed sitting report.
// Clubs not in this list fall through to the end in arrival order so
// minor groupings (Centrum, Demokracja) still surface.
const CLUB_ORDER = [
  "PiS",
  "KO",
  "Polska2050",
  "PSL-TD",
  "Lewica",
  "Konfederacja",
  "Konfederacja_KP",
  "Razem",
  "Republikanie",
  "niez.",
] as const;

function orderClubs(rows: ClubTallyRaw[]): ClubTallyRaw[] {
  const byShort = new Map(rows.map((r) => [r.club_short, r]));
  const ordered: ClubTallyRaw[] = [];
  for (const club of CLUB_ORDER) {
    const r = byShort.get(club);
    if (r) {
      ordered.push(r);
      byShort.delete(club);
    }
  }
  for (const r of byShort.values()) ordered.push(r);
  return ordered;
}

export function ClubResultBar({ clubTally }: { clubTally: ClubTallyRaw[] }) {
  const entries = orderClubs(clubTally).filter((c) => c.total > 0);
  const grandTotal = entries.reduce((s, e) => s + e.total, 0);
  if (grandTotal === 0) return null;

  return (
    <div className="mt-3">
      <div
        className="flex"
        style={{ height: 10, border: "1px solid var(--border)" }}
        aria-hidden
      >
        {entries.map((c) => (
          <div
            key={c.club_short}
            style={{
              width: `${(c.total / grandTotal) * 100}%`,
              background: KLUB_COLORS[c.club_short] ?? "var(--muted-foreground)",
            }}
            title={`${c.club_name}: ZA ${c.yes}, PR ${c.no}, WS ${c.abstain}`}
          />
        ))}
      </div>
      <div className="flex mt-1">
        {entries.map((c) => {
          const pct = (c.total / grandTotal) * 100;
          // Hide label on tight segments so neighbours don't overlap —
          // segment is still hoverable for the tooltip.
          const showLabel = pct >= 7;
          return (
            <div
              key={c.club_short}
              className="font-mono"
              style={{
                width: `${pct}%`,
                fontSize: 8.5,
                color: "var(--secondary-foreground)",
                letterSpacing: "0.04em",
                textAlign: "center",
                overflow: "hidden",
                whiteSpace: "nowrap",
              }}
            >
              {showLabel ? KLUB_LABELS[c.club_short] ?? c.club_short : ""}
            </div>
          );
        })}
      </div>
    </div>
  );
}
