"use client";

import { useMemo, useState } from "react";
import type { ProcessSummary } from "@/lib/db/threads";
import { stageLabel } from "@/lib/stages";
import {
  PROCES_GROUP_BLURB,
  PROCES_GROUP_HEADING,
  SPONSOR_LABEL,
  classifyInFlight,
  type ProcesGroupKey,
} from "@/lib/proces-classify";
import { SearchHero } from "@/components/lists/SearchHero";
import { FilterChipRow, type FilterChipOption } from "@/components/lists/FilterChipRow";
import { SortButtons } from "@/components/lists/SortButtons";

export type ProcesListItem = ProcessSummary & {
  groupKey: ProcesGroupKey;
};

type SortKey = "recent" | "oldest" | "longest" | "druk";

const SORT_OPTIONS: { id: SortKey; label: string; tip?: string }[] = [
  { id: "recent", label: "ostatnia aktywność" },
  { id: "longest", label: "najdłużej w procesie", tip: "Sortuj od projektów najdłużej procedowanych" },
  { id: "oldest", label: "najstarsze aktywności" },
  { id: "druk", label: "druk" },
];

const GROUP_ORDER: ProcesGroupKey[] = ["sejm", "senat", "prezydent", "uchwalone"];

function shortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function daysBetween(iso: string | null, now = Date.now()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now - t) / (24 * 60 * 60 * 1000)));
}

function pluralDni(n: number): string {
  if (n === 1) return "dzień";
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "dni";
  return "dni";
}

function parseDrukAsc(a: string, b: string): number {
  const na = parseInt(a, 10);
  const nb = parseInt(b, 10);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return a.localeCompare(b, "pl");
}

export function ProcesDirectoryClient({ items }: { items: ProcesListItem[] }) {
  const [query, setQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortKey>("recent");

  const groupCounts = useMemo(() => {
    const counts: Record<ProcesGroupKey, number> = {
      sejm: 0,
      senat: 0,
      prezydent: 0,
      uchwalone: 0,
    };
    for (const it of items) counts[it.groupKey] += 1;
    return counts;
  }, [items]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const arr = items.filter((it) => {
      if (groupFilter !== "all" && it.groupKey !== groupFilter) return false;
      if (needle) {
        const blob = `${it.number} ${it.shortTitle ?? ""} ${it.title}`.toLowerCase();
        if (!blob.includes(needle)) return false;
      }
      return true;
    });
    const cmp: Record<SortKey, (a: ProcesListItem, b: ProcesListItem) => number> = {
      recent: (a, b) => {
        const da = a.lastStageDate ? Date.parse(a.lastStageDate) : 0;
        const db = b.lastStageDate ? Date.parse(b.lastStageDate) : 0;
        return db - da;
      },
      oldest: (a, b) => {
        const da = a.lastStageDate ? Date.parse(a.lastStageDate) : Number.POSITIVE_INFINITY;
        const db = b.lastStageDate ? Date.parse(b.lastStageDate) : Number.POSITIVE_INFINITY;
        return da - db;
      },
      longest: (a, b) => {
        const da = a.firstStageDate ? Date.parse(a.firstStageDate) : Number.POSITIVE_INFINITY;
        const db = b.firstStageDate ? Date.parse(b.firstStageDate) : Number.POSITIVE_INFINITY;
        return da - db; // earliest first-stage = longest in pipeline = top
      },
      druk: (a, b) => parseDrukAsc(a.number, b.number),
    };
    return arr.slice().sort(cmp[sortBy]);
  }, [items, query, groupFilter, sortBy]);

  const chipOptions: FilterChipOption[] = GROUP_ORDER.map((k) => ({
    id: k,
    label: PROCES_GROUP_HEADING[k],
    count: groupCounts[k],
    color:
      k === "uchwalone"
        ? "var(--success)"
        : k === "prezydent"
          ? "var(--destructive)"
          : k === "senat"
            ? "var(--warning)"
            : "var(--foreground)",
  }));

  const activeBlurb =
    groupFilter !== "all" && groupFilter in PROCES_GROUP_BLURB
      ? PROCES_GROUP_BLURB[groupFilter as ProcesGroupKey]
      : null;

  return (
    <div className="min-w-0">
      <SearchHero
        value={query}
        onChange={setQuery}
        placeholder="Szukaj projektu — druk, tytuł, słowo kluczowe…"
        filteredCount={filtered.length}
        totalCount={items.length}
      />

      <FilterChipRow
        options={chipOptions}
        selected={groupFilter}
        onChange={setGroupFilter}
      />

      {activeBlurb && (
        <p className="font-sans text-[12px] italic text-secondary-foreground leading-[1.55] mb-4 max-w-[760px]">
          {activeBlurb}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-6 font-sans text-[12px]">
        <span className="flex-1" aria-hidden />
        <SortButtons options={SORT_OPTIONS} value={sortBy} onChange={setSortBy} />
      </div>

      {filtered.length === 0 ? (
        <p className="font-serif italic text-muted-foreground py-12 text-center">
          Brak procesów spełniających kryteria filtra.
        </p>
      ) : (
        <ul className="border-t border-rule">
          {filtered.map((p) => (
            <ProcessRow key={`${p.term}-${p.number}`} p={p} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ProcessRow({ p }: { p: ProcesListItem }) {
  const passed = p.groupKey === "uchwalone";
  const lastDays = daysBetween(p.lastStageDate);
  const pipelineDays = daysBetween(p.firstStageDate);
  const stageText = stageLabel(p.lastStageType, p.lastStageName);
  const sponsorLabel = p.sponsorAuthority ? SPONSOR_LABEL[p.sponsorAuthority] ?? null : null;

  return (
    <li className="py-4 border-b border-dotted border-border">
      <a
        href={`/proces/${p.term}/${encodeURIComponent(p.number)}`}
        className="grid gap-x-5 gap-y-1.5 group"
        style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}
      >
        <div className="min-w-0">
          <div className="font-sans text-[10px] tracking-[0.16em] uppercase text-muted-foreground mb-1.5 flex items-center gap-2 flex-wrap">
            <span className="font-mono tracking-wide normal-case text-destructive">
              druk {p.number}
            </span>
            <span className="text-border">·</span>
            <span>{stageText}</span>
            {lastDays != null && (
              <>
                <span className="text-border">·</span>
                <span className="font-mono tracking-wide normal-case">
                  {passed
                    ? lastDays === 0
                      ? "uchwalono dziś"
                      : `uchwalono ${lastDays} ${pluralDni(lastDays)} temu`
                    : lastDays === 0
                      ? "dziś"
                      : `${lastDays} ${pluralDni(lastDays)} temu`}
                </span>
              </>
            )}
          </div>
          <h2
            className="font-serif font-medium leading-[1.2] text-foreground group-hover:text-destructive transition-colors m-0"
            style={{ fontSize: "clamp(1rem, 1.8vw, 1.25rem)", letterSpacing: "-0.015em" }}
          >
            {p.shortTitle || p.title || `Druk ${p.number}`}
          </h2>
          {(sponsorLabel || (pipelineDays != null && pipelineDays > 0)) && (
            <div className="font-sans text-[11px] text-secondary-foreground mt-1.5 flex items-center gap-2 flex-wrap">
              {sponsorLabel && (
                <span
                  className="font-mono uppercase tracking-[0.12em] text-[9.5px] px-1.5 py-0.5 border border-border"
                  style={{ color: "var(--secondary-foreground)" }}
                >
                  {sponsorLabel}
                </span>
              )}
              {pipelineDays != null && pipelineDays > 0 && (
                <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                  {pipelineDays} {pluralDni(pipelineDays)} w procesie
                </span>
              )}
            </div>
          )}
        </div>
        <div className="self-center font-mono text-[11px] text-muted-foreground whitespace-nowrap tabular-nums">
          {shortDate(p.lastStageDate)}
        </div>
      </a>
    </li>
  );
}
