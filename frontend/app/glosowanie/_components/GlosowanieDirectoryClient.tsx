"use client";

import { useMemo, useState } from "react";
import type { VotingListItem } from "@/lib/db/voting";
import { SearchHero } from "@/components/lists/SearchHero";
import { VotingRow } from "@/components/voting/VotingRow";

const PAGE_SIZE = 50;

export function GlosowanieDirectoryClient({ rows }: { rows: VotingListItem[] }) {
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE_SIZE);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => {
      const blob = `${r.title} nr ${r.voting_number} pos ${r.sitting}`.toLowerCase();
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
        placeholder="Szukaj głosowania — tytuł, numer, posiedzenie…"
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
              <VotingRow
                key={r.id}
                votingId={r.id}
                date={r.date}
                title={r.title || `Głosowanie nr ${r.voting_number}`}
                yes={r.yes}
                no={r.no}
                abstain={r.abstain}
                badge={{ label: `pos. ${r.sitting}` }}
              />
            ))}
          </ul>
          {hasMore && (
            <div className="text-center mt-6">
              <button
                type="button"
                onClick={() => setShown((s) => s + PAGE_SIZE)}
                className="font-sans text-[12px] text-destructive underline decoration-dotted underline-offset-4 cursor-pointer"
              >
                Pokaż następne {Math.min(PAGE_SIZE, filtered.length - shown)} z {filtered.length - shown}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
