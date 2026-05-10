import type { Seat } from "@/lib/db/voting";
import { SEATING_ORDER } from "@/lib/db/voting";
import { CLUB_LOGOS } from "@/lib/atlas/club-logos";

const ROWS: ReadonlyArray<{ r: number; c: number }> = [
  { r: 215, c: 40 },
  { r: 250, c: 48 },
  { r: 285, c: 57 },
  { r: 320, c: 66 },
  { r: 355, c: 75 },
  { r: 390, c: 83 },
  { r: 425, c: 91 },
];

const SEAT_TOTAL = 460;
const ARC_TOTAL = ROWS.reduce((s, a) => s + a.c, 0); // 460

type DotProps = {
  cx: number;
  cy: number;
  fill: string;
  stroke: string | "none";
  strokeWidth: number;
  opacity: number;
};

function colorForVote(vote: Seat["vote"]) {
  if (vote === "YES") return { fill: "var(--success)", stroke: "none", strokeWidth: 0, opacity: 1 };
  if (vote === "NO") return { fill: "var(--destructive)", stroke: "none", strokeWidth: 0, opacity: 1 };
  if (vote === "ABSTAIN") return { fill: "var(--warning)", stroke: "none", strokeWidth: 0, opacity: 1 };
  return { fill: "var(--border)", stroke: "var(--muted-foreground)", strokeWidth: 1, opacity: 0.55 };
}

function Swatch({
  color,
  label,
  hollow = false,
}: {
  color: string;
  label: string;
  hollow?: boolean;
}) {
  return (
    <span className="inline-flex items-center" style={{ gap: 7 }}>
      <span
        aria-hidden
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: hollow ? "transparent" : color,
          border: hollow ? `1px solid ${color}` : "none",
        }}
      />
      {label}
    </span>
  );
}

// Largest-remainder allocation: distribute `cap` integer seats across
// fractional shares proportional to clubSizes. Returns one count per club
// such that the sum equals cap exactly.
function allocateArc(cap: number, clubSizes: number[]): number[] {
  const total = clubSizes.reduce((s, n) => s + n, 0);
  if (total === 0) return clubSizes.map(() => 0);
  const ideal = clubSizes.map(n => (cap * n) / total);
  const floor = ideal.map(x => Math.floor(x));
  let allocated = floor.reduce((s, n) => s + n, 0);
  const remainder = cap - allocated;
  const sortedByFrac = ideal
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac);
  const out = floor.slice();
  for (let k = 0; k < remainder; k++) out[sortedByFrac[k].i]++;
  return out;
}

type DotWithSeat = DotProps & { mp_id: number; mp_name: string; club_ref: string };

type HemicycleLayout = {
  dots: DotWithSeat[];
  clubs: Array<{ club_ref: string; centerAngle: number; fraction: number; count: number }>;
};

function buildHemicycle(seats: Seat[]): HemicycleLayout {
  // Pad/truncate to SEAT_TOTAL.
  const padded: Seat[] = seats.length >= SEAT_TOTAL ? seats.slice(0, SEAT_TOTAL) : [...seats];
  while (padded.length < SEAT_TOTAL) {
    padded.push({
      mp_id: -1 - padded.length,
      club_ref: "niez.",
      club_color: "#6e6356",
      vote: "ABSENT",
      mp_name: "",
      district_num: null,
      district_name: null,
      photo_url: null,
    });
  }

  // Group by club.
  const groups = new Map<string, Seat[]>();
  for (const s of padded) {
    const arr = groups.get(s.club_ref) ?? [];
    arr.push(s);
    groups.set(s.club_ref, arr);
  }
  const known = SEATING_ORDER.filter(c => groups.has(c));
  const unknown = [...groups.keys()].filter(c => !SEATING_ORDER.includes(c)).sort();
  const orderedClubs = [...known, ...unknown];
  const clubSizes = orderedClubs.map(c => groups.get(c)!.length);

  // Per-arc allocation using largest remainder.
  const arcAlloc: number[][] = ROWS.map(arc => allocateArc(arc.c, clubSizes));

  // Per-club cursor — picks next MP for that club.
  const cursor = new Map<string, number>(orderedClubs.map(c => [c, 0]));

  const dots: DotWithSeat[] = [];
  for (let ai = 0; ai < ROWS.length; ai++) {
    const arc = ROWS[ai];
    let posInArc = 0;
    for (let ci = 0; ci < orderedClubs.length; ci++) {
      const club = orderedClubs[ci];
      const n = arcAlloc[ai][ci];
      for (let i = 0; i < n; i++) {
        const t = (posInArc + 0.5) / arc.c;
        const angle = Math.PI - Math.PI * t;
        const x = arc.r * Math.cos(angle);
        const y = -arc.r * Math.sin(angle);
        const idx = cursor.get(club)!;
        const seat = groups.get(club)![idx];
        cursor.set(club, idx + 1);
        const color = colorForVote(seat?.vote ?? "ABSENT");
        dots.push({
          cx: x,
          cy: y,
          ...color,
          mp_id: seat?.mp_id ?? -1,
          mp_name: seat?.mp_name ?? "",
          club_ref: club,
        });
        posInArc++;
      }
    }
  }

  // Per-club centroid for logo placement.
  const total = clubSizes.reduce((s, n) => s + n, 0);
  let cumulative = 0;
  const clubs: HemicycleLayout["clubs"] = orderedClubs.map((club, i) => {
    const fraction = clubSizes[i] / total;
    const center = cumulative + fraction / 2;
    cumulative += fraction;
    return {
      club_ref: club,
      centerAngle: Math.PI - Math.PI * center,
      fraction,
      count: clubSizes[i],
    };
  });

  return { dots, clubs };
}

export function Hemicycle460({ seats }: { seats: Seat[] }) {
  const { dots, clubs } = buildHemicycle(seats);

  const ticks = [0, 45, 90, 135, 180].map((deg) => {
    const a = Math.PI - (deg / 180) * Math.PI;
    return {
      x1: 450 * Math.cos(a),
      y1: -450 * Math.sin(a),
      x2: 462 * Math.cos(a),
      y2: -462 * Math.sin(a),
    };
  });

  let yes = 0, no = 0, abstain = 0, other = 0;
  for (const d of dots) {
    if (d.fill === "var(--success)") yes++;
    else if (d.fill === "var(--destructive)") no++;
    else if (d.fill === "var(--warning)") abstain++;
    else other++;
  }

  // Logos sit on a ring just outside the outermost arc.
  const LOGO_RING_R = 478;

  return (
    <div style={{ position: "relative" }}>
      <svg
        viewBox="-540 -540 1080 580"
        style={{ width: "100%", height: "auto", display: "block" }}
      >
        <style>{`circle.hover-grow{transition:r 0.12s}circle.hover-grow:hover{r:7}`}</style>

        <path
          d="M -445 0 A 445 445 0 0 1 445 0"
          fill="none"
          stroke="var(--rule)"
          strokeWidth={1}
          opacity={0.4}
        />

        {ticks.map((t, i) => (
          <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="var(--muted-foreground)" strokeWidth={1} opacity={0.5} />
        ))}

        {dots.map((d, i) => (
          <circle
            key={i}
            className="hover-grow"
            cx={d.cx}
            cy={d.cy}
            r={5.5}
            fill={d.fill}
            stroke={d.stroke === "none" ? undefined : d.stroke}
            strokeWidth={d.strokeWidth}
            opacity={d.opacity}
          >
            {d.mp_name && <title>{`${d.mp_name} · ${d.club_ref}`}</title>}
          </circle>
        ))}

        {/* Club logos arrayed on outer ring above each cluster */}
        {clubs.map(({ club_ref, centerAngle, fraction, count }) => {
          if (count < 2) return null; // skip tiny visual noise
          const cx = LOGO_RING_R * Math.cos(centerAngle);
          const cy = -LOGO_RING_R * Math.sin(centerAngle);
          // Logo size proportional to sqrt(fraction): big clubs bigger logos.
          const size = Math.max(20, Math.min(54, Math.sqrt(fraction) * 110));
          const logoEntry = CLUB_LOGOS[club_ref];
          if (logoEntry) {
            return (
              <image
                key={club_ref}
                href={`/club-logos/${logoEntry.file}`}
                x={cx - size / 2}
                y={cy - size / 2}
                width={size}
                height={size}
                preserveAspectRatio="xMidYMid meet"
                style={{ pointerEvents: "none" }}
              >
                <title>{logoEntry.name}</title>
              </image>
            );
          }
          // Initials fallback for clubs without a logo image.
          const initials = club_ref.replace(/[^A-Za-zŁŚŻŹĆĄĘŃÓ]/g, "").slice(0, 2).toUpperCase() || "??";
          return (
            <g key={club_ref}>
              <circle cx={cx} cy={cy} r={size / 2} fill="var(--background)" stroke="var(--muted-foreground)" strokeWidth={1} />
              <text
                x={cx}
                y={cy + size * 0.12}
                textAnchor="middle"
                fontFamily="var(--font-inter)"
                fontSize={size * 0.34}
                fontWeight={600}
                fill="var(--foreground)"
              >
                {initials}
              </text>
            </g>
          );
        })}

      </svg>

      <div
        className="flex flex-wrap justify-center font-sans"
        style={{
          gap: 18,
          marginTop: -8,
          fontSize: 11,
          color: "var(--secondary-foreground)",
        }}
      >
        <Swatch color="var(--success)" label={`ZA — ${yes}`} />
        <Swatch color="var(--destructive)" label={`PRZECIW — ${no}`} />
        <Swatch color="var(--warning)" label={`WSTRZYMAŁ — ${abstain}`} />
        <Swatch color="var(--border)" hollow label={`NIEOBECNY — ${other}`} />
      </div>

      <div
        className="text-center font-mono uppercase"
        style={{
          marginTop: 14,
          fontSize: 10,
          color: "var(--muted-foreground)",
          letterSpacing: "0.16em",
        }}
      >
        sala plenarna · {SEAT_TOTAL} mandatów
      </div>
    </div>
  );
}
