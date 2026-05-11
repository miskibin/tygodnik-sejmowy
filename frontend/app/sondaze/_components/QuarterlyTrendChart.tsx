import type { PollTrendRow } from "@/lib/db/polls";
import { partyColor, partyLabel } from "./partyMeta";

const VB_W = 980;
const VB_H = 360;
const M_LEFT = 42;
const M_RIGHT = 170;
const M_TOP = 18;
const M_BOTTOM = 28;
const Y_MIN = 0;
const Y_MAX = 50;

function quarterLabel(iso: string): string {
  // 2025-04-01 -> '25 Q2
  const d = new Date(iso + "T00:00:00Z");
  const y = String(d.getUTCFullYear()).slice(2);
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `'${y} Q${q}`;
}

function labelWidth(label: string): number {
  return Math.max(68, Math.min(150, 16 + label.length * 6.4));
}

export function QuarterlyTrendChart({ rows }: { rows: PollTrendRow[] }) {
  if (rows.length === 0) {
    return (
      <section>
        <p className="font-serif text-muted-foreground">Brak danych trendu.</p>
      </section>
    );
  }

  // Build ordered quarter axis from all rows.
  const quarters = Array.from(new Set(rows.map((r) => r.quarter_start))).sort();
  const xCount = quarters.length;
  const xIndex = new Map(quarters.map((q, i) => [q, i]));

  const innerW = VB_W - M_LEFT - M_RIGHT;
  const innerH = VB_H - M_TOP - M_BOTTOM;

  const xFor = (q: string): number => {
    const i = xIndex.get(q) ?? 0;
    if (xCount <= 1) return M_LEFT + innerW / 2;
    return M_LEFT + (i / (xCount - 1)) * innerW;
  };
  const yFor = (pct: number): number => {
    const t = (pct - Y_MIN) / (Y_MAX - Y_MIN);
    return M_TOP + (1 - Math.max(0, Math.min(1, t))) * innerH;
  };

  // Group by party.
  const byParty = new Map<string, PollTrendRow[]>();
  for (const r of rows) {
    const arr = byParty.get(r.party_code) ?? [];
    arr.push(r);
    byParty.set(r.party_code, arr);
  }
  for (const arr of byParty.values()) {
    arr.sort((a, b) => a.quarter_start.localeCompare(b.quarter_start));
  }

  const yTicks = [0, 10, 20, 30, 40, 50];
  const labelData = Array.from(byParty.entries())
    .map(([party, points]) => {
      const last = points[points.length - 1];
      return {
        party,
        label: partyLabel(party),
        color: partyColor(party),
        pct: last.percentage_avg,
        x: xFor(last.quarter_start),
        y: yFor(last.percentage_avg),
      };
    })
    .sort((a, b) => a.y - b.y);

  const labelHeight = 22;
  const minGap = 10;
  const topBound = M_TOP + labelHeight / 2;
  const bottomBound = VB_H - M_BOTTOM - labelHeight / 2;
  let prevBottom = topBound - labelHeight - minGap;
  const placedLabels = labelData.map((item) => {
    let centerY = Math.max(item.y, prevBottom + labelHeight + minGap);
    centerY = Math.min(centerY, bottomBound);
    prevBottom = centerY + labelHeight / 2;
    return { ...item, centerY };
  }).reverse().map((item, idx, arr) => {
    const nextTop = idx === 0 ? bottomBound + labelHeight / 2 : arr[idx - 1].centerY - labelHeight - minGap;
    const centerY = Math.min(item.centerY, nextTop);
    return { ...item, centerY: Math.max(centerY, topBound) };
  }).reverse();
  const labelX = VB_W - M_RIGHT + 14;

  return (
    <section>
      <header className="mb-5 pb-3 border-b border-rule grid min-w-0 items-start gap-4 sm:items-baseline sm:gap-5 [grid-template-columns:minmax(0,44px)_minmax(0,1fr)] sm:[grid-template-columns:minmax(0,60px)_minmax(0,1fr)]">
        <div className="font-serif italic font-normal text-destructive leading-[0.9] text-[clamp(2.25rem,9vw,3.5rem)] sm:text-[56px]">C</div>
        <div className="min-w-0">
          <div className="font-sans text-[10px] sm:text-[11px] tracking-[0.12em] sm:tracking-[0.16em] uppercase text-muted-foreground mb-1.5">
            Trzy lata, {byParty.size} {byParty.size === 1 ? "partia" : byParty.size < 5 ? "partie" : "partii"}
          </div>
          <h2 className="font-serif font-medium m-0 leading-[1.05] text-[clamp(1.5rem,5.5vw,2.25rem)] tracking-[-0.01em]">Trendy kwartalne</h2>
        </div>
      </header>

      <div className="bg-muted border border-border p-2 sm:p-4 min-w-0 overflow-x-auto">
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="w-full min-w-[320px] h-auto block" role="img" aria-label={`Wykres trendu kwartalnego ${byParty.size} partii`}>
          <rect x={M_LEFT} y={M_TOP} width={innerW} height={innerH} fill="var(--background)" opacity={0.38} rx={8} />

          {yTicks.map((t) => {
            const y = yFor(t);
            return (
              <g key={t}>
                <line x1={M_LEFT} y1={y} x2={VB_W - M_RIGHT} y2={y} stroke="var(--border)" strokeWidth={0.8} strokeDasharray={t === 0 ? undefined : "3 5"} opacity={t === 0 ? 0.75 : 0.55} />
                <text x={M_LEFT - 6} y={y + 3} className="font-mono" fontSize={10} fill="var(--muted-foreground)" textAnchor="end">
                  {t}%
                </text>
              </g>
            );
          })}

          {quarters.map((q, i) => {
            const stride = xCount > 8 ? 2 : 1;
            if (i % stride !== 0 && i !== xCount - 1) return null;
            const x = xFor(q);
            return (
              <text key={q} x={x} y={VB_H - 8} className="font-mono" fontSize={10} fill="var(--muted-foreground)" textAnchor="middle">
                {quarterLabel(q)}
              </text>
            );
          })}

          {Array.from(byParty.entries()).map(([party, points]) => {
            const color = partyColor(party);
            const poly = points.map((p) => `${xFor(p.quarter_start)},${yFor(p.percentage_avg)}`).join(" ");
            const last = points[points.length - 1];
            return (
              <g key={party}>
                <polyline points={poly} fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
                {points.map((p, idx) => (
                  <circle
                    key={`${party}-${p.quarter_start}`}
                    cx={xFor(p.quarter_start)}
                    cy={yFor(p.percentage_avg)}
                    r={p.quarter_start === last.quarter_start ? 4.2 : 2.2}
                    fill="var(--background)"
                    stroke={color}
                    strokeWidth={p.quarter_start === last.quarter_start ? 2.4 : 1.6}
                    opacity={idx === points.length - 1 ? 1 : 0.9}
                  />
                ))}
              </g>
            );
          })}

          {placedLabels.map((item) => {
            const text = `${item.label} ${item.pct.toFixed(1)}%`;
            const w = labelWidth(text);
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
                  opacity={0.65}
                />
                <rect
                  x={x}
                  y={y}
                  rx={10}
                  ry={10}
                  width={w}
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
                  {text}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}
