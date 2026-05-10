import type { PollsterSummary } from "@/lib/db/polls";

export function PollstersStrip({ rows }: { rows: PollsterSummary[] }) {
  const total = rows.reduce((acc, r) => acc + r.n_polls, 0);
  return (
    <section>
      <header className="mb-6 pb-3.5 border-b border-rule grid items-baseline gap-5" style={{ gridTemplateColumns: "60px 1fr" }}>
        <div className="font-serif italic font-normal text-destructive" style={{ fontSize: 56, lineHeight: 0.9 }}>E</div>
        <div>
          <div className="font-sans text-[11px] tracking-[0.16em] uppercase text-muted-foreground mb-1.5">Kto pyta i ile razy</div>
          <h2 className="font-serif font-medium m-0 leading-[1.05]" style={{ fontSize: 36, letterSpacing: "-0.01em" }}>Pollsterzy</h2>
          <p className="font-serif m-0 mt-2 text-secondary-foreground leading-[1.5] max-w-[720px]" style={{ fontSize: 16 }}>
            Wkład każdej pracowni do bazy. Łącznie {total.toLocaleString("pl-PL")} sondaży.
          </p>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => {
          const widthPct = (r.n_polls / Math.max(1, rows[0]?.n_polls ?? 1)) * 100;
          return (
            <div key={r.code} className="p-4 bg-muted border border-border">
              <div className="flex justify-between items-baseline mb-1.5">
                <span className="font-serif text-[15px] font-medium text-foreground">{r.name_full}</span>
                <span className="font-mono text-[14px] font-semibold text-foreground">{r.n_polls}</span>
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
