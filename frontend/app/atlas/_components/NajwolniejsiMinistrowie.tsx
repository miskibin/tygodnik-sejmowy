"use client";

import { useMemo, useState } from "react";
import { SectionHead } from "./SectionHead";
import type { SlowMinisters, MinisterRow } from "@/lib/db/atlas";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type SortKey = "avgDays" | "overdueRate" | "count";
type FilterKey = "all" | "overdue" | "ontime";

const SORTS: Array<{ id: SortKey; label: string }> = [
  { id: "avgDays", label: "śr. czas" },
  { id: "overdueRate", label: "% po terminie" },
  { id: "count", label: "liczba interp." },
];

const FILTERS: Array<{ id: FilterKey; label: string }> = [
  { id: "all", label: "wszyscy" },
  { id: "overdue", label: "po terminie" },
  { id: "ontime", label: "w normie" },
];

function compareBy(a: MinisterRow, b: MinisterRow, key: SortKey): number {
  if (key === "avgDays") return b.avgDays - a.avgDays;
  if (key === "count") return b.count - a.count;
  return b.late / Math.max(b.count, 1) - a.late / Math.max(a.count, 1);
}

export function NajwolniejsiMinistrowie({ data }: { data: SlowMinisters }) {
  const [sort, setSort] = useState<SortKey>("avgDays");
  const [filter, setFilter] = useState<FilterKey>("all");

  const limit = data.limitDays;
  const filtered = useMemo(() => {
    const byFilter = data.rows.filter((m) => {
      if (filter === "overdue") return m.avgDays > limit;
      if (filter === "ontime") return m.avgDays <= limit;
      return true;
    });
    return [...byFilter].sort((a, b) => compareBy(a, b, sort));
  }, [data.rows, sort, filter, limit]);

  const max = Math.max(1, ...filtered.map((m) => m.avgDays));
  const totalInterp = data.rows.reduce((s, m) => s + m.count, 0);

  return (
    <section>
      <SectionHead
        num="04"
        kicker="Odpowiedzialność"
        title="Najwolniejsi ministrowie"
        sub="Średni czas odpowiedzi na interpelację poselską według resortu adresata. Limit ustawowy: 21 dni (możliwe przedłużenie do 30)."
        isMock={data.isMock}
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-3 mb-4 sm:mb-5 font-sans text-[12px] items-stretch sm:items-center min-w-0">
        <span className="text-muted-foreground uppercase tracking-[0.14em] text-[10px] shrink-0">sortuj</span>
        <div className="overflow-x-auto pb-0.5 -mx-1 px-1 sm:mx-0 sm:px-0 sm:overflow-visible">
        <ToggleGroup
          type="single"
          value={sort}
          onValueChange={(v) => v && setSort(v as SortKey)}
          variant="outline"
          size="sm"
        >
          {SORTS.map((s) => (
            <ToggleGroupItem key={s.id} value={s.id} aria-label={s.label}>
              {s.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        </div>
        <span className="text-muted-foreground uppercase tracking-[0.14em] text-[10px] shrink-0 sm:ml-1">filtr</span>
        <div className="overflow-x-auto pb-0.5 -mx-1 px-1 sm:mx-0 sm:px-0 sm:overflow-visible">
        <ToggleGroup
          type="single"
          value={filter}
          onValueChange={(v) => v && setFilter(v as FilterKey)}
          variant="outline"
          size="sm"
        >
          {FILTERS.map((f) => (
            <ToggleGroupItem key={f.id} value={f.id} aria-label={f.label}>
              {f.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="font-serif italic text-muted-foreground py-6">
          Brak ministrów spełniających filtr.
        </div>
      ) : (
        <div className="font-sans text-[13px] text-secondary-foreground">
          {filtered.map((m) => {
            const w = (m.avgDays / max) * 100;
            const overLimit = m.avgDays > limit;
            const barColor = overLimit ? "var(--destructive)" : m.klubColor;
            const overdueRate = (m.late / Math.max(m.count, 1)) * 100;
            return (
              <HoverCard key={m.name} openDelay={120} closeDelay={80}>
                <HoverCardTrigger asChild>
                  <div
                    role="button"
                    tabIndex={0}
                    className="flex flex-col gap-2 py-2.5 border-b border-dotted border-border cursor-pointer transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-destructive md:grid md:items-center md:gap-4 md:py-2.5"
                    style={{ gridTemplateColumns: "minmax(0,260px) minmax(0,1fr) minmax(5.5rem,auto)" }}
                  >
                    <div className="min-w-0 md:col-start-1">
                      <div className="font-serif text-[16px] text-foreground font-medium leading-tight">
                        {m.name}
                      </div>
                      <div className="font-sans text-[11px] text-muted-foreground mt-0.5">
                        Min. {m.resort}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 min-w-0 w-full md:col-start-2">
                      <div className="relative h-[22px] flex-1 min-w-0">
                        <div className="absolute inset-0" style={{ background: "var(--muted)" }} />
                        <div
                          className="absolute -top-1 -bottom-1 w-px"
                          style={{ left: `${(limit / max) * 100}%`, background: "var(--foreground)", opacity: 0.4 }}
                          aria-label="limit ustawowy"
                        />
                        <div
                          className="absolute left-0 top-0 bottom-0 transition-[width] duration-300"
                          style={{ width: `${w}%`, background: barColor }}
                        />
                      </div>
                      <div className="font-mono text-[11px] text-foreground font-semibold shrink-0 whitespace-nowrap tabular-nums">
                        {m.avgDays} dni
                      </div>
                    </div>
                    <div className="font-mono text-[11px] text-muted-foreground leading-tight md:text-right md:col-start-3 flex md:block justify-between gap-3">
                      {m.count} interp.
                      <br />
                      <span style={{ color: m.late > 20 ? "var(--destructive)" : "var(--muted-foreground)" }}>
                        {m.late} po terminie
                      </span>
                    </div>
                  </div>
                </HoverCardTrigger>
                <HoverCardContent className="w-72 font-sans text-[13px] bg-background border-rule">
                  <div className="font-serif text-[18px] text-foreground font-medium mb-1 leading-tight">
                    {m.name}
                  </div>
                  <div className="font-sans text-[11px] text-muted-foreground mb-3">
                    Min. {m.resort}
                  </div>
                  <div className="grid grid-cols-2 gap-y-1.5 font-mono text-[11px]">
                    <span className="text-muted-foreground">śr. czas odpowiedzi</span>
                    <span className="text-right text-foreground font-semibold" style={{ color: overLimit ? "var(--destructive)" : "var(--foreground)" }}>
                      {m.avgDays} dni
                    </span>
                    <span className="text-muted-foreground">limit ustawowy</span>
                    <span className="text-right text-foreground">{limit} dni</span>
                    <span className="text-muted-foreground">interpelacji łącznie</span>
                    <span className="text-right text-foreground">{m.count}</span>
                    <span className="text-muted-foreground">po terminie</span>
                    <span className="text-right" style={{ color: m.late > 20 ? "var(--destructive)" : "var(--foreground)" }}>
                      {m.late} ({overdueRate.toFixed(0)}%)
                    </span>
                  </div>
                </HoverCardContent>
              </HoverCard>
            );
          })}
        </div>
      )}

      <div className="mt-4 font-sans text-[11px] text-muted-foreground flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-4 sm:items-center">
        <div className="flex flex-wrap gap-x-4 gap-y-1 items-center">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-2" style={{ background: "var(--destructive)" }} />
          powyżej limitu {limit} dni
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-px h-3 align-middle" style={{ background: "var(--foreground)" }} />
          limit ustawowy
        </span>
        </div>
        <span className="text-[10px] sm:text-[11px] leading-snug sm:ml-auto sm:text-right max-w-full">
          Dane: mp_minister_reply_lag · n = {totalInterp} interpelacji od resortów z&nbsp;≥&nbsp;5 zapytaniami.
        </span>
      </div>
    </section>
  );
}
