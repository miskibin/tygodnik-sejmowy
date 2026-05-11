import type { PollsterSummary } from "@/lib/db/polls";

export function PollstersStrip({ rows }: { rows: PollsterSummary[] }) {
  const total = rows.reduce((acc, r) => acc + r.n_polls, 0);
  return (
    <section>
      <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-destructive mb-3">
        Pracownie · łącznie {total.toLocaleString("pl-PL")} sondaży
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => {
          const widthPct = (r.n_polls / Math.max(1, rows[0]?.n_polls ?? 1)) * 100;
          return (
            <div key={r.code} className="p-3 sm:p-4 bg-muted border border-border min-w-0">
              <div className="flex justify-between items-baseline gap-3 mb-1.5 min-w-0">
                <span className="font-serif text-[15px] font-medium text-foreground min-w-0 break-words">{r.name_full}</span>
                <span className="font-mono text-[14px] font-semibold text-foreground shrink-0 tabular-nums">{r.n_polls}</span>
              </div>
              <div className="h-1 relative border border-border bg-background mb-2">
                <div className="absolute left-0 top-0 bottom-0 bg-destructive" style={{ width: `${widthPct}%`, opacity: 0.7 }} />
              </div>
              <div className="flex justify-between font-mono text-[10px] text-muted-foreground tracking-wide">
                <span>{r.code}</span>
                {r.website ? (
                  <a href={r.website} target="_blank" rel="noopener noreferrer" className="text-destructive hover:underline uppercase tracking-wider">
                    strona ↗
                  </a>
                ) : (
                  <span className="italic">brak strony</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
