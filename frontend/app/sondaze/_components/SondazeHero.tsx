import type { PollAverageRow } from "@/lib/db/polls";
import { SeatProjection } from "./SeatProjection";
import { partyLabel, partyColor, partyLogoSrc, RESIDUAL_CODES, SEJM_THRESHOLD_PCT } from "./partyMeta";
import { COALITION_GOV, COALITION_OPP } from "@/lib/polls/seats";

function fmtPct(n: number): string {
  return n.toLocaleString("pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function daysAgo(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const now = new Date();
  const diff = Math.round((now.getTime() - d.getTime()) / 86400_000);
  if (diff <= 0) return "dziś";
  if (diff === 1) return "wczoraj";
  if (diff < 7) return `${diff} dni temu`;
  return `${Math.floor(diff / 7)} tyg. temu`;
}

export function SondazeHero({ rows, lastUpdateLabel }: { rows: PollAverageRow[]; lastUpdateLabel: string }) {
  const main = rows.filter((r) => !RESIDUAL_CODES.has(r.party_code));
  const latestPoll = main.reduce<string | null>((acc, r) => {
    if (!r.last_conducted_at) return acc;
    if (!acc || r.last_conducted_at > acc) return r.last_conducted_at;
    return acc;
  }, null);

  // Bloc shares are voter-preference percentages over *all* main parties
  // (sub-threshold included — Razem at 3% still counts as "rządząca" support
  // even though they'd take 0 seats). Residual buckets like "Niezdecydowani"
  // are excluded so the three numbers sum to the poll's decided share.
  // Seat math lives separately in SeatProjection.
  const govPct = main
    .filter((r) => COALITION_GOV.has(r.party_code))
    .reduce((s, r) => s + r.percentage_avg, 0);
  const oppPct = main
    .filter((r) => COALITION_OPP.has(r.party_code))
    .reduce((s, r) => s + r.percentage_avg, 0);
  const otherPct = main
    .filter((r) => !COALITION_GOV.has(r.party_code) && !COALITION_OPP.has(r.party_code))
    .reduce((s, r) => s + r.percentage_avg, 0);

  const topParty = main[0];
  const dominantBloc =
    govPct > oppPct
      ? { label: "Koalicja rządząca", color: "var(--success)" }
      : { label: "Opozycja", color: "var(--destructive)" };
  const dominantPct = govPct > oppPct ? govPct : oppPct;

  return (
    <section className="grid gap-8 md:gap-12 lg:gap-16 md:grid-cols-[1.25fr_1fr] items-start pb-10 md:pb-12 border-b border-border">
      <div className="min-w-0">
        <div className="font-sans text-[10px] sm:text-[11px] tracking-[0.18em] uppercase text-destructive mb-4">
          ✶ &nbsp; Gdyby wybory były w niedzielę
        </div>
        <h1
          className="font-serif font-medium m-0 leading-[0.98] tracking-[-0.035em] text-balance"
          style={{ fontSize: "clamp(2.25rem, 7vw, 4.75rem)" }}
        >
          <em
            className="not-italic font-serif italic"
            style={{ color: dominantBloc.color }}
          >
            {dominantBloc.label}
          </em>{" "}
          ma {fmtPct(dominantPct)}% poparcia.
          {topParty && (
            <>
              {" "}
              <span className="text-secondary-foreground">
                Lider:{" "}
                <span className="text-foreground">{partyLabel(topParty.party_code)}</span> —{" "}
                {fmtPct(topParty.percentage_avg)}%.
              </span>
            </>
          )}
        </h1>
        <p
          className="font-serif text-secondary-foreground mt-5 sm:mt-6 mb-0 leading-[1.5] sm:leading-[1.55] text-[16px] sm:text-[19px] max-w-[620px] text-pretty"
        >
          Średnia ważona z ostatnich 30 dni — świeższe sondaże ważą więcej. Próg do Sejmu {SEJM_THRESHOLD_PCT}%
          dla partii, 8% dla koalicji. Większość bezwzględna: 231 z 460 mandatów.
        </p>

        <div className="grid grid-cols-3 gap-3 sm:gap-5 mt-6 sm:mt-8 max-w-[520px] font-sans">
          <BlocStat label="Rządząca" pct={govPct} color="var(--success)" />
          <BlocStat label="Opozycja" pct={oppPct} color="var(--destructive)" />
          <BlocStat label="Pozostałe" pct={otherPct} color="var(--muted-foreground)" />
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-1.5 sm:gap-x-5 mt-6 sm:mt-7 font-mono text-[10px] sm:text-[11px] uppercase text-muted-foreground tracking-wide sm:tracking-wider">
          <span>Aktualizacja: {lastUpdateLabel}</span>
          {latestPoll && (
            <>
              <span aria-hidden>·</span>
              <span>ostatni sondaż: {daysAgo(latestPoll)}</span>
            </>
          )}
          <span aria-hidden>·</span>
          <span>Źródło: Wikipedia (CC BY-SA)</span>
        </div>
      </div>

      {/* Right column: keep our hemicycle (better than design's reversed one). */}
      <div
        className="bg-muted border border-rule p-3 sm:p-5 relative"
        style={{ boxShadow: "6px 6px 0 var(--rule)" }}
      >
        <div className="font-sans text-[10px] tracking-[0.18em] uppercase text-destructive mb-3">
          Prognozowany Sejm
        </div>
        <SeatProjection rows={rows} compact />
        <div className="mt-4 pt-3 border-t border-border flex flex-wrap gap-x-3 gap-y-1.5">
          {main.slice(0, 6).map((r) => {
            const src = partyLogoSrc(r.party_code);
            return (
              <span key={r.party_code} className="flex items-center gap-1.5 font-sans text-[11px] text-secondary-foreground">
                {src ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={src} alt="" width={14} height={14} className="object-contain rounded-sm" style={{ background: "var(--background)", border: "1px solid var(--border)" }} />
                ) : (
                  <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: partyColor(r.party_code) }} />
                )}
                <strong className="text-foreground font-medium">{r.party_code}</strong>
                <span className="font-mono text-[10.5px] text-muted-foreground">{fmtPct(r.percentage_avg)}%</span>
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function BlocStat({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div>
      <div className="font-mono text-[9.5px] sm:text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1.5">
        {label}
      </div>
      <div className="flex items-baseline gap-1">
        <span
          className="font-serif font-medium text-[clamp(1.5rem,4vw,2rem)] leading-none tabular-nums"
          style={{ color, letterSpacing: "-0.02em" }}
        >
          {fmtPct(pct)}
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">%</span>
      </div>
    </div>
  );
}
