import type { EtlCursor } from "@/lib/db/etl";
import { fmtDateTime } from "./format";

export function CursorsCard({ cursors }: { cursors: EtlCursor[] }) {
  return (
    <section className="border border-border">
      <div className="border-b border-border bg-muted/60 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Kursory · etl_cursors
      </div>
      {cursors.length === 0 ? (
        <p className="px-3 py-4 text-sm text-muted-foreground">Brak kursorów.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-1.5 font-normal">nazwa</th>
                <th className="px-3 py-1.5 font-normal">wartość</th>
                <th className="px-3 py-1.5 font-normal">aktualizacja</th>
              </tr>
            </thead>
            <tbody>
              {cursors.map((c) => (
                <tr key={c.name} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2 font-mono text-[12px] whitespace-nowrap">{c.name}</td>
                  <td className="px-3 py-2 font-mono text-[12px] whitespace-nowrap">{c.value}</td>
                  <td className="px-3 py-2 font-mono text-[12px] whitespace-nowrap text-muted-foreground tabular-nums">
                    {fmtDateTime(c.updated_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
