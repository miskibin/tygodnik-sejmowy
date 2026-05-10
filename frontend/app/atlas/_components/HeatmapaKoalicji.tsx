"use client";

import { useMemo, useState } from "react";
import { SectionHead } from "./SectionHead";
import type { KlubHeatmap } from "@/lib/db/atlas";
import { KLUB_LABELS } from "@/lib/atlas/constants";
import { ClubLogo } from "@/components/atlas/ClubLogo";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type SortMode = "alpha" | "agreement";
type Hover = { i: number; j: number; a: string; b: string; agreement: number; votings: number } | null;

// red (high agreement) ↔ paper ↔ navy (disagreement). 0..1 input.
function colorForAgreement(v: number): string {
  if (v >= 0.5) {
    const t = (v - 0.5) / 0.5;
    return `hsl(8, ${30 + t * 40}%, ${85 - t * 35}%)`;
  }
  const t = (0.5 - v) / 0.5;
  return `hsl(220, ${20 + t * 40}%, ${88 - t * 30}%)`;
}

export function HeatmapaKoalicji({ data }: { data: KlubHeatmap }) {
  const [sort, setSort] = useState<SortMode>("alpha");
  const [hover, setHover] = useState<Hover>(null);
  // Tap-to-pin for touch users — hover events don't fire reliably on coarse pointers.
  const [pinned, setPinned] = useState<Hover>(null);
  const display = pinned ?? hover;

  const lookup = useMemo(() => {
    const m = new Map<string, { agreement: number; votings: number }>();
    for (const c of data.cells) m.set(`${c.a}|${c.b}`, { agreement: c.agreement, votings: c.votings });
    return m;
  }, [data.cells]);

  const klubs = useMemo(() => {
    if (sort === "alpha") return [...data.klubs].sort();
    // mean agreement (excluding self) per klub, descending
    const meanFor = (k: string): number => {
      let sum = 0;
      let n = 0;
      for (const o of data.klubs) {
        if (o === k) continue;
        const c = lookup.get(`${k}|${o}`) ?? lookup.get(`${o}|${k}`);
        if (!c) continue;
        sum += c.agreement;
        n += 1;
      }
      return n > 0 ? sum / n : 0;
    };
    return [...data.klubs].sort((a, b) => meanFor(b) - meanFor(a));
  }, [sort, data.klubs, lookup]);

  if (data.klubs.length === 0) {
    return (
      <section>
        <SectionHead num="02" kicker="Koalicje" title="Kto z kim głosuje" sub="Brak danych — zapytanie do bazy nie zwróciło wyników." />
      </section>
    );
  }

  const N = klubs.length;

  // Surface narrative anchors from real data.
  let bestPair: { a: string; b: string; v: number } | null = null;
  let coalitionTop: { a: string; b: string; v: number } | null = null;
  const RULING = new Set(["KO", "Polska2050", "Lewica", "PSL-TD"]);
  for (const c of data.cells) {
    if (c.a === c.b) continue;
    if (!bestPair || c.agreement > bestPair.v) bestPair = { a: c.a, b: c.b, v: c.agreement };
    if (RULING.has(c.a) && RULING.has(c.b) && (!coalitionTop || c.agreement > coalitionTop.v)) {
      coalitionTop = { a: c.a, b: c.b, v: c.agreement };
    }
  }
  const pisKonfCell = data.cells.find((c) =>
    (c.a === "PiS" && c.b === "Konfederacja") || (c.a === "Konfederacja" && c.b === "PiS"),
  ) ?? null;
  const koPisCell = data.cells.find((c) =>
    (c.a === "KO" && c.b === "PiS") || (c.a === "PiS" && c.b === "KO"),
  ) ?? null;

  return (
    <section>
      <SectionHead
        num="02"
        kicker="Realne koalicje"
        title="Kto z kim faktycznie głosuje"
        sub="Macierz % zgodności w głosowaniach plenarnych. Bazujemy na większości w klubie — dwa kluby „zgodne” w danym głosowaniu, jeśli ich modalny głos się pokrywa."
      />

      <div className="flex flex-wrap gap-3 mb-5 font-sans text-[12px] items-center">
        <span className="text-muted-foreground uppercase tracking-[0.14em] text-[10px]">sortuj</span>
        <ToggleGroup
          type="single"
          value={sort}
          onValueChange={(v) => v && setSort(v as SortMode)}
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="alpha" aria-label="alfabetycznie">alfabetycznie</ToggleGroupItem>
          <ToggleGroupItem value="agreement" aria-label="po średniej zgodności">po zgodności</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="grid gap-8 lg:[grid-template-columns:1fr_320px] items-start">
        {/* Matrix as a CSS grid — fills available width on desktop, scrolls on mobile. */}
        <div className="relative">
          <div className="overflow-x-auto">
          <div
            role="grid"
            aria-label="macierz zgodności klubów"
            className="grid gap-px bg-border border border-rule min-w-[560px]"
            style={{
              gridTemplateColumns: `120px repeat(${N}, minmax(60px, 1fr))`,
              gridTemplateRows: `64px repeat(${N}, minmax(60px, 1fr))`,
            }}
          >
            <div className="bg-background" />
            {klubs.map((k) => (
              <div
                key={`col-${k}`}
                className="bg-background flex flex-col items-center justify-end pb-1.5 gap-1 font-sans text-[12px] font-medium text-foreground"
              >
                <ClubLogo klub={k} size={26} />
                <span>{KLUB_LABELS[k] ?? k}</span>
              </div>
            ))}
            {klubs.map((ka, i) => (
              <>
                <div
                  key={`row-${ka}`}
                  className="bg-background flex items-center justify-end pr-3 gap-2 font-sans text-[12px] font-medium text-foreground"
                >
                  <ClubLogo klub={ka} size={22} />
                  <span>{KLUB_LABELS[ka] ?? ka}</span>
                </div>
                {klubs.map((kb, j) => {
                  // Render lower triangle + diagonal only (matrix is symmetric).
                  if (j > i) {
                    return <div key={`empty-${ka}-${kb}`} className="bg-background" aria-hidden="true" />;
                  }
                  const cv = lookup.get(`${ka}|${kb}`);
                  const v = cv?.agreement ?? 0;
                  const onDiag = i === j;
                  const pct = Math.round(v * 100);
                  const fill = onDiag ? "var(--foreground)" : colorForAgreement(v);
                  const textColor = onDiag
                    ? "var(--background)"
                    : pct >= 70 || pct <= 25
                      ? "var(--background)"
                      : "var(--foreground)";
                  const cellHover: Hover = onDiag ? null : { i, j, a: ka, b: kb, agreement: v, votings: cv?.votings ?? 0 };
                  const isActive = (display?.i === i && display?.j === j) || (pinned?.i === i && pinned?.j === j);
                  return (
                    <button
                      key={`cell-${ka}-${kb}`}
                      type="button"
                      role="gridcell"
                      aria-label={onDiag ? `${ka}` : `${ka} × ${kb}: ${pct}% zgodności`}
                      aria-pressed={pinned?.i === i && pinned?.j === j}
                      tabIndex={onDiag ? -1 : 0}
                      onMouseEnter={() => !onDiag && setHover(cellHover)}
                      onMouseLeave={() => setHover(null)}
                      onFocus={() => !onDiag && setHover(cellHover)}
                      onBlur={() => setHover(null)}
                      onClick={() => {
                        if (onDiag) return;
                        setPinned((p) => (p?.i === i && p?.j === j ? null : cellHover));
                      }}
                      className="flex items-center justify-center font-mono text-[14px] font-semibold transition-shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-destructive"
                      style={{
                        background: fill,
                        color: textColor,
                        boxShadow: isActive ? "inset 0 0 0 2px var(--foreground)" : undefined,
                        cursor: onDiag ? "default" : "pointer",
                      }}
                    >
                      {onDiag ? "—" : pct}
                    </button>
                  );
                })}
              </>
            ))}
          </div>
          </div>
          {/* Right-edge scroll fade indicator (mobile only) */}
          <div
            aria-hidden
            className="lg:hidden pointer-events-none absolute top-0 right-0 bottom-0 w-8"
            style={{
              background: "linear-gradient(to right, transparent, var(--background) 80%)",
            }}
          />
        </div>

        <aside className="font-serif text-[15px] leading-[1.6] text-secondary-foreground">
          {display ? (
            <div className="mb-4 p-4 border border-rule bg-background relative">
              {pinned && (
                <button
                  type="button"
                  onClick={() => setPinned(null)}
                  aria-label="Zamknij szczegóły"
                  className="absolute top-2 right-2 w-7 h-7 inline-flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                >
                  ×
                </button>
              )}
              <div className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground mb-1.5 uppercase">para</div>
              <div className="flex items-center gap-2 font-serif text-[24px] font-medium text-foreground leading-tight mb-2 flex-wrap">
                <ClubLogo klub={display.a} size={28} />
                <span>{KLUB_LABELS[display.a] ?? display.a}</span>
                <span className="text-destructive italic">×</span>
                <ClubLogo klub={display.b} size={28} />
                <span>{KLUB_LABELS[display.b] ?? display.b}</span>
              </div>
              <div className="font-serif font-normal text-destructive leading-none mb-1" style={{ fontSize: 56 }}>
                {Math.round(display.agreement * 100)}<span className="text-muted-foreground text-[26px]">%</span>
              </div>
              <div className="font-sans text-[12px] text-muted-foreground mb-3">
                zgodności w {display.votings.toLocaleString("pl-PL")} wspólnych głosowaniach
              </div>
              <a
                href={`/szukaj?scope=print&q=${encodeURIComponent(display.a + " " + display.b)}`}
                className="inline-block font-sans text-[11px] text-destructive underline decoration-dotted underline-offset-4"
              >
                ↗ wspólne sprawy w wyszukiwarce
              </a>
            </div>
          ) : (
            <div className="mb-4 p-4 border border-border" style={{ background: "var(--muted)" }}>
              <div className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground mb-1.5 uppercase">próba</div>
              <div className="font-serif text-[26px] font-normal text-foreground leading-tight">
                {data.totalVotings.toLocaleString("pl-PL")}
                <span className="text-muted-foreground text-[16px]"> głosowań</span>
              </div>
              <div className="font-sans text-[12px] text-muted-foreground mt-1">
                X kadencja Sejmu RP — wszystkie głosowania z udziałem ≥ 2 z głównych klubów.
              </div>
            </div>
          )}
          {pisKonfCell && koPisCell && (
            <p className="m-0 mb-3">
              <strong className="text-foreground">
                PiS i Konfederacja głosują razem w&nbsp;{Math.round(pisKonfCell.agreement * 100)}% przypadków
              </strong>
              {" "}— więcej niż KO i&nbsp;PiS ({Math.round(koPisCell.agreement * 100)}%).
            </p>
          )}
          {coalitionTop && (
            <p className="m-0 mb-3">
              Najgęstszy klaster: {KLUB_LABELS[coalitionTop.a] ?? coalitionTop.a}–{KLUB_LABELS[coalitionTop.b] ?? coalitionTop.b}
              {" "}({Math.round(coalitionTop.v * 100)}%).
            </p>
          )}
          <p className="m-0 text-[14px] text-muted-foreground italic">
            Modalny głos klubu = opcja ZA/PRZECIW/WSTRZYM. z największą liczbą głosów członków klubu w danym głosowaniu.
            Tie-break w kolejności ZA → PRZECIW → WSTRZYM.
          </p>
        </aside>
      </div>

      {/* Color legend — explicit gradient with %. */}
      <div className="mt-6 flex flex-wrap items-center gap-3 font-mono text-[10px] text-muted-foreground">
        <span className="uppercase tracking-[0.14em]">skala</span>
        <span>0%</span>
        <div
          className="h-2 flex-1 max-w-[280px] border border-border"
          style={{
            background: "linear-gradient(to right, hsl(220, 60%, 58%), hsl(220, 30%, 78%), var(--muted), hsl(8, 50%, 76%), hsl(8, 70%, 50%))",
          }}
        />
        <span>100%</span>
      </div>
    </section>
  );
}
