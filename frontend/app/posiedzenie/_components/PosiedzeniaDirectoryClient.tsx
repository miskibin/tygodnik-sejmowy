"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { SittingInfo } from "@/lib/events-types";
import { SearchHero } from "@/components/lists/SearchHero";
import { formatRelativePl } from "@/lib/format/relative-pl";

const PAGE_SIZE = 50;

function formatSittingDates(first: string, last: string): string {
  if (!first) return "—";
  const fmt = new Intl.DateTimeFormat("pl-PL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  if (!last || last === first) return fmt.format(new Date(first));
  const f = new Date(first);
  const l = new Date(last);
  const sameYear = f.getFullYear() === l.getFullYear();
  const sameMonth = sameYear && f.getMonth() === l.getMonth();
  if (sameMonth) {
    const monthYear = new Intl.DateTimeFormat("pl-PL", {
      month: "long",
      year: "numeric",
    }).format(f);
    return `${f.getDate()}–${l.getDate()} ${monthYear}`;
  }
  return `${fmt.format(f)} – ${fmt.format(l)}`;
}

function SittingRow({ r }: { r: SittingInfo }) {
  const rel = formatRelativePl(r.firstDate);
  return (
    <li
      className="flex items-baseline gap-3 py-3 px-2"
      style={{ borderBottom: "1px dotted var(--border)" }}
    >
      <Link
        href={`/posiedzenie/${r.sittingNum}`}
        className="contents group"
      >
        <span
          className="font-mono text-[11px] tracking-wide text-muted-foreground shrink-0 w-[44px] text-right"
          title="numer posiedzenia"
        >
          nr {r.sittingNum}
        </span>

        <div className="min-w-0 flex-1">
          <span
            className="font-serif text-[14.5px] leading-snug text-foreground group-hover:text-destructive"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
            title={r.title}
          >
            {r.title || `Posiedzenie nr ${r.sittingNum}`}
          </span>
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground mt-0.5">
            {formatSittingDates(r.firstDate, r.lastDate)}
            {rel && <span className="ml-2 normal-case tracking-normal">· {rel}</span>}
          </div>
        </div>

        <span
          className="font-mono text-[11px] tabular-nums text-muted-foreground shrink-0 whitespace-nowrap"
          title="druki / wydarzenia"
        >
          {r.printCount} druków
          <span className="mx-1">·</span>
          {r.eventCount} wyd.
        </span>
      </Link>
    </li>
  );
}

export function PosiedzeniaDirectoryClient({ rows }: { rows: SittingInfo[] }) {
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE_SIZE);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => {
      const blob = `nr ${r.sittingNum} ${r.title}`.toLowerCase();
      return blob.includes(needle);
    });
  }, [rows, query]);

  const slice = filtered.slice(0, shown);
  const hasMore = shown < filtered.length;

  return (
    <div className="min-w-0">
      <SearchHero
        value={query}
        onChange={(v) => {
          setQuery(v);
          setShown(PAGE_SIZE);
        }}
        placeholder="Szukaj posiedzenia — numer, tytuł…"
        filteredCount={filtered.length}
        totalCount={rows.length}
      />

      {filtered.length === 0 ? (
        <p className="font-serif italic text-muted-foreground text-center py-12">
          Brak wyników.
        </p>
      ) : (
        <>
          <ul>
            {slice.map((r) => (
              <SittingRow key={`${r.term}-${r.sittingNum}`} r={r} />
            ))}
          </ul>
          {hasMore && (
            <div className="text-center mt-6">
              <button
                type="button"
                onClick={() => setShown((s) => s + PAGE_SIZE)}
                className="font-sans text-[12px] text-destructive underline decoration-dotted underline-offset-4 cursor-pointer"
              >
                Pokaż następne {Math.min(PAGE_SIZE, filtered.length - shown)} z{" "}
                {filtered.length - shown}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
