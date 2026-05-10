import type { PollTrendRow } from "@/lib/db/polls";
import { partyColor, partyLabel } from "./partyMeta";

const VB_W = 920;
const VB_H = 320;
const M_LEFT = 40;
const M_RIGHT = 100;
const M_TOP = 20;
const M_BOTTOM = 30;
const Y_MIN = 0;
const Y_MAX = 50;

function quarterLabel(iso: string): string {
  // 2025-04-01 -> '25 Q2
  const d = new Date(iso + "T00:00:00Z");
  const y = String(d.getUTCFullYear()).slice(2);
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `'${y} Q${q}`;
}

function quarterKey(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `${d.getUTCFullYear()}-Q${q}`;
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

  return (
    <section>
      <header className="mb-6 pb-3.5 border-b border-rule grid min-w-0 items-start gap-4 sm:items-baseline sm:gap-5 [grid-template-columns:minmax(0,44px)_minmax(0,1fr)] sm:[grid-template-columns:minmax(0,60px)_minmax(0,1fr)]">
        <div className="font-serif italic font-normal text-destructive leading-[0.9] text-[clamp(2.25rem,9vw,3.5rem)] sm:text-[56px]">C</div>
        <div className="min-w-0">
          <div className="font-sans text-[10px] sm:text-[11px] tracking-[0.12em] sm:tracking-[0.16em] uppercase text-muted-foreground mb-1.5">
            Trzy lata, {byParty.size} {byParty.size === 1 ? "partia" : byParty.size < 5 ? "partie" : "partii"}
          </div>
          <h2 className="font-serif font-medium m-0 leading-[1.05] text-[clamp(1.5rem,5.5vw,2.25rem)] tracking-[-0.01em]">Trendy kwartalne</h2>
          <p className="font-serif m-0 mt-2 text-secondary-foreground leading-[1.5] max-w-[720px] text-[15px] sm:text-base">
            Średnia kwartalna z wszystkich sondaży w danym kwartale. Każdy punkt — jeden kwartał.
            Pokazujemy partie z bieżącą średnią ≥ 3% (w tym KKP Brauna i Razem — poza Sejmem, ale silnie sondażowane).
          </p>
        </div>
      </header>

      <div className="bg-muted border border-border p-2 sm:p-4 min-w-0 overflow-x-auto">
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="w-full min-w-[320px] h-auto block" role="img" aria-label={`Wykres trendu kwartalnego ${byParty.size} partii`}>
          {/* Y gridlines + labels */}
          {yTicks.map((t) => {
            const y = yFor(t);
            return (
              <g key={t}>
                <line x1={M_LEFT} y1={y} x2={VB_W - M_RIGHT} y2={y} stroke="var(--border)" strokeWidth={0.75} />
                <text x={M_LEFT - 6} y={y + 3} className="font-mono" fontSize={10} fill="var(--muted-foreground)" textAnchor="end">
                  {t}%
                </text>
              </g>
            );
          })}

          {/* X labels (every 2nd if many) */}
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

          {/* Lines per party */}
          {Array.from(byParty.entries()).map(([party, points]) => {
            const color = partyColor(party);
            const poly = points.map((p) => `${xFor(p.quarter_start)},${yFor(p.percentage_avg)}`).join(" ");
            return (
              <g key={party}>
                <polyline points={poly} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                {points.map((p) => (
                  <circle
                    key={`${party}-${p.quarter_start}`}
                    cx={xFor(p.quarter_start)}
                    cy={yFor(p.percentage_avg)}
                    r={3}
                    fill="var(--background)"
                    stroke={color}
                    strokeWidth={1.5}
                  >
                    <title>
                      {partyLabel(party)} — {quarterKey(p.quarter_start)}: {p.percentage_avg.toFixed(1)}% (n={p.n_polls})
                    </title>
                  </circle>
                ))}
              </g>
            );
          })}

          {/* Endpoint labels with collision avoidance: cluster around 5–15%
              would otherwise stack illegibly. Sort by raw y, then push each
              label down to maintain MIN_GAP separation, with a leader line
              from the actual endpoint to the dodged label. */}
          {(() => {
            const MIN_GAP = 12;
            const labels = Array.from(byParty.entries()).map(([party, points]) => {
              const last = points[points.length - 1];
              return {
                party,
                color: partyColor(party),
                anchorX: xFor(last.quarter_start),
                anchorY: yFor(last.percentage_avg),
              };
            });
            labels.sort((a, b) => a.anchorY - b.anchorY);
            const placedY: number[] = [];
            for (let i = 0; i < labels.length; i++) {
              let y = labels[i].anchorY;
              if (i > 0 && y < placedY[i - 1] + MIN_GAP) y = placedY[i - 1] + MIN_GAP;
              placedY.push(y);
            }
            const labelX = VB_W - M_RIGHT + 8;
            return labels.map((l, i) => {
              const ly = placedY[i];
              const dodged = Math.abs(ly - l.anchorY) > 1.5;
              return (
                <g key={l.party}>
                  {dodged && (
                    <line
                      x1={l.anchorX + 3}
                      y1={l.anchorY}
                      x2={labelX - 2}
                      y2={ly - 2}
                      stroke={l.color}
                      strokeWidth={0.75}
                      opacity={0.5}
                    />
                  )}
                  <text
                    x={labelX}
                    y={ly + 2}
                    className="font-mono"
                    fontSize={10}
                    fill={l.color}
                    fontWeight={600}
                  >
                    {l.party}
                  </text>
                </g>
              );
            });
          })()}
        </svg>
      </div>
      <p className="mt-3 font-mono text-[10px] text-muted-foreground italic tracking-wide">
        Dystans pionowy 0–50%. Najechanie na punkt pokaże dokładną wartość i liczbę sondaży w kwartale.
      </p>
    </section>
  );
}
