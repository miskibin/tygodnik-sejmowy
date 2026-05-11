import type { PollTrendRow } from "@/lib/db/polls";
import { partyColor, partyLabel } from "./partyMeta";

const VB_W = 980;
const VB_H = 390;
const M_LEFT = 42;
const M_RIGHT = 168;
const M_TOP = 18;
const M_BOTTOM = 30;
const Y_MIN = 0;
const Y_MAX = 50;
const BREAK_AT = 15;
const BREAK_GAP = 18;

function quarterLabel(iso: string): string {
  // 2025-04-01 -> '25 Q2
  const d = new Date(iso + "T00:00:00Z");
  const y = String(d.getUTCFullYear()).slice(2);
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `'${y} Q${q}`;
}

function labelWidth(label: string): number {
  return Math.max(74, Math.min(156, 18 + label.length * 6.15));
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

function placeLabels<T extends { y: number }>(
  items: T[],
  topBound: number,
  bottomBound: number,
  labelHeight: number,
  minGap: number,
): Array<T & { centerY: number }> {
  let prevBottom = topBound - labelHeight - minGap;
  return items
    .map((item) => {
      let centerY = Math.max(item.y, prevBottom + labelHeight + minGap);
      centerY = Math.min(centerY, bottomBound);
      prevBottom = centerY + labelHeight / 2;
      return { ...item, centerY };
    })
    .reverse()
    .map((item, index, arr) => {
      const nextTop = index === 0
        ? bottomBound + labelHeight / 2
        : arr[index - 1].centerY - labelHeight - minGap;
      const centerY = Math.min(item.centerY, nextTop);
      return { ...item, centerY: Math.max(centerY, topBound) };
    })
    .reverse();
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
  const lowerH = Math.round(innerH * 0.58);
  const upperH = innerH - lowerH - BREAK_GAP;
  const upperBottom = M_TOP + upperH;
  const lowerTop = upperBottom + BREAK_GAP;

  const xFor = (quarter: string): number => {
    const index = xIndex.get(quarter) ?? 0;
    if (quarterCount <= 1) return M_LEFT + innerW / 2;
    return M_LEFT + (index / (quarterCount - 1)) * innerW;
  };
  const yFor = (pct: number): number => {
    const clamped = Math.max(Y_MIN, Math.min(Y_MAX, pct));
    if (clamped <= BREAK_AT) {
      const t = clamped / BREAK_AT;
      return lowerTop + (1 - t) * lowerH;
    }
    const t = (clamped - BREAK_AT) / (Y_MAX - BREAK_AT);
    return M_TOP + (1 - t) * upperH;
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

  const lastQuarter = quarters[quarters.length - 1];
  const firstQuarter = quarters[0];
  const lastQuarterX = xFor(lastQuarter);
  const highlightX = Math.max(M_LEFT, lastQuarterX - 24);
  const highlightW = Math.min(48, VB_W - M_RIGHT - highlightX);

  const labelHeight = 22;
  const labelX = VB_W - M_RIGHT + 14;
  const labelsUpper = parties
    .filter((series) => series.last.percentage_avg > BREAK_AT)
    .map((series) => ({
      party: series.party,
      label: `${series.label} ${series.last.percentage_avg.toFixed(1)}%`,
      color: series.color,
      x: xFor(series.last.quarter_start),
      y: yFor(series.last.percentage_avg),
    }))
    .sort((a, b) => a.y - b.y);
  const labelsLower = parties
    .filter((series) => series.last.percentage_avg <= BREAK_AT)
    .map((series) => ({
      party: series.party,
      label: `${series.label} ${series.last.percentage_avg.toFixed(1)}%`,
      color: series.color,
      x: xFor(series.last.quarter_start),
      y: yFor(series.last.percentage_avg),
    }))
    .sort((a, b) => a.y - b.y);
  const placedLabels = [
    ...placeLabels(labelsUpper, M_TOP + labelHeight / 2, upperBottom - labelHeight / 2, labelHeight, 8),
    ...placeLabels(labelsLower, lowerTop + labelHeight / 2, VB_H - M_BOTTOM - labelHeight / 2, labelHeight, 8),
  ];
  const xTickStride = quarterCount > 8 ? 2 : 1;

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
            Jedna wspólna plansza, ale ze złamaną skalą: przedział 0-15% dostał więcej pionowego miejsca, więc mniejsze partie przestają ginąć pod KO i PiS.
          </p>
        </div>
      </header>

      <div className="border border-border bg-muted p-2 sm:p-4 min-w-0 overflow-x-auto">
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          className="w-full min-w-[320px] h-auto block"
          role="img"
          aria-label={`Wykres trendu kwartalnego ${parties.length} partii ze złamaną skalą osi Y`}
        >
          <rect x={M_LEFT} y={M_TOP} width={innerW} height={upperH} fill="var(--background)" opacity={0.42} rx={10} />
          <rect x={M_LEFT} y={lowerTop} width={innerW} height={lowerH} fill="var(--background)" opacity={0.68} rx={10} />
          <rect x={highlightX} y={M_TOP} width={highlightW} height={upperH} fill="var(--muted)" opacity={0.72} rx={10} />
          <rect x={highlightX} y={lowerTop} width={highlightW} height={lowerH} fill="var(--muted)" opacity={0.86} rx={10} />

          {[20, 30, 40, 50].map((tick) => {
            const y = yFor(tick);
            return (
              <g key={tick}>
                <line x1={M_LEFT} y1={y} x2={VB_W - M_RIGHT} y2={y} stroke="var(--border)" strokeWidth={0.8} strokeDasharray="3 5" opacity={0.55} />
                <text x={M_LEFT - 7} y={y + 3} className="font-mono" fontSize={10} fill="var(--muted-foreground)" textAnchor="end">
                  {tick}%
                </text>
              </g>
            );
          })}

          {[0, 5, 10, 15].map((tick) => {
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
                <line x1={x} y1={M_TOP} x2={x} y2={upperBottom} stroke="var(--border)" strokeWidth={0.8} opacity={quarter === lastQuarter ? 0.5 : 0.28} />
                <line x1={x} y1={lowerTop} x2={x} y2={VB_H - M_BOTTOM} stroke="var(--border)" strokeWidth={0.8} opacity={quarter === lastQuarter ? 0.5 : 0.28} />
                {(index % xTickStride === 0 || index === quarterCount - 1) && (
                  <text x={x} y={VB_H - 9} className="font-mono" fontSize={10} fill="var(--muted-foreground)" textAnchor="middle">
                    {quarterLabel(quarter)}
                  </text>
                )}
              </g>
            );
          })}

          <g opacity={0.85}>
            <path d={`M ${M_LEFT - 2} ${upperBottom - 6} l 6 4 l -6 4 l 6 4`} stroke="var(--muted-foreground)" strokeWidth={1.1} fill="none" />
            <path d={`M ${M_LEFT - 2} ${lowerTop - 12} l 6 4 l -6 4 l 6 4`} stroke="var(--muted-foreground)" strokeWidth={1.1} fill="none" />
          </g>

          <text x={VB_W - M_RIGHT - 8} y={M_TOP + 14} className="font-mono" fontSize={10} fill="var(--muted-foreground)" textAnchor="end">
            15-50% (ściśnięte)
          </text>
          <text x={VB_W - M_RIGHT - 8} y={lowerTop + 14} className="font-mono" fontSize={10} fill="var(--muted-foreground)" textAnchor="end">
            0-15% (powiększone)
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
                      r={isLast ? 4.3 : 2.3}
                      fill="var(--background)"
                      stroke={series.color}
                      strokeWidth={isLast ? 2.2 : 1.6}
                    />
                  );
                })}
              </g>
            );
          })}

          {placedLabels.map((item) => {
            const width = labelWidth(item.label);
            const x = labelX;
            const y = item.centerY - labelHeight / 2;
            return (
              <g key={item.party}>
                <line
                  x1={item.x + 6}
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
                <text
                  x={x + 10}
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
    </section>
  );
}
