"use client";

import { useCallback, useState } from "react";
import type { MpQuestionRow } from "@/lib/db/posel-tabs";
import { MP_QUESTIONS_STATEMENTS_TAB_LIMIT } from "@/lib/posel-tab-page-size";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function shortenRecipient(name: string): string {
  return name.replace(/^minister\s+/i, "min. ");
}

const KIND_LABELS: Record<string, string> = {
  interpellation: "Interpelacja",
  written: "Zapytanie",
  oral: "Pytanie ustne",
};

export function PoselInterpellationsListClient({
  mpId,
  initialRows,
  total,
  pageSize = MP_QUESTIONS_STATEMENTS_TAB_LIMIT,
}: {
  mpId: number;
  initialRows: MpQuestionRow[];
  total: number;
  pageSize?: number;
}) {
  const [rows, setRows] = useState<MpQuestionRow[]>(initialRows);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasMore = rows.length < total;

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/posel/${mpId}/questions?offset=${rows.length}&limit=${pageSize}`, {
        credentials: "same-origin",
      });
      if (!r.ok) {
        setError("Nie udało się załadować kolejnych pozycji.");
        return;
      }
      const next = (await r.json()) as MpQuestionRow[];
      setRows((prev) => [...prev, ...next]);
    } catch {
      setError("Nie udało się załadować kolejnych pozycji.");
    } finally {
      setLoading(false);
    }
  }, [hasMore, loading, mpId, pageSize, rows.length]);

  return (
    <>
      <ul className="border-t border-border">
        {rows.map((r) => {
          const delayed = r.answerDelayedDays != null && r.answerDelayedDays > 0;
          const kindLabel = KIND_LABELS[r.kind] ?? r.kind;
          return (
            <li
              key={r.questionId}
              className="grid border-b border-border py-3 gap-2 grid-cols-[minmax(3rem,62px)_minmax(0,1fr)]"
            >
              <span className="font-mono text-[11px] text-muted-foreground tracking-wide pt-1">
                {formatDate(r.sentDate)}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-2 mb-1">
                  <span className="font-sans text-[10px] uppercase tracking-[0.12em] text-destructive">
                    {kindLabel} #{r.num}
                  </span>
                  {delayed ? (
                    <span
                      className="font-sans text-[10px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-sm"
                      style={{ color: "var(--warning)", border: "1px solid var(--warning)" }}
                    >
                      spóźnione {r.answerDelayedDays} dni
                    </span>
                  ) : (
                    <span
                      className="font-sans text-[10px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-sm"
                      style={{ color: "var(--success)", border: "1px solid var(--success)" }}
                    >
                      w terminie
                    </span>
                  )}
                </div>
                <div className="font-serif text-[15.5px] leading-snug text-foreground mb-1 break-words">
                  {r.title}
                </div>
                {r.recipients.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {r.recipients.slice(0, 3).map((rc) => (
                      <span
                        key={rc}
                        className="font-sans text-[10.5px] text-secondary-foreground px-1.5 py-0.5 border border-border rounded-sm"
                      >
                        {shortenRecipient(rc)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {error && <p className="font-sans text-[12px] text-destructive mt-3 m-0">{error}</p>}
      {hasMore && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="font-sans text-[13px] px-5 py-2 rounded-full border border-foreground text-foreground bg-transparent hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Ładowanie…" : "Załaduj następne"}
          </button>
        </div>
      )}
    </>
  );
}
