import { KLUB_LABELS } from "@/lib/atlas/constants";
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

// Single horizontal bar where each club gets a segment proportional to
// its size, and inside each segment a yes (green) / no (red) / abstain
// (amber) sub-bar shows how that club actually voted. This replaces
// the redundant global yes/no/abstain bar that used to sit above —
// the per-club breakdown carries all the same information plus the
// partisan distribution.
export function ClubResultBar({ clubTally }: { clubTally: ClubTallyRaw[] }) {
  const entries = orderClubs(clubTally).filter((c) => c.total > 0);
  const grandTotal = entries.reduce((s, e) => s + e.total, 0);
  if (grandTotal === 0) return null;

  return (
    <div className="mt-3">
      <div
        className="flex"
        style={{ height: 12, border: "1px solid var(--border)" }}
        aria-hidden
      >
        {entries.map((c, i) => {
          const w = (c.total / grandTotal) * 100;
          // Exclude not_voting from the internal breakdown — the segment
          // already represents people who showed up; "ZA / PR / WS" should
          // sum to a club's voting present, leaving absent implicit.
          const inner = c.yes + c.no + c.abstain || 1;
          return (
            <div
              key={c.club_short}
              className="flex"
              style={{
                width: `${w}%`,
                // Thin background-coloured divider between consecutive clubs
                // gives the segments the same visual separation the
                // printed-volume bar uses.
                borderLeft: i > 0 ? "1px solid var(--background)" : "none",
              }}
              title={`${c.club_name}: ZA ${c.yes}, PR ${c.no}, WS ${c.abstain}`}
            >
              <div
                style={{
                  width: `${(c.yes / inner) * 100}%`,
                  background: "var(--success)",
                }}
              />
              <div
                style={{
                  width: `${(c.no / inner) * 100}%`,
                  background: "var(--destructive)",
                }}
              />
              <div
                style={{
                  width: `${(c.abstain / inner) * 100}%`,
                  background: "var(--warning)",
                }}
              />
            </div>
          );
        })}
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
