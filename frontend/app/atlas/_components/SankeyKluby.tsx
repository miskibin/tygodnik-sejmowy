"use client";

import { useMemo, useState } from "react";
import { SectionHead } from "./SectionHead";
import type { SankeyData } from "@/lib/db/atlas";
import { CLUB_LOGOS } from "@/lib/atlas/club-logos";

// Layout constants. Two-column flow chart: bars on the outer edges, ribbons
// in the middle. Self-stays are NEVER drawn as ribbons — that was the main
// readability disaster of the previous version (a huge grey blob crossing
// the whole chart). Instead a klub's "stayed" count is annotated inline
// inside its bar.
const W = 880;
const H = 420;
const COL_W = 16;
const LABEL_W = 132;
const LOGO = 22;
const X_LEFT = LABEL_W;
const X_RIGHT = W - COL_W - LABEL_W;
const GAP = 8;            // vertical gap between bars
const RIBBON_LABEL_MIN_H = 10;  // px — only show inline count when ribbon thick enough

type Migration = {
  fromKlub: string;
  toKlub: string;
  n: number;
  fromColor: string;
  toColor: string;
  // computed in layout pass:
  yL?: number;
  yR?: number;
  hL?: number;
  hR?: number;
  path?: string;
  gradId?: string;
};

type Bar = {
  klub: string;
  name: string;
  color: string;
  total: number;        // bar height in members
  stayed: number;       // members who didn't move (no ribbon drawn for these)
  moving: number;       // total - stayed (actual ribbons connect here)
  y: number;
  h: number;
  movingY: number;      // top of the "moving" sub-band within the bar
  movingH: number;      // height of the moving sub-band
};

export function SankeyKluby({ data }: { data: SankeyData }) {
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  const layout = useMemo(() => {
    const leftNodes = data.nodes.filter((n) => n.side === "L");
    const rightNodes = data.nodes.filter((n) => n.side === "R");

    // Migrations: flows where source klub != destination klub.
    const migrations: Migration[] = [];
    for (const f of data.flows) {
      const fromKlub = f.from.replace(/_L$/, "");
      const toKlub = f.to.replace(/_R$/, "");
      if (fromKlub === toKlub) continue;
      const fromNode = leftNodes.find((n) => n.name === fromKlub);
      const toNode = rightNodes.find((n) => n.name === toKlub);
      if (!fromNode || !toNode) continue;
      migrations.push({
        fromKlub,
        toKlub,
        n: f.n,
        fromColor: fromNode.color,
        toColor: toNode.color,
      });
    }

    // Self-stays: needed for inline annotations and to size the "moving" band of each bar.
    const selfStay = new Map<string, number>();
    for (const f of data.flows) {
      const fromKlub = f.from.replace(/_L$/, "");
      const toKlub = f.to.replace(/_R$/, "");
      if (fromKlub === toKlub) selfStay.set(fromKlub, f.n);
    }

    // Scale: both columns share usable height proportional to MAX side total.
    const totalL = leftNodes.reduce((s, n) => s + n.n, 0);
    const totalR = rightNodes.reduce((s, n) => s + n.n, 0);
    const maxSide = Math.max(totalL, totalR, 1);
    const usableH = H - GAP * (Math.max(leftNodes.length, rightNodes.length) - 1);
    const scale = usableH / maxSide;

    // Left bars: sort by size desc.
    const leftSorted = leftNodes.slice().sort((a, b) => b.n - a.n);
    const leftBars: Bar[] = [];
    let yL = 0;
    for (const n of leftSorted) {
      const h = n.n * scale;
      const stayed = selfStay.get(n.name) ?? 0;
      const moving = Math.max(0, n.n - stayed);
      const movingH = moving * scale;
      // Migrations leave from the TOP of the bar; stayed sits below.
      const movingY = yL;
      leftBars.push({
        klub: n.name,
        name: n.name,
        color: n.color,
        total: n.n,
        stayed,
        moving,
        y: yL,
        h,
        movingY,
        movingH,
      });
      yL += h + GAP;
    }

    // Right bars: gravity-sort to minimize ribbon crossings. For each right
    // node compute a weighted source-y based on the migrations landing on it,
    // then sort ascending by that. Nodes with no inter-klub inflow fall back
    // to natural size order at the bottom.
    const leftBarByKlub = new Map(leftBars.map((b) => [b.klub, b]));
    const rightWeighted = rightNodes.map((n) => {
      const incoming = migrations.filter((m) => m.toKlub === n.name);
      let wSum = 0;
      let wTotal = 0;
      for (const m of incoming) {
        const src = leftBarByKlub.get(m.fromKlub);
        if (!src) continue;
        const srcMid = src.movingY + (src.movingH * 0.5);
        wSum += srcMid * m.n;
        wTotal += m.n;
      }
      const weightedY = wTotal > 0 ? wSum / wTotal : Infinity; // no-inflow nodes go last
      return { node: n, weightedY };
    });
    rightWeighted.sort((a, b) => a.weightedY - b.weightedY || b.node.n - a.node.n);

    const rightBars: Bar[] = [];
    let yR = 0;
    for (const { node: n } of rightWeighted) {
      const h = n.n * scale;
      const stayed = selfStay.get(n.name) ?? 0;
      const moving = Math.max(0, n.n - stayed);
      const movingH = moving * scale;
      // Migrations land at the TOP of the right bar; stayed sits below.
      const movingY = yR;
      rightBars.push({
        klub: n.name,
        name: n.name,
        color: n.color,
        total: n.n,
        stayed,
        moving,
        y: yR,
        h,
        movingY,
        movingH,
      });
      yR += h + GAP;
    }
    const rightBarByKlub = new Map(rightBars.map((b) => [b.klub, b]));

    // Ribbon stacking: within each bar's "moving" sub-band, stack ribbons in
    // priority order (largest first). Sort migrations by source bar position
    // first (top→bottom) so source-side stacking matches visual flow.
    const migsSorted = migrations.slice().sort((a, b) => {
      const aSrc = leftBarByKlub.get(a.fromKlub);
      const bSrc = leftBarByKlub.get(b.fromKlub);
      if (aSrc && bSrc && aSrc.y !== bSrc.y) return aSrc.y - bSrc.y;
      return b.n - a.n;
    });

    const offL = new Map<string, number>();
    const offR = new Map<string, number>();
    for (const m of migsSorted) {
      const src = leftBarByKlub.get(m.fromKlub);
      const dst = rightBarByKlub.get(m.toKlub);
      if (!src || !dst) continue;
      const hL = m.n * scale;
      const hR = m.n * scale;
      const oL = offL.get(m.fromKlub) ?? 0;
      const oR = offR.get(m.toKlub) ?? 0;
      offL.set(m.fromKlub, oL + hL);
      offR.set(m.toKlub, oR + hR);
      m.yL = src.movingY + oL + hL / 2;
      m.yR = dst.movingY + oR + hR / 2;
      m.hL = hL;
      m.hR = hR;
      const xa = X_LEFT + COL_W;
      const xb = X_RIGHT;
      const cx1 = xa + (xb - xa) * 0.5;
      const cx2 = xb - (xb - xa) * 0.5;
      m.path = `M${xa.toFixed(1)},${m.yL.toFixed(1)} C${cx1.toFixed(1)},${m.yL.toFixed(1)} ${cx2.toFixed(1)},${m.yR.toFixed(1)} ${xb.toFixed(1)},${m.yR.toFixed(1)}`;
      m.gradId = `grad-${m.fromKlub}-${m.toKlub}`.replace(/[^a-zA-Z0-9-]/g, "_");
    }

    return { leftBars, rightBars, migrations: migsSorted };
  }, [data.nodes, data.flows]);

  const quarterLabel = (() => {
    if (!data.quarter) return "";
    const d = new Date(data.quarter);
    const q = Math.floor(d.getUTCMonth() / 3) + 1;
    return `Q${q} ${d.getUTCFullYear()}`;
  })();

  // Ordered transitions list for the panel under the chart.
  const sortedMigrations = layout.migrations.slice().sort((a, b) => b.n - a.n);

  return (
    <section>
      <SectionHead
        num="03"
        kicker="Migracje"
        title="Przepływ posłów między klubami"
        sub={quarterLabel ? `${quarterLabel}. Wstęgi pokazują tylko realne przejścia między klubami — posłowie którzy zostali, są oznaczeni liczbą wewnątrz słupka.` : "Wstęgi pokazują tylko realne przejścia między klubami."}
      />
      <div
        className="border border-border px-7 py-8 relative"
        style={{ background: "var(--muted)" }}
      >
        <div className="flex justify-between font-mono text-[10px] uppercase text-muted-foreground tracking-[0.16em] mb-4">
          <span>Stan początkowy {quarterLabel}</span>
          <span>Stan końcowy {quarterLabel}</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H + 40}`} className="w-full block">
          <defs>
            {layout.migrations.map((m) => (
              <linearGradient key={m.gradId} id={m.gradId} x1={X_LEFT + COL_W} x2={X_RIGHT} y1={0} y2={0} gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor={m.fromColor} />
                <stop offset="100%" stopColor={m.toColor} />
              </linearGradient>
            ))}
          </defs>

          {/* Ribbons (inter-klub migrations only). */}
          {layout.migrations.map((m, i) => {
            const key = `${m.fromKlub}>${m.toKlub}`;
            const isHover = hoverKey === key;
            const dim = hoverKey !== null && !isHover;
            const h = Math.max(m.hL ?? 1, 1.5);
            return (
              <g key={`mig-${i}`}>
                <path
                  d={m.path}
                  stroke={`url(#${m.gradId})`}
                  strokeWidth={h}
                  fill="none"
                  opacity={dim ? 0.18 : isHover ? 1 : 0.78}
                  onMouseEnter={() => setHoverKey(key)}
                  onMouseLeave={() => setHoverKey(null)}
                  style={{ cursor: "pointer", transition: "opacity 0.18s" }}
                >
                  <title>{`${m.fromKlub} → ${m.toKlub}: ${m.n} ${m.n === 1 ? "poseł" : "posłów"}`}</title>
                </path>
                {h >= RIBBON_LABEL_MIN_H && (
                  <text
                    x={(X_LEFT + COL_W + X_RIGHT) / 2}
                    y={((m.yL ?? 0) + (m.yR ?? 0)) / 2 + 3}
                    textAnchor="middle"
                    fontFamily="ui-monospace"
                    fontSize="10"
                    fontWeight="700"
                    fill="var(--foreground)"
                    style={{
                      pointerEvents: "none",
                      paintOrder: "stroke",
                      stroke: "var(--muted)",
                      strokeWidth: 3,
                      strokeLinejoin: "round",
                    }}
                  >
                    {m.n}
                  </text>
                )}
              </g>
            );
          })}

          {/* Left bars: stayed (lighter, bottom) + moving (full color, top). */}
          {layout.leftBars.map((b) => {
            const logo = CLUB_LOGOS[b.name];
            const logoX = X_LEFT - LOGO - 10;
            const textX = logoX - 6;
            const stayedY = b.movingY + b.movingH;
            const stayedH = b.h - b.movingH;
            return (
              <g key={`L-${b.klub}`}>
                {b.movingH > 0 && (
                  <rect x={X_LEFT} y={b.movingY} width={COL_W} height={b.movingH} fill={b.color} />
                )}
                {stayedH > 0 && (
                  <rect x={X_LEFT} y={stayedY} width={COL_W} height={stayedH} fill={b.color} opacity={0.32} />
                )}
                {logo && (
                  <image
                    href={`/club-logos/${logo.file}`}
                    x={logoX}
                    y={b.y + b.h / 2 - LOGO / 2}
                    width={LOGO}
                    height={LOGO}
                    preserveAspectRatio="xMidYMid meet"
                  />
                )}
                <text x={textX} y={b.y + b.h / 2 - 3} textAnchor="end" fontFamily="serif" fontSize="13" fontWeight="500" fill="var(--foreground)">
                  {b.name}
                </text>
                <text x={textX} y={b.y + b.h / 2 + 12} textAnchor="end" fontFamily="ui-monospace" fontSize="10" fill="var(--muted-foreground)">
                  {b.total}
                  {b.stayed > 0 && b.moving > 0 ? ` (-${b.moving})` : ""}
                </text>
              </g>
            );
          })}

          {/* Right bars: moving (full color, top) lands the inflow ribbons; stayed (lighter, bottom). */}
          {layout.rightBars.map((b) => {
            const logo = CLUB_LOGOS[b.name];
            const logoX = X_RIGHT + COL_W + 10;
            const textX = logoX + LOGO + 6;
            const stayedY = b.movingY + b.movingH;
            const stayedH = b.h - b.movingH;
            return (
              <g key={`R-${b.klub}`}>
                {b.movingH > 0 && (
                  <rect x={X_RIGHT} y={b.movingY} width={COL_W} height={b.movingH} fill={b.color} />
                )}
                {stayedH > 0 && (
                  <rect x={X_RIGHT} y={stayedY} width={COL_W} height={stayedH} fill={b.color} opacity={0.32} />
                )}
                {logo && (
                  <image
                    href={`/club-logos/${logo.file}`}
                    x={logoX}
                    y={b.y + b.h / 2 - LOGO / 2}
                    width={LOGO}
                    height={LOGO}
                    preserveAspectRatio="xMidYMid meet"
                  />
                )}
                <text x={textX} y={b.y + b.h / 2 - 3} fontFamily="serif" fontSize="13" fontWeight="500" fill="var(--foreground)">
                  {b.name}
                </text>
                <text x={textX} y={b.y + b.h / 2 + 12} fontFamily="ui-monospace" fontSize="10" fill="var(--muted-foreground)">
                  {b.total}
                  {b.stayed > 0 && b.moving > 0 ? ` (+${b.moving})` : ""}
                </text>
              </g>
            );
          })}

          {/* Inline "stayed" annotation per side. Only when the bar is tall enough. */}
          {[...layout.leftBars, ...layout.rightBars].map((b, i) => {
            if (b.stayed === 0) return null;
            const stayedH = b.h - b.movingH;
            if (stayedH < 14) return null;
            const isLeft = layout.leftBars.includes(b);
            const x = isLeft ? X_LEFT + COL_W + 6 : X_RIGHT - 6;
            const y = b.movingY + b.movingH + stayedH / 2 + 3;
            return (
              <text
                key={`stay-${i}`}
                x={x}
                y={y}
                textAnchor={isLeft ? "start" : "end"}
                fontFamily="ui-monospace"
                fontSize="9"
                fill="var(--muted-foreground)"
                fontStyle="italic"
                style={{ pointerEvents: "none" }}
              >
                ↳ {b.stayed} zostało
              </text>
            );
          })}
        </svg>
      </div>

      {/* Transitions list — the chart's narrative companion. */}
      {sortedMigrations.length > 0 && (
        <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {sortedMigrations.map((m, i) => {
            const fromLogo = CLUB_LOGOS[m.fromKlub];
            const toLogo = CLUB_LOGOS[m.toKlub];
            const key = `${m.fromKlub}>${m.toKlub}`;
            const isHover = hoverKey === key;
            return (
              <button
                key={`tr-${i}`}
                type="button"
                onMouseEnter={() => setHoverKey(key)}
                onMouseLeave={() => setHoverKey(null)}
                onFocus={() => setHoverKey(key)}
                onBlur={() => setHoverKey(null)}
                className={`flex items-center gap-3 px-3 py-2 border ${isHover ? "border-foreground bg-muted" : "border-border bg-background"} text-left font-sans text-[12px] transition`}
              >
                <span className="inline-flex items-center gap-2 min-w-0">
                  {fromLogo ? (
                    <img src={`/club-logos/${fromLogo.file}`} alt="" width={18} height={18} className="shrink-0" />
                  ) : (
                    <span className="inline-block w-[18px] h-[18px] rounded-full" style={{ background: m.fromColor }} />
                  )}
                  <span className="font-serif text-[13px] truncate">{m.fromKlub}</span>
                </span>
                <span className="font-mono text-destructive">→</span>
                <span className="inline-flex items-center gap-2 min-w-0">
                  {toLogo ? (
                    <img src={`/club-logos/${toLogo.file}`} alt="" width={18} height={18} className="shrink-0" />
                  ) : (
                    <span className="inline-block w-[18px] h-[18px] rounded-full" style={{ background: m.toColor }} />
                  )}
                  <span className="font-serif text-[13px] truncate">{m.toKlub}</span>
                </span>
                <span className="ml-auto font-mono text-[13px] font-bold text-foreground">
                  {m.n}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <p className="mt-4 font-mono text-[10px] tracking-wider text-muted-foreground leading-relaxed">
        Dane: klub_flow_quarter (mig 0058). „Stan początkowy” rekonstruowany z&nbsp;current_size + outflows − inflows. Słupki pokazują liczebność klubu; jaśniejsza dolna część to&nbsp;posłowie, którzy zostali. Wstęgi rysowane tylko dla&nbsp;realnych przejść.
      </p>
    </section>
  );
}
