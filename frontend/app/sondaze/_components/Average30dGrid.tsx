import type { PollAverageRow } from "@/lib/db/polls";
import { projectSeatsMap } from "@/lib/polls/seats";
import { partyColor, partyLabel, partyLogoSrc, RESIDUAL_CODES, SEJM_THRESHOLD_PCT } from "./partyMeta";

const PL_MONTHS_SHORT = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];

function fmtPct(n: number): string {
  return n.toLocaleString("pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function fmtDayMonth(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return `${d.getUTCDate()} ${PL_MONTHS_SHORT[d.getUTCMonth()]}`;
}

export function Average30dGrid({ rows }: { rows: PollAverageRow[] }) {
  const main = rows.filter((r) => !RESIDUAL_CODES.has(r.party_code));
  const residual = rows.filter((r) => RESIDUAL_CODES.has(r.party_code));
  const seatsMap = projectSeatsMap(rows);
  // Universal x-axis cap so all CI bars share the same scale (max party + 4pp).
  const scaleMax = Math.max(40, Math.ceil((Math.max(0, ...main.map((r) => r.percentage_max_30d)) + 4) / 5) * 5);

  // Date range from the rows themselves — `last_conducted_at` is the freshest
  // poll per party, so spread tells us the 30d window we're summarising.
  const dates = main
    .map((r) => r.last_conducted_at)
    .filter((d): d is string => !!d)
    .sort();
  const dateLo = dates[0];
  const dateHi = dates[dates.length - 1];

  // Sidebar callout #1 — party with the widest min/max spread (most volatile).
  const mostVolatile = main
    .slice()
    .sort((a, b) => (b.percentage_max_30d - b.percentage_min_30d) - (a.percentage_max_30d - a.percentage_min_30d))[0];
  // Sidebar callout #2 — closest-to-threshold party that's still under 5%.
  // If everyone's over, pick the one with the smallest cushion above 5% instead.
  const subThresholdAll = main.filter((r) => r.percentage_avg < SEJM_THRESHOLD_PCT);
  const subThreshold = subThresholdAll.length > 0
    ? subThresholdAll.sort((a, b) => b.percentage_avg - a.percentage_avg)[0]
    : main.slice().sort((a, b) => a.percentage_avg - b.percentage_avg)[0];
  const subThresholdProgressPct = subThreshold ? Math.min(100, (subThreshold.percentage_avg / SEJM_THRESHOLD_PCT) * 100) : 0;
  const subThresholdGap = subThreshold ? SEJM_THRESHOLD_PCT - subThreshold.percentage_avg : 0;

  return (
    <section className="grid gap-8 lg:gap-12 lg:grid-cols-[1.6fr_1fr] items-start min-w-0">
      <div className="min-w-0">
        <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-destructive mb-2">
          Średnia ważona{dateLo && dateHi ? ` · ${fmtDayMonth(dateLo)} – ${fmtDayMonth(dateHi)}` : ""}
        </div>
        <p className="font-serif text-secondary-foreground text-[15px] sm:text-[16px] leading-[1.55] max-w-[680px] mb-6 text-pretty">
          Wykładniczy zanik z półokresem 14 dni — świeższy sondaż waży więcej. Punkt pokazuje
          średnią, półprzezroczysty pasek to rozrzut min–max w 30-dniowym oknie.
        </p>

        <div className="border-t border-border">
        {main.map((r) => {
          const color = partyColor(r.party_code);
          const seatCount = seatsMap.get(r.party_code)?.seats ?? 0;
          const qualified = r.percentage_avg >= SEJM_THRESHOLD_PCT;
          const ciLow = Math.max(0, r.percentage_min_30d);
          const ciHigh = Math.min(scaleMax, r.percentage_max_30d);
          const ciLeft = (ciLow / scaleMax) * 100;
          const ciWidth = ((ciHigh - ciLow) / scaleMax) * 100;
          const avgLeft = (r.percentage_avg / scaleMax) * 100;
          return (
            <div
              key={r.party_code}
              className="py-4 sm:py-5 border-b border-border grid items-center gap-3 sm:gap-5 grid-cols-[1fr_auto] sm:[grid-template-columns:minmax(140px,180px)_minmax(0,1fr)_minmax(70px,90px)_minmax(60px,80px)] min-w-0"
            >
              {/* Identity */}
              <div className="flex items-center gap-3 min-w-0">
                {partyLogoSrc(r.party_code) ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={partyLogoSrc(r.party_code)!}
                    alt=""
                    width={32}
                    height={32}
                    className="object-contain rounded-sm shrink-0"
                    style={{ background: "var(--background)", border: "1px solid var(--border)" }}
                  />
                ) : (
                  <span
                    className="inline-flex items-center justify-center font-sans font-semibold shrink-0 rounded-sm"
                    style={{ width: 32, height: 32, background: color, color: "var(--background)", fontSize: 12 }}
                  >
                    {r.party_code.slice(0, 3).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  <div className="font-serif text-[16px] sm:text-[18px] font-medium leading-tight tracking-[-0.01em] truncate">
                    {r.party_code}
                  </div>
                  <div className="font-sans text-[11px] text-muted-foreground truncate">
                    {partyLabel(r.party_code)}
                  </div>
                </div>
              </div>

              {/* CI bar — desktop only; mobile shows simple percent below */}
              <div className="hidden sm:block relative h-6 min-w-0">
                <div className="absolute left-0 right-0 top-1/2 h-px bg-border" />
                <div
                  className="absolute top-[10px] h-1 rounded-sm"
                  style={{ left: `${ciLeft}%`, width: `${Math.max(0.5, ciWidth)}%`, background: color, opacity: 0.3 }}
                />
                <div
                  className="absolute top-[6px] w-2.5 h-2.5 rounded-full"
                  style={{
                    left: `calc(${avgLeft}% - 5px)`,
                    background: color,
                    border: "2px solid var(--background)",
                  }}
                />
                <span
                  aria-hidden
                  className="absolute top-[20px] font-mono text-[8.5px] text-muted-foreground"
                  style={{ left: `${(SEJM_THRESHOLD_PCT / scaleMax) * 100}%` }}
                >
                  {SEJM_THRESHOLD_PCT}%
                </span>
              </div>

              {/* Big percentage */}
              <div className="text-right">
                <span
                  className="font-serif font-medium tabular-nums"
                  style={{ fontSize: "clamp(1.5rem, 4vw, 2rem)", letterSpacing: "-0.02em", lineHeight: 1 }}
                >
                  {fmtPct(r.percentage_avg)}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground ml-0.5">%</span>
                <div className="font-mono text-[9.5px] text-muted-foreground mt-1 hidden sm:block">
                  min {fmtPct(r.percentage_min_30d)} – max {fmtPct(r.percentage_max_30d)}
                </div>
              </div>

              {/* Seats / threshold */}
              <div className="text-right">
                {qualified ? (
                  <>
                    <div
                      className="font-serif font-medium tabular-nums leading-none"
                      style={{ fontSize: "clamp(1.1rem, 2.6vw, 1.45rem)" }}
                    >
                      {seatCount}
                    </div>
                    <div className="font-mono text-[9.5px] text-muted-foreground mt-1">mandatów</div>
                  </>
                ) : (
                  <div className="font-mono text-[10px] text-destructive uppercase tracking-wider leading-tight">
                    pod
                    <br />
                    progiem
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {residual.length > 0 && (
        <div className="mt-5 pt-3 border-t border-dashed border-border flex flex-wrap gap-x-5 gap-y-1.5 font-mono text-[10.5px] text-muted-foreground tracking-wide">
          <span className="uppercase tracking-[0.14em]">Pozostałe:</span>
          {residual.map((r) => (
            <span key={r.party_code}>
              <span className="text-secondary-foreground">{partyLabel(r.party_code)}</span>{" "}
              <span className="text-foreground font-semibold">{fmtPct(r.percentage_avg)}%</span>
            </span>
          ))}
        </div>
      )}
      </div>

      {/* Sidebar — "Co się zmieniło" callouts, mirroring the design mock */}
      <aside className="min-w-0 lg:sticky lg:top-4">
        <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-destructive mb-3">
          Co warto wiedzieć
        </div>

        {mostVolatile && (
          <div className="bg-muted border border-border p-5 sm:p-6 mb-4">
            <div className="font-mono text-[9.5px] tracking-[0.14em] uppercase text-muted-foreground mb-2">
              Największy rozrzut w 30 dniach
            </div>
            <div
              className="font-serif font-medium leading-tight tracking-[-0.015em] m-0 text-balance"
              style={{ fontSize: "clamp(1.4rem, 4vw, 1.85rem)" }}
            >
              {partyLabel(mostVolatile.party_code)}
            </div>
            <p className="font-serif italic text-[14px] sm:text-[15px] text-secondary-foreground mt-2 mb-0 leading-[1.5]">
              {fmtPct(mostVolatile.percentage_min_30d)}% – {fmtPct(mostVolatile.percentage_max_30d)}% w sondażach z ostatniego miesiąca · różnica{" "}
              {fmtPct(mostVolatile.percentage_max_30d - mostVolatile.percentage_min_30d)} pkt.
            </p>
            <p className="font-mono text-[10.5px] text-muted-foreground mt-3 pt-3 border-t border-border m-0 leading-[1.5]">
              Pojedyncze sondaże mają błąd statystyczny ±3 pkt — większe rozrzuty zwykle oznaczają,
              że pracownie różnie próbkują tę grupę wyborców.
            </p>
          </div>
        )}

        {subThreshold && (
          <div className="border border-border p-5 sm:p-6">
            <div className="font-mono text-[9.5px] tracking-[0.14em] uppercase text-muted-foreground mb-3">
              {subThresholdGap > 0 ? `Na granicy progu (${SEJM_THRESHOLD_PCT}%)` : `Najbliżej progu od góry`}
            </div>
            <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
              <span className="font-serif text-[20px] sm:text-[22px] font-medium tracking-[-0.01em]">
                {partyLabel(subThreshold.party_code)}
              </span>
              <span
                className="font-mono text-[12px] tabular-nums"
                style={{ color: subThresholdGap > 0 ? "var(--warning)" : "var(--success)" }}
              >
                {fmtPct(subThreshold.percentage_avg)}% · {subThresholdGap > 0 ? "ryzyko" : "bezpiecznie"}
              </span>
            </div>
            <div className="relative h-1.5 bg-border">
              <div
                className="absolute inset-y-0 left-0"
                style={{ width: `${subThresholdProgressPct}%`, background: partyColor(subThreshold.party_code) }}
              />
              <span
                aria-hidden
                className="absolute -top-1 bottom-[-4px] border-l-2 border-foreground"
                style={{ left: "100%", transform: "translateX(-1px)" }}
              />
            </div>
            <p className="font-sans text-[11.5px] text-muted-foreground mt-3 mb-0 leading-[1.5]">
              {subThresholdGap > 0
                ? `Brakuje ${fmtPct(subThresholdGap)} pkt do progu. Pod ${SEJM_THRESHOLD_PCT}% partia nie wprowadza nikogo do Sejmu — w średniej liczone, ale w mandatach zero.`
                : `Zapas ${fmtPct(-subThresholdGap)} pkt nad progiem. Spadek poniżej oznaczałby zero mandatów.`}
            </p>
          </div>
        )}
      </aside>
    </section>
  );
}
