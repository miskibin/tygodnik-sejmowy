import type { PollAverageRow } from "@/lib/db/polls";
import { NON_ADDITIVE_SERIES_NOTE } from "@/lib/polls/series";
import { partyColor, partyLabel, partyLogoSrc, RESIDUAL_CODES } from "./partyMeta";

function daysAgo(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const now = new Date();
  const diff = Math.round((now.getTime() - d.getTime()) / 86400_000);
  if (diff <= 0) return "dziś";
  if (diff === 1) return "wczoraj";
  if (diff < 7) return `${diff} dni temu`;
  if (diff < 30) return `${Math.floor(diff / 7)} tyg. temu`;
  return `${Math.floor(diff / 30)} mies. temu`;
}

function fmtPct(n: number): string {
  return n.toLocaleString("pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function Average30dGrid({ rows }: { rows: PollAverageRow[] }) {
  const main = rows.filter((r) => !RESIDUAL_CODES.has(r.party_code));
  const residual = rows.filter((r) => RESIDUAL_CODES.has(r.party_code));
  const max = Math.max(1, ...main.map((r) => r.percentage_avg));
  const total = rows.reduce((sum, r) => sum + r.percentage_avg, 0);

  return (
    <section>
      <header className="mb-6 pb-3.5 border-b border-rule grid min-w-0 items-start gap-4 sm:items-baseline sm:gap-5 [grid-template-columns:minmax(0,44px)_minmax(0,1fr)] sm:[grid-template-columns:minmax(0,60px)_minmax(0,1fr)]">
        <div className="font-serif italic font-normal text-destructive leading-[0.9] text-[clamp(2.25rem,9vw,3.5rem)] sm:text-[56px]">A</div>
        <div className="min-w-0">
          <div className="font-sans text-[10px] sm:text-[11px] tracking-[0.12em] sm:tracking-[0.16em] uppercase text-muted-foreground mb-1.5">Średnia ważona — ostatnie 30 dni</div>
          <h2 className="font-serif font-medium m-0 leading-[1.05] text-[clamp(1.5rem,5.5vw,2.25rem)] tracking-[-0.01em]">Aktualnie</h2>
          <p className="font-serif m-0 mt-2 text-secondary-foreground leading-[1.5] max-w-[720px] text-[15px] sm:text-base">
            Wykładniczy zanik z półokresem 14 dni — świeższy sondaż waży więcej. Posortowane od największego.
          </p>
        </div>
      </header>

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {main.map((r) => {
          const color = partyColor(r.party_code);
          const widthPct = (r.percentage_avg / max) * 100;
          return (
            <article
              key={r.party_code}
              className="p-5 bg-muted border border-border"
            >
              <div className="flex items-center gap-3 mb-3">
                {partyLogoSrc(r.party_code) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={partyLogoSrc(r.party_code)!}
                    alt={partyLabel(r.party_code)}
                    width={36}
                    height={36}
                    className="object-contain rounded-sm shrink-0"
                    style={{ background: "var(--background)", border: "1px solid var(--border)" }}
                  />
                ) : (
                  <span
                    className="inline-flex items-center justify-center font-sans font-semibold shrink-0 rounded-sm"
                    style={{ width: 36, height: 36, background: color, color: "var(--background)", fontSize: 13, letterSpacing: "0.02em" }}
                  >
                    {r.party_code.slice(0, 3).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground leading-none mb-1">
                    {r.party_code}
                  </div>
                  <div className="font-serif text-[18px] font-medium text-foreground leading-tight truncate">
                    {partyLabel(r.party_code)}
                  </div>
                </div>
              </div>
              <div className="flex items-baseline gap-1.5 mb-3">
                <span className="font-serif text-[44px] font-medium text-foreground leading-none" style={{ letterSpacing: "-0.02em" }}>
                  {fmtPct(r.percentage_avg)}
                </span>
                <span className="font-serif text-[20px] text-muted-foreground">%</span>
              </div>
              <div className="h-1.5 relative border border-border bg-background mb-3">
                <div className="absolute left-0 top-0 bottom-0" style={{ width: `${widthPct}%`, background: color }} />
              </div>
              <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:items-baseline font-mono text-[10px] text-muted-foreground tracking-wide">
                <span className="min-w-0 break-words">min {fmtPct(r.percentage_min_30d)} – max {fmtPct(r.percentage_max_30d)}%</span>
                <span className="shrink-0 sm:text-right">n = {r.n_polls}</span>
              </div>
              <div className="mt-1 font-mono text-[10px] text-muted-foreground italic">
                ostatni: {daysAgo(r.last_conducted_at)}
              </div>
            </article>
          );
        })}
      </div>

      {residual.length > 0 && (
        <div className="mt-6 pt-4 border-t border-dashed border-border flex flex-wrap gap-x-6 gap-y-2 font-mono text-[11px] text-muted-foreground tracking-wide">
          <span className="uppercase tracking-[0.16em]">Pozostałe:</span>
          {residual.map((r) => (
            <span key={r.party_code}>
              <span className="text-secondary-foreground">{partyLabel(r.party_code)}</span>
              {" "}
              <span className="text-foreground font-semibold">{fmtPct(r.percentage_avg)}%</span>
            </span>
          ))}
        </div>
      )}

      <p className="mt-4 font-mono text-[10px] text-muted-foreground tracking-wide leading-relaxed">
        Suma wszystkich pokazanych serii: {fmtPct(total)}%. {NON_ADDITIVE_SERIES_NOTE}
      </p>
    </section>
  );
}
