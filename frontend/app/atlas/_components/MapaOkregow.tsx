"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { SectionHead } from "./SectionHead";
import type { MapData, MapDistrict } from "@/lib/db/atlas";
import { KLUB_COLORS, KLUB_LABELS } from "@/lib/atlas/constants";
import { POLAND_VOIVODESHIPS, POLAND_OUTLINE } from "@/lib/atlas/poland-shapes";
import { OKREGI_POLYGONS } from "@/lib/atlas/okregi-shapes";
import { ClubLogo } from "@/components/atlas/ClubLogo";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const PL_BBOX = { minLon: 14.1, maxLon: 24.2, minLat: 49.0, maxLat: 54.9 };
const W = 760;
const H = 580;

function project(lon: number, lat: number): [number, number] {
  const x = ((lon - PL_BBOX.minLon) / (PL_BBOX.maxLon - PL_BBOX.minLon)) * W;
  const y = H - ((lat - PL_BBOX.minLat) / (PL_BBOX.maxLat - PL_BBOX.minLat)) * H;
  return [x, y];
}

function polylinePath(pts: Array<[number, number]>, close = true): string {
  if (pts.length < 2) return "";
  const p = pts.map(([lon, lat]) => project(lon, lat));
  let d = `M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`;
  for (let i = 1; i < p.length; i++) d += `L${p[i][0].toFixed(1)},${p[i][1].toFixed(1)}`;
  if (close) d += "Z";
  return d;
}

function ringsToD(rings: Array<Array<[number, number]>>): string {
  return rings.map((r) => polylinePath(r, true)).join(" ");
}

const CITIES: Array<[string, number, number]> = [
  ["Warszawa", 21.01, 52.4],
  ["Kraków", 19.94, 49.92],
  ["Gdańsk", 18.65, 54.55],
  ["Poznań", 16.93, 52.55],
  ["Wrocław", 17.04, 50.95],
  ["Łódź", 19.46, 51.62],
  ["Szczecin", 14.55, 53.55],
  ["Lublin", 22.57, 51.1],
];

type Mode = "klub" | "turnout" | "age" | "mp_count";

const MODES: Array<{ id: Mode; label: string }> = [
  { id: "klub", label: "Klub dominujący" },
  { id: "turnout", label: "Frekwencja głos." },
  { id: "age", label: "Średnia wieku" },
  { id: "mp_count", label: "Liczba MP" },
];

// Continuous color scales for each numeric mode (red-ramp 75→100% / 35→65 / 6→14).
function turnoutColor(t: number): string {
  const n = Math.max(0, Math.min(1, (t - 75) / 25));
  return `hsl(8, 60%, ${92 - n * 50}%)`;
}
function ageColor(a: number): string {
  const n = Math.max(0, Math.min(1, (a - 35) / 30));
  return `hsl(220, 30%, ${88 - n * 45}%)`;
}
function mpColor(c: number): string {
  const n = Math.max(0, Math.min(1, (c - 6) / 14));
  return `hsl(150, 35%, ${88 - n * 45}%)`;
}

function colorFor(d: MapDistrict, mode: Mode): string {
  if (mode === "klub") return KLUB_COLORS[d.klub] ?? "var(--muted-foreground)";
  if (mode === "turnout") return turnoutColor(d.turnout);
  if (mode === "age") return d.avgAge != null ? ageColor(d.avgAge) : "var(--border)";
  return d.mpCount != null ? mpColor(d.mpCount) : "var(--border)";
}

export function MapaOkregow({ data }: { data: MapData }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("klub");
  // hoverId drives both the polygon affordance AND the side card.
  // Click on a polygon navigates to /atlas/okreg/[num] directly.
  const [hoverId, setHoverId] = useState<number | null>(null);

  const polysById = useMemo(
    () => new Map(OKREGI_POLYGONS.map((p) => [p.id, p])),
    [],
  );

  const slices = useMemo(
    () =>
      data.districts
        .map((d) => {
          const poly = polysById.get(d.id);
          if (!poly) return null;
          const [lx, ly] = project(poly.centroid[0], poly.centroid[1]);
          return { d, poly, dPath: ringsToD(poly.rings), lx, ly };
        })
        .filter((s): s is NonNullable<typeof s> => s !== null),
    [data.districts, polysById],
  );

  const sel = hoverId != null ? data.districts.find((d) => d.id === hoverId) : null;
  const klubsInLegend = useMemo(
    () => Array.from(new Set(data.districts.map((d) => d.klub))),
    [data.districts],
  );

  return (
    <section className="min-w-0">
      <SectionHead
        num="01"
        kicker="Geografia władzy"
        title="Mapa Polski po okręgach"
        sub="41 okręgów wyborczych do Sejmu RP. Najedź lub kliknij okręg — szczegóły po prawej."
        isMock={data.isMock}
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-3 mb-4 sm:mb-5 font-sans text-[12px] items-stretch sm:items-center min-w-0">
        <span className="text-muted-foreground uppercase tracking-[0.14em] text-[10px] shrink-0">dataset</span>
        <div className="min-w-0 w-full max-w-full overflow-x-auto pb-0.5 -mx-1 px-1 sm:mx-0 sm:px-0 sm:overflow-visible">
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(v) => v && setMode(v as Mode)}
          variant="outline"
          size="sm"
        >
          {MODES.map((m) => (
            <ToggleGroupItem key={m.id} value={m.id} aria-label={m.label}>
              {m.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        </div>
      </div>

      <div className="grid min-w-0 gap-8 lg:[grid-template-columns:1fr_300px] items-start">
        <div
          className="min-w-0 w-full max-w-full bg-muted border border-border relative"
          style={{ aspectRatio: `${W} / ${H}` }}
        >
          <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full max-w-full">
            <defs>
              <pattern id="atlas-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="6" stroke="var(--border)" strokeWidth="1" opacity="0.5" />
              </pattern>
              <filter id="atlas-shadow" x="-5%" y="-5%" width="110%" height="110%">
                <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
                <feOffset dx="2" dy="3" result="o" />
                <feComponentTransfer><feFuncA type="linear" slope="0.18" /></feComponentTransfer>
                <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>

            <rect width={W} height={H} fill="url(#atlas-hatch)" opacity="0.4" />
            <path d={polylinePath(POLAND_OUTLINE)} fill="var(--background)" stroke="none" filter="url(#atlas-shadow)" />

            {slices.map(({ d, dPath }) => {
              const isHover = hoverId === d.id;
              const dim = hoverId !== null && !isHover;
              const fill = colorFor(d, mode);
              return (
                <path
                  key={`okr-${d.id}`}
                  d={dPath}
                  fill={fill}
                  stroke="var(--background)"
                  strokeWidth={isHover ? 1.6 : 1}
                  opacity={dim ? 0.5 : 0.92}
                  role="button"
                  tabIndex={0}
                  aria-label={`Okręg ${d.id} ${d.name}: ${mode === "klub" ? d.klub : mode === "turnout" ? `${d.turnout}%` : mode === "age" ? `${d.avgAge ?? "—"} lat` : `${d.mpCount ?? "—"} mandatów`}`}
                  onMouseEnter={() => setHoverId(d.id)}
                  onMouseLeave={() => setHoverId(null)}
                  onFocus={() => setHoverId(d.id)}
                  onBlur={() => setHoverId(null)}
                  onClick={() => router.push(`/atlas/okreg/${d.id}`)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); router.push(`/atlas/okreg/${d.id}`); } }}
                  style={{ cursor: "pointer", transition: "opacity 0.15s, stroke-width 0.15s" }}
                />
              );
            })}

            {sel && (() => {
              const slice = slices.find((s) => s.d.id === sel.id);
              if (!slice) return null;
              return (
                <path
                  d={slice.dPath}
                  fill="none"
                  stroke="var(--foreground)"
                  strokeWidth="2.4"
                  strokeLinejoin="round"
                  style={{ pointerEvents: "none" }}
                />
              );
            })()}

            {POLAND_VOIVODESHIPS.map((w) => (
              <path
                key={`voiv-${w.name}`}
                d={polylinePath(w.pts)}
                fill="none"
                stroke="var(--foreground)"
                strokeWidth="0.5"
                strokeDasharray="2,2"
                opacity="0.35"
                style={{ pointerEvents: "none" }}
              />
            ))}
            <path d={polylinePath(POLAND_OUTLINE)} fill="none" stroke="var(--foreground)" strokeWidth="1.4" strokeLinejoin="round" style={{ pointerEvents: "none" }} />

            {POLAND_VOIVODESHIPS.map((w) => {
              const cx = w.pts.reduce((s, p) => s + p[0], 0) / w.pts.length;
              const cy = w.pts.reduce((s, p) => s + p[1], 0) / w.pts.length;
              const [x, y] = project(cx, cy);
              return (
                <text
                  key={`l-${w.name}`}
                  x={x}
                  y={y}
                  textAnchor="middle"
                  fontFamily="serif"
                  fontSize="9"
                  fontStyle="italic"
                  fill="var(--foreground)"
                  opacity="0.45"
                  style={{ pointerEvents: "none" }}
                >
                  {w.name}
                </text>
              );
            })}

            {slices.map(({ d, lx, ly }) => {
              const isHover = hoverId === d.id;
              return (
                <text
                  key={`num-${d.id}`}
                  x={lx}
                  y={ly + 3}
                  textAnchor="middle"
                  fontFamily="ui-monospace"
                  fontSize={isHover ? 11 : 9}
                  fontWeight="700"
                  fill="var(--foreground)"
                  style={{
                    pointerEvents: "none",
                    paintOrder: "stroke",
                    stroke: "var(--background)",
                    strokeWidth: 2.5,
                    strokeLinejoin: "round",
                  }}
                >
                  {d.id}
                </text>
              );
            })}

            {CITIES.map(([name, lon, lat]) => {
              const [x, y] = project(lon, lat);
              return (
                <text
                  key={name}
                  x={x}
                  y={y - 16}
                  textAnchor="middle"
                  fontFamily="serif"
                  fontSize="11.5"
                  fontStyle="italic"
                  fontWeight="500"
                  fill="var(--foreground)"
                  style={{ pointerEvents: "none" }}
                >
                  {name}
                </text>
              );
            })}

            <g transform={`translate(${W - 50}, 50)`}>
              <circle r="18" fill="none" stroke="var(--muted-foreground)" strokeWidth="0.6" opacity="0.6" />
              <line x1="0" y1="-18" x2="0" y2="18" stroke="var(--muted-foreground)" strokeWidth="0.6" opacity="0.6" />
              <line x1="-18" y1="0" x2="18" y2="0" stroke="var(--muted-foreground)" strokeWidth="0.6" opacity="0.6" />
              <text x="0" y="-22" textAnchor="middle" fontFamily="ui-monospace" fontSize="9" fill="var(--foreground)">N</text>
            </g>
          </svg>
        </div>

        <aside className="min-w-0 font-sans text-[13px]">
          {sel ? (
            <div className="border border-rule p-4 bg-background">
              <div className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase mb-1.5">
                okręg {String(sel.id).padStart(2, "0")}
              </div>
              <div className="font-serif text-[24px] font-medium text-foreground leading-tight mb-3">
                {sel.name}
              </div>
              <dl className="grid grid-cols-[1fr_auto] gap-y-2 text-[12px]">
                <dt className="text-muted-foreground">Dominujący klub</dt>
                <dd className="text-right text-foreground inline-flex items-center gap-2 justify-end">
                  <ClubLogo klub={sel.klub} size={18} />
                  {KLUB_LABELS[sel.klub] ?? sel.klub}
                </dd>
                <dt className="text-muted-foreground">Frekwencja głosowań</dt>
                <dd className="text-right font-mono text-foreground">{sel.turnout}%</dd>
                {sel.mpCount != null && (
                  <>
                    <dt className="text-muted-foreground">Liczba mandatów</dt>
                    <dd className="text-right font-mono text-foreground">{sel.mpCount}</dd>
                  </>
                )}
                {sel.avgAge != null && (
                  <>
                    <dt className="text-muted-foreground">Średnia wieku</dt>
                    <dd className="text-right font-mono text-foreground">{Math.round(sel.avgAge)} lat</dd>
                  </>
                )}
              </dl>
              <div className="mt-4 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                Kliknij okręg → pełne dossier
              </div>
            </div>
          ) : (
            <div className="font-serif text-[14px] italic text-muted-foreground p-4 border border-dashed border-border">
              Najedź na okręg, aby zobaczyć posłów i statystyki. Kliknij — pełne dossier.
            </div>
          )}
          <div className="mt-4 font-mono text-[10px] text-muted-foreground leading-relaxed tracking-wide">
            Projekcja Mercator (uproszczona). Granice okręgów: GeoElections Poland 1.0. Dane: district_klub_stats (mig 0053).
          </div>
        </aside>
      </div>

      {mode === "klub" && (
        <div className="flex flex-wrap gap-4 mt-5 font-sans text-xs text-secondary-foreground">
          {klubsInLegend.map((k) => (
            <ClubLogo key={k} klub={k} size={18} withLabel />
          ))}
        </div>
      )}
      {mode === "turnout" && (
        <div className="flex items-center gap-3 mt-5 font-sans text-xs text-secondary-foreground">
          <span>75%</span>
          <div
            className="flex-1 max-w-[280px] h-2.5 border border-border"
            style={{ background: "linear-gradient(to right, hsl(8,60%,92%), hsl(8,60%,42%))" }}
          />
          <span>100%</span>
        </div>
      )}
      {mode === "age" && (
        <div className="flex items-center gap-3 mt-5 font-sans text-xs text-secondary-foreground">
          <span>35 lat</span>
          <div
            className="flex-1 max-w-[280px] h-2.5 border border-border"
            style={{ background: "linear-gradient(to right, hsl(220,30%,88%), hsl(220,30%,43%))" }}
          />
          <span>65 lat</span>
        </div>
      )}
      {mode === "mp_count" && (
        <div className="flex items-center gap-3 mt-5 font-sans text-xs text-secondary-foreground">
          <span>6 mandatów</span>
          <div
            className="flex-1 max-w-[280px] h-2.5 border border-border"
            style={{ background: "linear-gradient(to right, hsl(150,35%,88%), hsl(150,35%,43%))" }}
          />
          <span>20 mandatów</span>
        </div>
      )}
    </section>
  );
}
