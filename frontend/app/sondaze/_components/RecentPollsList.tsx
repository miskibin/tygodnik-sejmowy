import type { PollAverageRow, RecentPollRow } from "@/lib/db/polls";
import { partyColor, partyLabel, partyLogoSrc, RESIDUAL_CODES } from "./partyMeta";

// Last-resort fallback when averages aren't available.
const FALLBACK_PRIMARY_PARTIES = ["KO", "PiS", "Konfederacja", "KKP", "Lewica"];

function sourceDomain(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host;
  } catch {
    return "źródło";
  }
}

function fmtRange(a: string, b: string): string {
  // 2026-04-28 -> 28.04
  const fmt = (iso: string) => {
    const d = new Date(iso + "T00:00:00Z");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    return `${dd}.${mm}`;
  };
  if (a === b) {
    const d = new Date(b + "T00:00:00Z");
    return `${fmt(b)}.${String(d.getUTCFullYear()).slice(2)}`;
  }
  const d = new Date(b + "T00:00:00Z");
  return `${fmt(a)} – ${fmt(b)}.${String(d.getUTCFullYear()).slice(2)}`;
}

function fmtPct(n: number | null): string {
  if (n === null) return "—";
  return n.toLocaleString("pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function RecentPollsList({ rows, averages }: { rows: RecentPollRow[]; averages?: PollAverageRow[] }) {
  // Top 5 parties by current 30d average — keeps the table aligned with what
  // people actually see at the top of the page (e.g. KKP/Braun gets a column
  // when polling at 8%, instead of being demoted under PSL at 3%).
  const PRIMARY_PARTIES = (averages && averages.length > 0)
    ? averages
        .filter((r) => !RESIDUAL_CODES.has(r.party_code))
        .slice(0, 5)
        .map((r) => r.party_code)
    : FALLBACK_PRIMARY_PARTIES;
  return (
    <section>
      <header className="mb-6 pb-3.5 border-b border-rule grid min-w-0 items-start gap-4 sm:items-baseline sm:gap-5 [grid-template-columns:minmax(0,44px)_minmax(0,1fr)] sm:[grid-template-columns:minmax(0,60px)_minmax(0,1fr)]">
        <div className="font-serif italic font-normal text-destructive leading-[0.9] text-[clamp(2.25rem,9vw,3.5rem)] sm:text-[56px]">D</div>
        <div className="min-w-0">
          <div className="font-sans text-[10px] sm:text-[11px] tracking-[0.12em] sm:tracking-[0.16em] uppercase text-muted-foreground mb-1.5">Surowe odczyty</div>
          <h2 className="font-serif font-medium m-0 leading-[1.05] text-[clamp(1.5rem,5.5vw,2.25rem)] tracking-[-0.01em]">Ostatnie sondaże</h2>
          <p className="font-serif m-0 mt-2 text-secondary-foreground leading-[1.5] max-w-[720px] text-[15px] sm:text-base">
            Dwadzieścia najświeższych pomiarów. Główne partie w nagłówku — pełna rozpiska po kliknięciu źródła.
          </p>
        </div>
      </header>

      <div className="border-t border-rule">
        {/* Header row */}
        <div className="hidden md:grid items-baseline py-2.5 px-3 border-b border-rule font-mono text-[10px] tracking-[0.16em] uppercase text-muted-foreground"
          style={{ gridTemplateColumns: "1.5fr 0.95fr 0.6fr repeat(5, 0.65fr) 1fr", columnGap: 12 }}
        >
          <span>Pracownia</span>
          <span>Termin</span>
          <span className="text-right">Próba</span>
          {PRIMARY_PARTIES.map((p) => {
            const src = partyLogoSrc(p);
            return (
              <span key={p} className="flex justify-end items-center gap-1.5" title={partyLabel(p)}>
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={src} alt={partyLabel(p)} width={14} height={14} className="object-contain rounded-sm" style={{ background: "var(--background)", border: "1px solid var(--border)" }} />
                ) : null}
                <span>{p}</span>
              </span>
            );
          })}
          <span className="text-right">Źródło</span>
        </div>

        {rows.map((p) => {
          const lookup = new Map(p.results.map((r) => [r.party_code, r.percentage]));
          const tail = p.results.filter((r) => !PRIMARY_PARTIES.includes(r.party_code) && !RESIDUAL_CODES.has(r.party_code));
          return (
            <div key={p.poll_id} className="border-b border-border py-3 px-3 hover:bg-muted">
              {/* Mobile: stacked card — desktop: wide table row */}
              <div className="md:hidden space-y-2.5 font-sans text-[13px]">
                <div className="flex flex-wrap items-start justify-between gap-2 min-w-0">
                  <span className="font-serif text-[15px] text-foreground font-medium min-w-0">{p.pollster}</span>
                  <span className="font-mono text-[11px] text-secondary-foreground shrink-0">
                    {fmtRange(p.conducted_at_start, p.conducted_at_end)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground">
                  <span>
                    Próba:{" "}
                    <span className="text-foreground">{p.sample_size ? p.sample_size.toLocaleString("pl-PL") : "—"}</span>
                  </span>
                  {p.source_url ? (
                    <a
                      href={p.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-destructive hover:underline break-all"
                      title={p.source_url}
                    >
                      {sourceDomain(p.source_url)} ↗
                    </a>
                  ) : (
                    <span className="italic">brak źródła</span>
                  )}
                </div>
                <div className="grid grid-cols-2 min-[400px]:grid-cols-3 gap-x-3 gap-y-2 sm:grid-cols-5">
                  {PRIMARY_PARTIES.map((code) => {
                    const v = lookup.get(code) ?? null;
                    return (
                      <div key={code} className="min-w-0">
                        <div className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground truncate" title={partyLabel(code)}>
                          {code}
                        </div>
                        <div className="font-mono text-[13px] text-foreground tabular-nums">
                          <span className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle" style={{ background: partyColor(code) }} />
                          {fmtPct(v)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div
                className="hidden md:grid items-baseline gap-y-1 font-sans text-[13px]"
                style={{ gridTemplateColumns: "1.5fr 0.95fr 0.6fr repeat(5, 0.65fr) 1fr", columnGap: 12 }}
              >
                <span className="font-serif text-[15px] text-foreground">{p.pollster}</span>
                <span className="font-mono text-[11px] text-secondary-foreground">{fmtRange(p.conducted_at_start, p.conducted_at_end)}</span>
                <span className="font-mono text-[11px] text-muted-foreground text-right">
                  {p.sample_size ? p.sample_size.toLocaleString("pl-PL") : "—"}
                </span>
                {PRIMARY_PARTIES.map((code) => {
                  const v = lookup.get(code) ?? null;
                  return (
                    <span key={code} className="font-mono text-[12px] text-right text-foreground">
                      <span className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle" style={{ background: partyColor(code) }} />
                      {fmtPct(v)}
                    </span>
                  );
                })}
                <span className="text-right">
                  {p.source_url ? (
                    <a
                      href={p.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[10px] tracking-wider lowercase text-destructive hover:underline truncate inline-block max-w-full"
                      title={p.source_url}
                    >
                      {sourceDomain(p.source_url)} ↗
                    </a>
                  ) : (
                    <span className="font-mono text-[10px] text-muted-foreground">—</span>
                  )}
                </span>
              </div>
              {tail.length > 0 && (
                <div className="mt-1.5 ml-0 md:ml-1 font-mono text-[10px] text-muted-foreground tracking-wide">
                  {tail.map((r, i) => (
                    <span key={r.party_code}>
                      {i > 0 ? " · " : ""}
                      {r.party_code} {fmtPct(r.percentage)}%
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
