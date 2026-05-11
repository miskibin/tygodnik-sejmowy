import type { PollTrendRow } from "@/lib/db/polls";
import { partyColor, partyLabel } from "./partyMeta";

const VB_W = 980;
const VB_H = 382;
const M_LEFT = 48;
const M_RIGHT = 264;
const M_TOP = 18;
const M_BOTTOM = 46;
const Y_MIN = 0;

function quarterLabel(iso: string): string {
  // 2025-04-01 -> '25 Q2
  const d = new Date(iso + "T00:00:00Z");
  const y = String(d.getUTCFullYear()).slice(2);
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `'${y} Q${q}`;
}

function chartPartyLabel(code: string): string {
  if (code === "KO") return "KO";
  if (code === "PiS") return "PiS";
  if (code === "KKP") return "KKP (Braun)";
  return partyLabel(code);
}

function labelWidth(label: string): number {
  return Math.max(110, Math.min(220, 38 + label.length * 6.8));
}

function niceTickStep(maxValue: number): number {
  if (maxValue <= 12) return 2;
  if (maxValue <= 30) return 5;
  return 10;
}

function niceYMax(maxValue: number): number {
  const step = niceTickStep(maxValue);
  return Math.max(step * 2, Math.ceil((maxValue + step * 0.8) / step) * step);
}

function buildTicks(maxValue: number): number[] {
  const step = niceTickStep(maxValue);
  const ticks: number[] = [];
  for (let tick = 0; tick <= maxValue; tick += step) ticks.push(tick);
  return ticks;
}

function pathFromSeries(
  points: PollTrendRow[],
  xFor: (q: string) => number,
  yFor: (value: number) => number,
  valueFor: (point: PollTrendRow) => number,
): string {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(point.quarter_start)} ${yFor(valueFor(point))}`)
    .join(" ");
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
  const innerW = VB_W - M_LEFT - M_RIGHT;
  const innerH = VB_H - M_TOP - M_BOTTOM;

  const xFor = (quarter: string): number => {
    const index = xIndex.get(quarter) ?? 0;
    if (quarterCount <= 1) return M_LEFT + innerW / 2;
    return M_LEFT + (index / (quarterCount - 1)) * innerW;
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
      return {
        party,
        label: partyLabel(party),
        color: partyColor(party),
        points,
        first,
        last,
        delta: last.percentage_avg - first.percentage_avg,
      };
    })
    .sort((a, b) => b.last.percentage_avg - a.last.percentage_avg);

  const maxValue = Math.max(
    ...parties.flatMap((series) => series.points.map((point) => Math.max(point.percentage_avg, point.percentage_max))),
  );
  const yMax = niceYMax(maxValue);
  const yTicks = buildTicks(yMax);
  const yFor = (pct: number): number => {
    const t = (pct - Y_MIN) / (yMax - Y_MIN);
    return M_TOP + (1 - Math.max(0, Math.min(1, t))) * innerH;
  };

  const lastQuarter = quarters[quarters.length - 1];
  const firstQuarter = quarters[0];
  const lastQuarterX = xFor(lastQuarter);
  const highlightX = Math.max(M_LEFT, lastQuarterX - 24);
  const highlightW = Math.min(48, VB_W - M_RIGHT - highlightX);

  const labelHeight = 22;
  const labelX = VB_W - M_RIGHT + 14;
  const legendGap = 10;
  const legendStep = labelHeight + legendGap;
  const legendTop = M_TOP + Math.max(16, (innerH - legendStep * (parties.length - 1)) / 2);
  const legendItems = parties.map((series, index) => ({
    party: series.party,
    label: `${chartPartyLabel(series.party)} ${series.last.percentage_avg.toFixed(1)}%`,
    color: series.color,
    x: xFor(series.last.quarter_start),
    y: yFor(series.last.percentage_avg),
    centerY: legendTop + index * legendStep,
  }));
  const lateStartSeries = parties
    .filter((series) => series.first.quarter_start !== firstQuarter)
    .map((series) => `${series.label} od ${quarterLabel(series.first.quarter_start)}`);

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
            Jedna wspólna plansza, jedna skala. Górny limit dopasowuje się do realnych danych, a etykiety po prawej rozkładam automatycznie, żeby się nie sklejały.
          </p>
        </div>
      </header>

      <div className="border border-border bg-muted p-2 sm:p-4 min-w-0 overflow-x-auto">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1 pb-3">
          <div className="font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Oś Y: 0-{yMax}% · wszystkie {quarterCount} kwartały
          </div>
          <div className="font-sans text-[13px] text-secondary-foreground">
            Dane są od {quarterLabel(firstQuarter)}; część serii startuje później, gdy pojawia się osobno w sondażach.
          </div>
        </div>
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          className="w-full min-w-[320px] h-auto block"
          role="img"
          aria-label={`Wykres trendu kwartalnego ${parties.length} partii na wspólnej skali do ${yMax}%`}
        >
          <rect x={M_LEFT} y={M_TOP} width={innerW} height={innerH} fill="var(--background)" opacity={0.5} rx={10} />
          <rect x={highlightX} y={M_TOP} width={highlightW} height={innerH} fill="var(--muted)" opacity={0.82} rx={10} />

          {yTicks.map((tick) => {
            const y = yFor(tick);
            return (
              <g key={tick}>
                <line
                  x1={M_LEFT}
                  y1={y}
                  x2={VB_W - M_RIGHT}
                  y2={y}
                  stroke="var(--border)"
                  strokeWidth={tick === 0 ? 1 : 0.8}
                  strokeDasharray={tick === 0 ? undefined : "3 5"}
                  opacity={tick === 0 ? 0.75 : 0.55}
                />
                <text x={M_LEFT - 7} y={y + 3} className="font-mono" fontSize={10} fill="var(--muted-foreground)" textAnchor="end">
                  {tick}%
                </text>
              </g>
            );
          })}

          {quarters.map((quarter, index) => {
            const x = xFor(quarter);
            return (
              <g key={quarter}>
                <line x1={x} y1={M_TOP} x2={x} y2={VB_H - M_BOTTOM} stroke="var(--border)" strokeWidth={0.8} opacity={quarter === lastQuarter ? 0.48 : 0.28} />
                <text
                  x={x}
                  y={VB_H - (index % 2 === 0 ? 9 : 21)}
                  className="font-mono"
                  fontSize={10}
                  fill="var(--muted-foreground)"
                  textAnchor={index === 0 ? "start" : index === quarterCount - 1 ? "end" : "middle"}
                >
                  {quarterLabel(quarter)}
                </text>
              </g>
            );
          })}

          <text x={labelX} y={M_TOP + 8} fontSize={10} fill="var(--muted-foreground)" fontFamily="var(--font-jetbrains-mono)">
            Ostatni kwartał
          </text>

          {parties.map((series) => {
            const line = pathFromSeries(series.points, xFor, yFor, (point) => point.percentage_avg);
            return (
              <g key={series.party}>
                <path d={line} fill="none" stroke={series.color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                {series.points.map((point, index) => {
                  const isLast = index === series.points.length - 1;
                  return (
                    <circle
                      key={`${series.party}-${point.quarter_start}`}
                      cx={xFor(point.quarter_start)}
                      cy={yFor(point.percentage_avg)}
                      r={isLast ? 4.3 : 2.1}
                      fill="var(--background)"
                      stroke={series.color}
                      strokeWidth={isLast ? 2.2 : 1.5}
                      opacity={isLast ? 1 : 0.9}
                    />
                  );
                })}
              </g>
            );
          })}

          {legendItems.map((item) => {
            const width = labelWidth(item.label);
            const x = labelX;
            const y = item.centerY - labelHeight / 2;
            return (
              <g key={item.party}>
                <line
                  x1={Math.min(item.x + 8, VB_W - M_RIGHT + 2)}
                  y1={item.y}
                  x2={x - 8}
                  y2={item.centerY}
                  stroke={item.color}
                  strokeWidth={1.2}
                  opacity={0.72}
                />
                <rect
                  x={x}
                  y={y}
                  rx={11}
                  ry={11}
                  width={width}
                  height={labelHeight}
                  fill="var(--background)"
                  stroke={item.color}
                  strokeWidth={1.2}
                />
                <circle cx={x + 10} cy={item.centerY} r={3.2} fill={item.color} />
                <text
                  x={x + 20}
                  y={item.centerY + 4}
                  fontSize={11}
                  fill={item.color}
                  fontFamily="var(--font-jetbrains-mono)"
                  fontWeight={600}
                >
                  {item.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {lateStartSeries.length > 0 && (
        <p className="mt-3 font-mono text-[10px] text-muted-foreground tracking-wide">
          Późniejszy start osobnych serii: {lateStartSeries.join(" · ")}.
        </p>
      )}
    </section>
  );
}
