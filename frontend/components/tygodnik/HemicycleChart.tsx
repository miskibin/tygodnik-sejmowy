// Polish Sejm parliamentary hemicycle, 115-dot stylized abstraction
// (≈1 dot per 4 MPs). Keeps the parliamentary metaphor without 460 dots
// of visual noise. Pure server SVG, no JS.

import { KLUB_COLORS } from "@/lib/atlas/constants";

export type SeatVote = {
  mp_id: number;
  club_ref: string | null;
  vote: "YES" | "NO" | "ABSTAIN" | "ABSENT" | "EXCUSED" | string;
};

const KLUB_ORDER: readonly string[] = [
  "Lewica", "Razem", "KO", "Polska2050", "PSL-TD",
  "niez.", "Konfederacja_KP", "Konfederacja", "Republikanie", "PiS",
];

// Hemicycle abstraction: 115 dots distributed across 6 rings; outer rings
// hold more. Sum = 115.
const RING_CAPACITIES = [13, 16, 18, 20, 22, 26] as const;
const TOTAL_DOTS = RING_CAPACITIES.reduce((a, b) => a + b, 0);
const R_MIN = 60;
const R_MAX = 100;
const RING_GAP = (R_MAX - R_MIN) / (RING_CAPACITIES.length - 1);
const VIEW_W = 240;
const CY = R_MAX + 8;
// Legend rendered inside the SVG so it scales with the chart. Reserved
// strip below the arc carries 3 swatches + labels.
const LEGEND_ROW_Y = CY + 14;
const VIEW_H = LEGEND_ROW_Y + 8;
const CX = VIEW_W / 2;

function voteStyle(vote: string): { fill: string; stroke: string; strokeW: number } {
  switch (vote) {
    case "YES":
      return { fill: "#5e7d4a", stroke: "#5e7d4a", strokeW: 0 };
    case "NO":
      return { fill: "var(--destructive)", stroke: "var(--destructive)", strokeW: 0 };
    case "ABSTAIN":
      return { fill: "var(--muted)", stroke: "#9a8a78", strokeW: 1 };
    default:
      return { fill: "var(--background)", stroke: "var(--border)", strokeW: 0.7 };
  }
}

type Seat = { x: number; y: number };

function buildSeats(): Seat[] {
  const seats: Seat[] = [];
  for (let ring = 0; ring < RING_CAPACITIES.length; ring++) {
    const cap = RING_CAPACITIES[ring];
    const radius = R_MIN + ring * RING_GAP;
    for (let s = 0; s < cap; s++) {
      const t = (s + 0.5) / cap;
      const theta = Math.PI * (1 - t);     // π → 0
      seats.push({
        x: CX + radius * Math.cos(theta),
        y: CY - radius * Math.sin(theta),
      });
    }
  }
  return seats.sort((a, b) => a.x - b.x);
}
const SEATS = buildSeats();

function klubRank(k: string | null): number {
  if (!k) return KLUB_ORDER.length + 1;
  const i = KLUB_ORDER.indexOf(k);
  return i === -1 ? KLUB_ORDER.length : i;
}

export function HemicycleChart({
  votes,
  ariaLabel,
  showLegend = true,
}: {
  votes: SeatVote[];
  ariaLabel?: string;
  showLegend?: boolean;
}) {
  if (votes.length === 0) return null;

  // Sort MPs left→right by political axis, then deterministic within klub.
  const sorted = [...votes].sort((a, b) => {
    const r = klubRank(a.club_ref) - klubRank(b.club_ref);
    return r !== 0 ? r : a.mp_id - b.mp_id;
  });

  // Bucket: each dot represents ceil(votes.length / TOTAL_DOTS) MPs. Pick
  // the modal vote of MPs landing in that dot's bucket.
  const ratio = sorted.length / TOTAL_DOTS;
  const dots: Array<{ vote: string; club: string | null }> = [];
  for (let i = 0; i < TOTAL_DOTS; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.max(start + 1, Math.floor((i + 1) * ratio));
    const slice = sorted.slice(start, end);
    if (slice.length === 0) continue;
    // Modal vote of slice — most MPs in this bucket voted X.
    const tally: Record<string, number> = {};
    for (const v of slice) tally[v.vote] = (tally[v.vote] ?? 0) + 1;
    const vote = Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0];
    // Klub for tooltip — use first MP's klub (slice is already klub-grouped).
    dots.push({ vote, club: slice[0].club_ref });
  }

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      width="100%"
      preserveAspectRatio="xMidYMid meet"
      style={{ display: "block", maxWidth: 360, height: "auto" }}
      role="img"
      aria-label={ariaLabel ?? "Wykres hemicykla głosowania"}
    >
      {dots.map((d, i) => {
        const seat = SEATS[i];
        const style = voteStyle(d.vote);
        const klubColor = d.club ? KLUB_COLORS[d.club] ?? null : null;
        return (
          <circle
            key={i}
            cx={seat.x}
            cy={seat.y}
            r={3.2}
            fill={style.fill}
            stroke={style.stroke}
            strokeWidth={style.strokeW}
          >
            <title>{d.club ?? "—"} · {d.vote}{klubColor ? "" : ""}</title>
          </circle>
        );
      })}
      <line
        x1={CX - R_MAX - 4}
        x2={CX + R_MAX + 4}
        y1={CY + 4}
        y2={CY + 4}
        stroke="var(--border)"
        strokeWidth={0.5}
      />
      {showLegend && (
        // Inline legend so the swatches scale with the chart and stay in
        // the screenshotted PNG. Three slots: ZA / PRZECIW / wstrz./nieob.
        // Hollow gray dot covers both ABSTAIN (paper-warm) and ABSENT
        // (faint) — they share the same "not a clear vote" semantics here.
        <g aria-label="Legenda głosów">
          <circle cx={CX - 70} cy={LEGEND_ROW_Y} r={3.2} fill="#5e7d4a">
            <title>ZA — głos za</title>
          </circle>
          <text
            x={CX - 64}
            y={LEGEND_ROW_Y + 3}
            fontFamily="var(--font-jetbrains-mono), monospace"
            fontSize={8}
            fill="var(--muted-foreground)"
            letterSpacing="0.04em"
          >
            ZA
          </text>
          <circle cx={CX - 30} cy={LEGEND_ROW_Y} r={3.2} fill="var(--destructive)">
            <title>PRZECIW — głos przeciw</title>
          </circle>
          <text
            x={CX - 24}
            y={LEGEND_ROW_Y + 3}
            fontFamily="var(--font-jetbrains-mono), monospace"
            fontSize={8}
            fill="var(--muted-foreground)"
            letterSpacing="0.04em"
          >
            PRZECIW
          </text>
          <circle
            cx={CX + 28}
            cy={LEGEND_ROW_Y}
            r={3}
            fill="var(--background)"
            stroke="#9a8a78"
            strokeWidth={1}
          >
            <title>wstrzymał się lub nieobecny</title>
          </circle>
          <text
            x={CX + 34}
            y={LEGEND_ROW_Y + 3}
            fontFamily="var(--font-jetbrains-mono), monospace"
            fontSize={8}
            fill="var(--muted-foreground)"
            letterSpacing="0.04em"
          >
            wstrz./nieob.
          </text>
        </g>
      )}
    </svg>
  );
}
