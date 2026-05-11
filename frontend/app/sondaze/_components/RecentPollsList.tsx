import type { PollAverageRow, RecentPollRow } from "@/lib/db/polls";
import { partyColor, partyLabel, RESIDUAL_CODES } from "./partyMeta";

function sourceDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "źródło";
  }
}

function fmtRange(a: string, b: string): string {
  const fmt = (iso: string) => {
    const d = new Date(iso + "T00:00:00Z");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    return `${dd}.${mm}`;
  };
  if (a === b) return `${fmt(b)}`;
  return `${fmt(a)} – ${fmt(b)}`;
}

function fmtPct(n: number | null): string {
  if (n === null) return "—";
  return n.toLocaleString("pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

const FALLBACK = ["KO", "PiS", "Konfederacja", "Lewica", "PSL"];

export function RecentPollsList({ rows, averages }: { rows: RecentPollRow[]; averages?: PollAverageRow[] }) {
  // Stacked bars need a consistent party ordering — use the current 30d
  // average ranking so the same color is in the same horizontal position
  // across every poll.
  const order =
    averages && averages.length > 0
      ? averages.filter((r) => !RESIDUAL_CODES.has(r.party_code)).map((r) => r.party_code)
      : FALLBACK;

  return (
    <section className="min-w-0">
      <div className="font-serif text-secondary-foreground text-[15px] sm:text-[16px] leading-[1.55] max-w-[720px] mb-6 text-pretty">
        {rows.length} najnowszych pomiarów. Każdy pasek to jeden sondaż — szerokość segmentu = procent
        poparcia. Pojedyncze sondaże mają błąd statystyczny ±3 pkt; w średniej powyżej szum znika.
      </div>

      <div className="border-t border-border">
        {/* Header row (desktop) */}
        <div
          className="hidden md:grid items-baseline py-2.5 font-mono text-[9.5px] tracking-[0.14em] uppercase text-muted-foreground border-b border-border"
          style={{ gridTemplateColumns: "minmax(120px, 1.3fr) 90px 60px minmax(220px, 2.4fr) minmax(80px, 0.9fr)", columnGap: 16 }}
        >
          <span>Pracownia</span>
          <span>Termin</span>
          <span className="text-right">Próba</span>
          <span>Wyniki — segmenty = % poparcia</span>
          <span className="text-right">Źródło</span>
        </div>

        {rows.map((p) => {
          const lookup = new Map(p.results.map((r) => [r.party_code, r.percentage]));
          // Segments scaled so the full width = 100% of the poll (incl. residual buckets).
          // Anything not in the lookup gets dropped; "Inne" / "Niezdecydowani" included to honour the bar's full width.
          const segments = p.results
            .map((r) => ({ code: r.party_code, pct: r.percentage ?? 0 }))
            .filter((s) => s.pct > 0)
            .sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code));

          return (
            <div key={p.poll_id} className="border-b border-border py-3 md:py-3.5 hover:bg-muted/40">
              {/* Mobile: stacked */}
              <div className="md:hidden space-y-2.5 font-sans">
                <div className="flex items-baseline justify-between gap-2 min-w-0">
                  <span className="font-serif text-[15px] font-medium truncate">{p.pollster}</span>
                  <span className="font-mono text-[10.5px] text-muted-foreground shrink-0">
                    {fmtRange(p.conducted_at_start, p.conducted_at_end)}
                  </span>
                </div>
                <StackedBar segments={segments} />
                <div className="flex items-baseline justify-between gap-3 font-mono text-[10.5px] text-muted-foreground">
                  <span>
                    n = <span className="text-foreground">{p.sample_size ? p.sample_size.toLocaleString("pl-PL") : "—"}</span>
                  </span>
                  {p.source_url && (
                    <a href={p.source_url} target="_blank" rel="noopener noreferrer" className="text-destructive hover:underline">
                      {sourceDomain(p.source_url)} ↗
                    </a>
                  )}
                </div>
              </div>

              {/* Desktop: row */}
              <div
                className="hidden md:grid items-center font-sans text-[13px]"
                style={{ gridTemplateColumns: "minmax(120px, 1.3fr) 90px 60px minmax(220px, 2.4fr) minmax(80px, 0.9fr)", columnGap: 16 }}
              >
                <span className="font-serif text-[16px] text-foreground truncate">{p.pollster}</span>
                <span className="font-mono text-[11px] text-secondary-foreground tabular-nums">
                  {fmtRange(p.conducted_at_start, p.conducted_at_end)}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground text-right tabular-nums">
                  {p.sample_size ? p.sample_size.toLocaleString("pl-PL") : "—"}
                </span>
                <StackedBar segments={segments} lookup={lookup} order={order} />
                <span className="text-right">
                  {p.source_url ? (
                    <a
                      href={p.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[10px] tracking-wider lowercase text-destructive hover:underline"
                    >
                      {sourceDomain(p.source_url)} ↗
                    </a>
                  ) : (
                    <span className="font-mono text-[10px] text-muted-foreground italic">brak</span>
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function StackedBar({
  segments,
  lookup,
  order,
}: {
  segments: { code: string; pct: number }[];
  lookup?: Map<string, number | null>;
  order?: string[];
}) {
  const total = segments.reduce((s, x) => s + x.pct, 0);
  if (total === 0) return <div className="font-mono text-[11px] text-muted-foreground italic">brak danych</div>;
  return (
    <div className="min-w-0">
      <div className="flex h-6 overflow-hidden" style={{ background: "var(--muted)" }}>
        {segments.map((s) => {
          const widthPct = s.pct; // segments are already % shares
          if (widthPct < 0.3) return null;
          return (
            <div
              key={s.code}
              title={`${partyLabel(s.code)} ${fmtPct(s.pct)}%`}
              className="flex items-center justify-center font-mono text-[10px] font-semibold text-background overflow-hidden whitespace-nowrap"
              style={{ width: `${widthPct}%`, background: partyColor(s.code), minWidth: 0 }}
            >
              {widthPct >= 6 ? s.pct.toFixed(1) : ""}
            </div>
          );
        })}
      </div>
      {/* Inline numeric labels under the bar for the top 5 parties */}
      {order && lookup && (
        <div className="hidden lg:flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 font-mono text-[10px] text-muted-foreground">
          {order.slice(0, 5).map((code) => {
            const v = lookup.get(code);
            return (
              <span key={code}>
                <span className="inline-block w-1.5 h-1.5 rounded-full align-middle mr-1" style={{ background: partyColor(code) }} />
                {code} {fmtPct(v ?? null)}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
