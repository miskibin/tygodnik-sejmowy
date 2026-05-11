import type { PollTrendRow } from "@/lib/db/polls";
import { partyColor, partyLabel } from "./partyMeta";

const SPARK_W = 520;
const SPARK_H = 56;
const SPARK_MX = 14;
const SPARK_MY = 7;
const Y_MIN = 0;
const Y_MAX = 50;

function quarterLabel(iso: string): string {
  // 2025-04-01 -> '25 Q2
  const d = new Date(iso + "T00:00:00Z");
  const y = String(d.getUTCFullYear()).slice(2);
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `'${y} Q${q}`;
}

function pctLabel(value: number): string {
  return `${value.toFixed(1)}%`;
}

function deltaLabel(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (Math.abs(rounded) < 0.05) return "bez zmiany";
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)} pp`;
}

function rangeLabel(min: number, max: number): string {
  return `${min.toFixed(1)}-${max.toFixed(1)}%`;
}

function pathFromSeries(points: PollTrendRow[], xFor: (q: string) => number, yFor: (value: number) => number, valueFor: (point: PollTrendRow) => number): string {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(point.quarter_start)} ${yFor(valueFor(point))}`)
    .join(" ");
}

function bandPath(points: PollTrendRow[], xFor: (q: string) => number, yFor: (value: number) => number): string {
  if (points.length === 0) return "";
  const upper = points.map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(point.quarter_start)} ${yFor(point.percentage_max)}`);
  const lower = points
    .slice()
    .reverse()
    .map((point) => `L ${xFor(point.quarter_start)} ${yFor(point.percentage_min)}`);
  return [...upper, ...lower, "Z"].join(" ");
}

export function QuarterlyTrendChart({ rows }: { rows: PollTrendRow[] }) {
  if (rows.length === 0) {
    return (
      <section>
        <p className="font-serif text-muted-foreground">Brak danych trendu.</p>
      </section>
    );
  }

  const quarters = Array.from(new Set(rows.map((r) => r.quarter_start))).sort();
  const quarterCount = quarters.length;
  const xIndex = new Map(quarters.map((quarter, index) => [quarter, index]));
  const innerW = SPARK_W - SPARK_MX * 2;
  const innerH = SPARK_H - SPARK_MY * 2;

  const xFor = (quarter: string): number => {
    const index = xIndex.get(quarter) ?? 0;
    if (quarterCount <= 1) return SPARK_MX + innerW / 2;
    return SPARK_MX + (index / (quarterCount - 1)) * innerW;
  };
  const yFor = (pct: number): number => {
    const t = (pct - Y_MIN) / (Y_MAX - Y_MIN);
    return SPARK_MY + (1 - Math.max(0, Math.min(1, t))) * innerH;
  };

  const byParty = new Map<string, PollTrendRow[]>();
  for (const row of rows) {
    const series = byParty.get(row.party_code) ?? [];
    series.push(row);
    byParty.set(row.party_code, series);
  }
  for (const series of byParty.values()) {
    series.sort((a, b) => a.quarter_start.localeCompare(b.quarter_start));
  }

  const parties = Array.from(byParty.entries())
    .map(([party, points]) => {
      const first = points[0];
      const last = points[points.length - 1];
      const min = Math.min(...points.map((point) => point.percentage_min));
      const max = Math.max(...points.map((point) => point.percentage_max));
      return {
        party,
        label: partyLabel(party),
        color: partyColor(party),
        points,
        first,
        last,
        delta: last.percentage_avg - first.percentage_avg,
        min,
        max,
      };
    })
    .sort((a, b) => b.last.percentage_avg - a.last.percentage_avg);

  const lastQuarter = quarters[quarters.length - 1];
  const firstQuarter = quarters[0];
  const lastQuarterX = xFor(lastQuarter);
  const highlightX = Math.max(SPARK_MX, lastQuarterX - 18);
  const highlightW = Math.min(36, SPARK_W - SPARK_MX - highlightX);

  return (
    <section>
      <header className="mb-5 pb-3 border-b border-rule grid min-w-0 items-start gap-4 sm:items-baseline sm:gap-5 [grid-template-columns:minmax(0,44px)_minmax(0,1fr)] sm:[grid-template-columns:minmax(0,60px)_minmax(0,1fr)]">
        <div className="font-serif italic font-normal text-destructive leading-[0.9] text-[clamp(2.25rem,9vw,3.5rem)] sm:text-[56px]">C</div>
        <div className="min-w-0">
          <div className="font-sans text-[10px] sm:text-[11px] tracking-[0.12em] sm:tracking-[0.16em] uppercase text-muted-foreground mb-1.5">
            {quarterLabel(firstQuarter)}-{quarterLabel(lastQuarter)} · {parties.length} {parties.length === 1 ? "partia" : parties.length < 5 ? "partie" : "partii"}
          </div>
          <h2 className="font-serif font-medium m-0 leading-[1.05] text-[clamp(1.5rem,5.5vw,2.25rem)] tracking-[-0.01em]">Trendy kwartalne</h2>
          <p className="font-serif m-0 mt-2 text-secondary-foreground leading-[1.5] max-w-[760px] text-[15px] sm:text-base">
            Zamiast jednej zatłoczonej planszy: osobny rytm dla każdej partii. Pasmo pokazuje kwartalny min-max, linia średnią, a prawa kolumna ostatni odczyt i zmianę od początku szeregu.
          </p>
        </div>
      </header>

      <div className="border border-border bg-muted p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border pb-3 mb-3">
          <div className="font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Ostatni kwartał: {quarterLabel(lastQuarter)}
          </div>
          <div className="font-sans text-[13px] text-secondary-foreground">
            Wspólna skala 0-50% we wszystkich wierszach.
          </div>
        </div>

        <div className="grid gap-3">
          {parties.map((series) => {
            const line = pathFromSeries(series.points, xFor, yFor, (point) => point.percentage_avg);
            const band = bandPath(series.points, xFor, yFor);
            const deltaTone = Math.abs(series.delta) < 0.05
              ? "text-muted-foreground border-border"
              : series.delta > 0
                ? "text-foreground border-foreground"
                : "text-secondary-foreground border-border";

            return (
              <article key={series.party} className="grid gap-3 border border-border bg-background px-3 py-3 sm:px-4 md:grid-cols-[minmax(0,200px)_minmax(0,1fr)_auto] md:items-center">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="inline-block h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: series.color }} />
                    <h3 className="m-0 font-serif text-[18px] sm:text-[20px] leading-[1.05] text-foreground truncate">{series.label}</h3>
                  </div>
                  <div className="mt-1 font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                    Zakres: {rangeLabel(series.min, series.max)} · {series.points.length} kw.
                  </div>
                </div>

                <div className="min-w-0 overflow-x-auto">
                  <svg
                    viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
                    className="block h-auto w-full min-w-[300px]"
                    role="img"
                    aria-label={`${series.label}: trend kwartalny od ${quarterLabel(firstQuarter)} do ${quarterLabel(lastQuarter)}`}
                  >
                    <rect x={highlightX} y={4} width={highlightW} height={SPARK_H - 8} fill="var(--muted)" opacity={0.8} rx={10} />

                    {[0, 25, 50].map((tick) => {
                      const y = yFor(tick);
                      return (
                        <line
                          key={tick}
                          x1={SPARK_MX}
                          y1={y}
                          x2={SPARK_W - SPARK_MX}
                          y2={y}
                          stroke="var(--border)"
                          strokeWidth={tick === 0 ? 1 : 0.9}
                          strokeDasharray={tick === 0 ? undefined : "3 5"}
                          opacity={tick === 0 ? 0.8 : 0.5}
                        />
                      );
                    })}

                    {quarters.map((quarter) => (
                      <line
                        key={quarter}
                        x1={xFor(quarter)}
                        y1={SPARK_MY}
                        x2={xFor(quarter)}
                        y2={SPARK_H - SPARK_MY}
                        stroke="var(--border)"
                        strokeWidth={0.8}
                        opacity={quarter === lastQuarter ? 0.5 : 0.28}
                      />
                    ))}

                    <path d={band} fill={series.color} opacity={0.12} />
                    <path d={line} fill="none" stroke={series.color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

                    {series.points.map((point, index) => {
                      const isLast = index === series.points.length - 1;
                      return (
                        <circle
                          key={`${series.party}-${point.quarter_start}`}
                          cx={xFor(point.quarter_start)}
                          cy={yFor(point.percentage_avg)}
                          r={isLast ? 4.8 : 3}
                          fill="var(--background)"
                          stroke={series.color}
                          strokeWidth={isLast ? 2.4 : 1.8}
                        />
                      );
                    })}
                  </svg>
                </div>

                <div className="flex items-center justify-between gap-3 md:block md:min-w-[108px] md:text-right">
                  <div>
                    <div className="font-mono text-[9px] sm:text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Teraz</div>
                    <div className="font-serif text-[28px] sm:text-[32px] leading-none tracking-[-0.02em]" style={{ color: series.color }}>
                      {pctLabel(series.last.percentage_avg)}
                    </div>
                  </div>
                  <div className={`inline-flex items-center rounded-full border px-2.5 py-1 font-mono text-[11px] ${deltaTone}`}>
                    {deltaLabel(series.delta)}
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <div className="mt-3 border border-border bg-background px-3 py-2 sm:px-4">
          <svg viewBox={`0 0 ${SPARK_W} 22`} className="block h-auto w-full min-w-[300px]" aria-hidden="true">
            {quarters.map((quarter, index) => {
              const stride = quarterCount > 8 ? 2 : 1;
              if (index % stride !== 0 && index !== quarterCount - 1) return null;
              return (
                <text
                  key={quarter}
                  x={xFor(quarter)}
                  y={14}
                  textAnchor="middle"
                  fontFamily="var(--font-jetbrains-mono)"
                  fontSize={10}
                  fill="var(--muted-foreground)"
                >
                  {quarterLabel(quarter)}
                </text>
              );
            })}
          </svg>
        </div>
      </div>
    </section>
  );
}
