import Link from "next/link";
import type { PromiseRow } from "@/lib/db/promises";
import { PromiseCard } from "./PromiseCard";

const PAGE_SIZE = 30;

export function PromiseFeed({
  rows,
  page,
  baseHref,
}: {
  rows: PromiseRow[];
  page: number;
  baseHref: string;
}) {
  if (rows.length === 0) {
    return (
      <div
        className="py-20 text-center text-muted-foreground font-serif italic"
        style={{ fontSize: 18 }}
      >
        Brak obietnic dla wybranych filtrów.{" "}
        <Link
          href="/obietnice"
          className="text-destructive underline decoration-dotted underline-offset-4 not-italic"
        >
          wyczyść filtry
        </Link>
      </div>
    );
  }
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const slice = rows.slice(start, start + PAGE_SIZE);

  const pageHref = (p: number): string => {
    const sep = baseHref.includes("?") ? "&" : "?";
    return p <= 1 ? baseHref : `${baseHref}${sep}page=${p}`;
  };

  return (
    <div>
      {slice.map((r, i) => (
        <PromiseCard key={r.id} row={r} idx={start + i} />
      ))}
      {totalPages > 1 && (
        <nav
          aria-label="Paginacja obietnic"
          className="flex items-center justify-between gap-3 pt-5 mt-2 font-mono text-[11px] text-muted-foreground"
        >
          <span>
            {start + 1}–{Math.min(start + PAGE_SIZE, rows.length)} z {rows.length}
          </span>
          <div className="flex items-center gap-4">
            {safePage > 1 ? (
              <Link
                href={pageHref(safePage - 1)}
                className="text-destructive underline decoration-dotted underline-offset-4"
              >
                ← poprzednia
              </Link>
            ) : (
              <span className="text-border">←</span>
            )}
            <span>
              str. {safePage} / {totalPages}
            </span>
            {safePage < totalPages ? (
              <Link
                href={pageHref(safePage + 1)}
                className="text-destructive underline decoration-dotted underline-offset-4"
              >
                następna →
              </Link>
            ) : (
              <span className="text-border">→</span>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
