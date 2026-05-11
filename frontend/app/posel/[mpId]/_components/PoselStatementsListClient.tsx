"use client";

import { useCallback, useState } from "react";
import type { MpStatementRow } from "@/lib/db/posel-tabs";
import { MP_QUESTIONS_STATEMENTS_TAB_LIMIT } from "@/lib/posel-tab-page-size";
import { StatementCard } from "@/components/statement/StatementCard";

export function PoselStatementsListClient({
  mpId,
  initialRows,
  total,
  pageSize = MP_QUESTIONS_STATEMENTS_TAB_LIMIT,
}: {
  mpId: number;
  initialRows: MpStatementRow[];
  total: number;
  pageSize?: number;
}) {
  const [rows, setRows] = useState<MpStatementRow[]>(initialRows);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasMore = rows.length < total;

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/posel/${mpId}/statements?offset=${rows.length}&limit=${pageSize}`, {
        credentials: "same-origin",
      });
      if (!r.ok) {
        setError("Nie udało się załadować kolejnych pozycji.");
        return;
      }
      const next = (await r.json()) as MpStatementRow[];
      setRows((prev) => [...prev, ...next]);
    } catch {
      setError("Nie udało się załadować kolejnych pozycji.");
    } finally {
      setLoading(false);
    }
  }, [hasMore, loading, mpId, pageSize, rows.length]);

  return (
    <>
      <div className="border-t border-border">
        {rows.map((r) => (
          <StatementCard
            key={r.id}
            variant="inline"
            id={r.id}
            mpId={null}
            speakerName={null}
            function={r.function}
            date={r.date}
            proceedingNumber={r.proceedingNumber}
            rapporteur={r.rapporteur}
            secretary={r.secretary}
            excerpt={r.excerpt}
          />
        ))}
      </div>
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
