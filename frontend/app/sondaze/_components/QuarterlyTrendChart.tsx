import type { PollTrendRow } from "@/lib/db/polls";
import { partyColor, partyLabel, partyLogoSrc } from "./partyMeta";
import { EventMarkers } from "@/components/charts/EventMarkers";
import { getEventsForChart } from "@/lib/timeline-events";

const DAY_MS = 86_400_000;

// Map any ISO date onto a sparkline whose quarter anchors are equally
// spaced along innerW. Within a [anchor[i], anchor[i+1]] window we linear-
// interp by date; events beyond the last anchor extend up to (last + one
// quarter), matching the chart's effective right edge ("now").
function makeXForByQuarters(quarters: string[], padL: number, innerW: number) {
  if (quarters.length === 0) return () => null;
  const n = quarters.length;
  const anchors = quarters.map((q, i) => ({
    t: Date.parse(q + "T00:00:00Z"),
    x: n === 1 ? padL + innerW / 2 : padL + (i / (n - 1)) * innerW,
  }));
  const lastT = anchors[n - 1].t;
  const stepT = n > 1 ? lastT - anchors[n - 2].t : 90 * DAY_MS;
  const tMin = anchors[0].t;
  const tMax = lastT + stepT;
  return (iso: string): number | null => {
    const t = Date.parse(iso + "T00:00:00Z");
    if (Number.isNaN(t) || t < tMin || t > tMax) return null;
    for (let i = 0; i < n - 1; i++) {
      if (t >= anchors[i].t && t <= anchors[i + 1].t) {
        const seg = anchors[i + 1].t - anchors[i].t || 1;
        const frac = (t - anchors[i].t) / seg;
        return anchors[i].x + frac * (anchors[i + 1].x - anchors[i].x);
      }
    }
    const seg = stepT || 1;
    const frac = (t - lastT) / seg;
    const xLast = anchors[n - 1].x;
    return xLast + frac * (padL + innerW - xLast);
  };
}

const PL_MONTHS_NOM = ["styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec", "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień"];
const PL_MONTHS_GEN = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września", "października", "listopada", "grudnia"];

function quarterStartLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return `${PL_MONTHS_NOM[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function quarterStartLabelGen(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return PL_MONTHS_GEN[d.getUTCMonth()];
}

function classifyTrend(first: number, last: number): { label: string; tone: string } {
  const delta = last - first;
  if (delta > 0.5) return { label: "ROSNĄCE", tone: "var(--success)" };
  if (delta < -0.5) return { label: "SPADAJĄCE", tone: "var(--destructive)" };
  return { label: "STABILNE", tone: "var(--muted-foreground)" };
}

function fmtPct(n: number): string {
  return n.toLocaleString("pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

// Sparkline — one party, fits a fixed viewBox. Min/max scaled per-party so
// small movements stay visible; the design trades absolute comparability for
// readable shape per cell.
function Sparkline({
  points,
  color,
  partyCode,
  w = 240,
  h = 56,
}: {
  points: { x: string; y: number }[];
  color: string;
  partyCode: string;
  w?: number;
  h?: number;
}) {
  if (points.length === 0) return null;
  const ys = points.map((p) => p.y);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const span = max - min || 1;
  const pad = 8;
  const innerW = w - pad * 2 - 28; // 28 reserved for trailing label
  const innerH = h - pad * 2;
  const xFor = (i: number) =>
    points.length <= 1 ? pad + innerW / 2 : pad + (i / (points.length - 1)) * innerW;
  const yFor = (v: number) => pad + (1 - (v - min) / span) * innerH;
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(p.y).toFixed(1)}`)
    .join(" ");
  const lastX = xFor(points.length - 1);
  const lastY = yFor(points[points.length - 1].y);
  const firstY = yFor(points[0].y);

  const quarters = points.map((p) => p.x);
  const xForDate = makeXForByQuarters(quarters, pad, innerW);
  const positionedEvents = getEventsForChart({
    partyCode,
    from: quarters[0],
  })
    .map((e) => ({ ...e, x: xForDate(e.date) }))
    .filter((e): e is typeof e & { x: number } => e.x != null);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="block w-full h-auto">
      {/* Markers behind the line */}
      <EventMarkers
        events={positionedEvents}
        yTop={pad}
        yBottom={h - pad}
        variant="sparkline"
      />
      <path d={path} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r={2.8} fill={color} />
      <text
        x={lastX + 6}
        y={lastY + 3}
        fontFamily="var(--font-jetbrains-mono)"
        fontSize={11}
        fontWeight={600}
        fill="var(--foreground)"
      >
        {points[points.length - 1].y.toFixed(1)}
      </text>
      <text
        x={pad}
        y={h - 2}
        fontFamily="var(--font-jetbrains-mono)"
        fontSize={10}
        fill="var(--muted-foreground)"
        opacity={0.8}
      >
        {points[0].y.toFixed(1)}
      </text>
      {/* Anchor for the first point */}
      <circle cx={xFor(0)} cy={firstY} r={1.4} fill={color} opacity={0.5} />
    </svg>
  );
}

export function QuarterlyTrendChart({ rows }: { rows: PollTrendRow[] }) {
  if (rows.length === 0) {
    return <p className="font-serif italic text-muted-foreground py-12 text-center">Brak danych trendu.</p>;
  }

  // Group by party, sort each by quarter_start ascending.
  const byParty = new Map<string, PollTrendRow[]>();
  for (const r of rows) {
    const arr = byParty.get(r.party_code) ?? [];
    arr.push(r);
    byParty.set(r.party_code, arr);
  }
  for (const arr of byParty.values()) arr.sort((a, b) => a.quarter_start.localeCompare(b.quarter_start));

  const quarters = Array.from(new Set(rows.map((r) => r.quarter_start))).sort();
  const firstQuarter = quarters[0];
  const lastQuarter = quarters[quarters.length - 1];

  // Order cells by current standing (last quarter avg desc).
  const cards = Array.from(byParty.entries())
    .map(([code, points]) => ({
      code,
      points,
      first: points[0],
      last: points[points.length - 1],
    }))
    .sort((a, b) => b.last.percentage_avg - a.last.percentage_avg);

  return (
    <section className="min-w-0">
      <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-destructive mb-2">
        Sześć miesięcy poparcia · {quarterStartLabel(firstQuarter)} – {quarterStartLabel(lastQuarter)}
      </div>
      <p className="font-serif text-secondary-foreground text-[15px] sm:text-[16px] leading-[1.55] max-w-[720px] mb-7 sm:mb-9 text-pretty">
        Każdy wykres pokazuje tę samą oś czasu. Liczba po prawej to dzisiejszy wynik średniej, po lewej — punkt wyjścia
        sprzed pół roku. <em className="italic">Patrz na kształt, nie na pojedyncze odchylenia.</em>
      </p>

      <div className="grid gap-7 sm:gap-9 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => {
          const color = partyColor(c.code);
          const src = partyLogoSrc(c.code);
          const trend = classifyTrend(c.first.percentage_avg, c.last.percentage_avg);
          const delta = c.last.percentage_avg - c.first.percentage_avg;
          const verbose =
            Math.abs(delta) < 0.5
              ? "bez większych zmian"
              : delta > 0
                ? `wzrost o ${fmtPct(Math.abs(delta))} pkt`
                : `spadek o ${fmtPct(Math.abs(delta))} pkt`;
          return (
            <article key={c.code} className="min-w-0">
              <div className="flex items-baseline justify-between gap-3 pb-2 border-b border-border mb-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  {src ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={src}
                      alt=""
                      width={18}
                      height={18}
                      className="object-contain rounded-sm shrink-0"
                      style={{ background: "var(--background)", border: "1px solid var(--border)" }}
                    />
                  ) : (
                    <span aria-hidden className="inline-block w-3.5 h-3.5 rounded-sm shrink-0" style={{ background: color }} />
                  )}
                  <span className="font-serif text-[17px] sm:text-[19px] font-medium leading-tight tracking-[-0.01em] truncate">
                    {partyLabel(c.code)}
                  </span>
                </div>
                <span
                  className="font-mono text-[9.5px] tracking-[0.16em] uppercase shrink-0"
                  style={{ color: trend.tone }}
                >
                  {trend.label}
                </span>
              </div>
              <Sparkline
                points={c.points.map((p) => ({ x: p.quarter_start, y: p.percentage_avg }))}
                color={color}
                partyCode={c.code}
              />
              <p className="font-sans text-[12px] sm:text-[13px] text-secondary-foreground mt-2 leading-[1.5]">
                Od {quarterStartLabelGen(firstQuarter)} {verbose}: <strong className="text-foreground font-mono">{fmtPct(c.first.percentage_avg)}%</strong> → <strong className="text-foreground font-mono">{fmtPct(c.last.percentage_avg)}%</strong>.
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
