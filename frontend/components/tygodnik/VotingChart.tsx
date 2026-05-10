import { KLUB_COLORS, KLUB_LABELS } from "@/lib/atlas/constants";

export type ClubTallyRow = {
  club_short: string;
  club_name?: string;
  yes: number;
  no: number;
  abstain: number;
  not_voting?: number;
  total: number;
};

// Horizontal stacked bar of klub-by-klub yes/no/abstain. Each klub gets
// its own segment along the X axis sized to (yes+no+abstain). Within the
// segment we draw 3 sub-rectangles colored by yes/no/abstain.
export function VotingChart({
  tally,
  yes,
  no,
  abstain,
  height = 36,
}: {
  tally: ClubTallyRow[];
  yes: number;
  no: number;
  abstain: number;
  height?: number;
}) {
  // Sort by total desc so biggest klubs anchor the left.
  const rows = [...tally]
    .filter((r) => (r.yes + r.no + r.abstain) > 0)
    .sort((a, b) => (b.yes + b.no + b.abstain) - (a.yes + a.no + a.abstain));

  const grandTotal = rows.reduce((s, r) => s + r.yes + r.no + r.abstain, 0);
  if (grandTotal === 0) return null;

  return (
    <div className="w-full">
      {/* Stacked bar — one row per klub side-by-side */}
      <div
        className="flex w-full overflow-hidden border border-border rounded-sm"
        style={{ height, background: "var(--muted)" }}
        role="img"
        aria-label={`Głosowanie: ${yes} za, ${no} przeciw, ${abstain} wstrzymane`}
      >
        {rows.map((r) => {
          const sum = r.yes + r.no + r.abstain;
          const widthPct = (sum / grandTotal) * 100;
          const color = KLUB_COLORS[r.club_short] ?? "var(--muted-foreground)";
          const yesPct = sum ? (r.yes / sum) * 100 : 0;
          const noPct = sum ? (r.no / sum) * 100 : 0;
          const absPct = sum ? (r.abstain / sum) * 100 : 0;
          const klubLabel = KLUB_LABELS[r.club_short] ?? r.club_short;
          return (
            <div
              key={r.club_short}
              className="relative h-full flex"
              style={{ width: `${widthPct}%`, borderRight: "1px solid var(--background)" }}
              title={`${r.club_name ?? klubLabel}: ${r.yes} za / ${r.no} przeciw / ${r.abstain} wstrzym.`}
            >
              {/* yes segment — full klub color */}
              <div style={{ width: `${yesPct}%`, background: color }} />
              {/* no segment — klub color but darker bar (multiply with #000 30%) */}
              <div style={{ width: `${noPct}%`, background: color, opacity: 0.45 }} />
              {/* abstain segment — light hatched / muted */}
              <div style={{ width: `${absPct}%`, background: color, opacity: 0.18 }} />
              {/* klub label centered if width permits */}
              {widthPct >= 8 && (
                <span
                  className="absolute inset-0 flex items-center justify-center font-mono text-[9px] font-semibold pointer-events-none"
                  style={{ color: "var(--background)", textShadow: "0 1px 2px rgba(0,0,0,0.4)" }}
                >
                  {klubLabel}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend strip */}
      <div className="flex justify-between items-baseline mt-1.5 font-mono text-[10px] text-muted-foreground">
        <span>
          <span style={{ color: "var(--success)" }}>{yes} za</span>
          <span className="mx-1.5">·</span>
          <span style={{ color: "var(--destructive)" }}>{no} przeciw</span>
          <span className="mx-1.5">·</span>
          <span>{abstain} wstrzym.</span>
        </span>
        <span className="opacity-70">opacity = za / przeciw / wstrz.</span>
      </div>
    </div>
  );
}
