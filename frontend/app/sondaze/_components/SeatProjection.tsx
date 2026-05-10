import type { PollAverageRow } from "@/lib/db/polls";
import { partyColor, partyLabel, partyLogoSrc, RESIDUAL_CODES, SEJM_SEATS, SEJM_THRESHOLD_PCT } from "./partyMeta";

// Largest-remainder allocation of cap seats across fractional shares.
function allocateLargestRemainder(cap: number, weights: number[]): number[] {
  const total = weights.reduce((s, n) => s + n, 0);
  if (total === 0) return weights.map(() => 0);
  const ideal = weights.map((n) => (cap * n) / total);
  const floor = ideal.map((x) => Math.floor(x));
  const allocated = floor.reduce((s, n) => s + n, 0);
  const remainder = cap - allocated;
  const sortedByFrac = ideal
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac);
  const out = floor.slice();
  for (let k = 0; k < remainder; k++) out[sortedByFrac[k % sortedByFrac.length].i]++;
  return out;
}

// Political left → right ordering for poll-projection seating. Mirrors the
// Sejm hall layout (Lewica/Razem on left, KO/PSL/Polska2050 in middle,
// PiS/Konfederacja on right).
const SEAT_ORDER = ["Razem", "Lewica", "KO", "PSL", "TD", "Polska2050", "BS", "PJJ", "PiS", "KKP", "Konfederacja"];

const ROWS: ReadonlyArray<{ r: number; c: number }> = [
  { r: 215, c: 40 },
  { r: 250, c: 48 },
  { r: 285, c: 57 },
  { r: 320, c: 66 },
  { r: 355, c: 75 },
  { r: 390, c: 83 },
  { r: 425, c: 91 },
];

type Allocation = {
  party_code: string;
  pct: number;
  seats: number;
  qualified: boolean;
};

function projectSeats(rows: PollAverageRow[]): Allocation[] {
  const main = rows.filter((r) => !RESIDUAL_CODES.has(r.party_code));
  const qualified = main.filter((r) => r.percentage_avg >= SEJM_THRESHOLD_PCT);
  const sizes = qualified.map((r) => r.percentage_avg);
  const seats = allocateLargestRemainder(SEJM_SEATS, sizes);
  const seatBy = new Map(qualified.map((r, i) => [r.party_code, seats[i]]));
  // Sort allocations by political seating order, fall back to descending pct.
  const ordered = main
    .slice()
    .sort((a, b) => {
      const ai = SEAT_ORDER.indexOf(a.party_code);
      const bi = SEAT_ORDER.indexOf(b.party_code);
      const aix = ai === -1 ? 999 : ai;
      const bix = bi === -1 ? 999 : bi;
      if (aix !== bix) return aix - bix;
      return b.percentage_avg - a.percentage_avg;
    });
  return ordered.map((r) => ({
    party_code: r.party_code,
    pct: r.percentage_avg,
    seats: seatBy.get(r.party_code) ?? 0,
    qualified: r.percentage_avg >= SEJM_THRESHOLD_PCT,
  }));
}

type Dot = { cx: number; cy: number; party: string };

function buildHemicycleDots(allocations: Allocation[]): { dots: Dot[]; logos: { party: string; cx: number; cy: number; size: number; seats: number }[] } {
  const seated = allocations.filter((a) => a.seats > 0);
  const sizes = seated.map((a) => a.seats);
  const total = sizes.reduce((s, n) => s + n, 0);

  // Per-arc allocation by largest remainder.
  const arcAlloc: number[][] = ROWS.map((arc) => allocateLargestRemainder(arc.c, sizes));

  const cursor = new Map<string, number>(seated.map((a) => [a.party_code, 0]));
  const dots: Dot[] = [];
  for (let ai = 0; ai < ROWS.length; ai++) {
    const arc = ROWS[ai];
    let posInArc = 0;
    for (let pi = 0; pi < seated.length; pi++) {
      const party = seated[pi].party_code;
      const n = arcAlloc[ai][pi];
      for (let i = 0; i < n; i++) {
        const t = (posInArc + 0.5) / arc.c;
        const angle = Math.PI - Math.PI * t;
        const x = arc.r * Math.cos(angle);
        const y = -arc.r * Math.sin(angle);
        dots.push({ cx: x, cy: y, party });
        cursor.set(party, (cursor.get(party) ?? 0) + 1);
        posInArc++;
      }
    }
  }

  // Logo ring: place a logo over the centroid of each party's cluster.
  const LOGO_RING_R = 478;
  let cumulative = 0;
  const logos = seated.map((a) => {
    const fraction = a.seats / total;
    const center = cumulative + fraction / 2;
    cumulative += fraction;
    const angle = Math.PI - Math.PI * center;
    const cx = LOGO_RING_R * Math.cos(angle);
    const cy = -LOGO_RING_R * Math.sin(angle);
    const size = Math.max(22, Math.min(56, Math.sqrt(fraction) * 110));
    return { party: a.party_code, cx, cy, size, seats: a.seats };
  });

  return { dots, logos };
}

const MAJORITY = 231;
const COALITION_GOV = new Set(["KO", "PSL", "TD", "Polska2050", "Lewica", "Razem"]);
const COALITION_OPP = new Set(["PiS", "Konfederacja", "KKP", "PJJ"]);

export function SeatProjection({ rows }: { rows: PollAverageRow[] }) {
  const allocations = projectSeats(rows);
  const { dots, logos } = buildHemicycleDots(allocations);

  const govSeats = allocations.filter((a) => COALITION_GOV.has(a.party_code)).reduce((s, a) => s + a.seats, 0);
  const oppSeats = allocations.filter((a) => COALITION_OPP.has(a.party_code)).reduce((s, a) => s + a.seats, 0);
  const otherSeats = SEJM_SEATS - govSeats - oppSeats;

  const subThreshold = allocations.filter((a) => !a.qualified && a.pct > 0);

  return (
    <section>
      <header className="mb-6 pb-3.5 border-b border-rule grid min-w-0 items-start gap-4 sm:items-baseline sm:gap-5 [grid-template-columns:minmax(0,44px)_minmax(0,1fr)] sm:[grid-template-columns:minmax(0,60px)_minmax(0,1fr)]">
        <div className="font-serif italic font-normal text-destructive leading-[0.9] text-[clamp(2.25rem,9vw,3.5rem)] sm:text-[56px]">B</div>
        <div className="min-w-0">
          <div className="font-sans text-[10px] sm:text-[11px] tracking-[0.12em] sm:tracking-[0.16em] uppercase text-muted-foreground mb-1.5">Gdyby wybory dziś · projekcja 460 mandatów</div>
          <h2 className="font-serif font-medium m-0 leading-[1.05] text-[clamp(1.5rem,5.5vw,2.25rem)] tracking-[-0.01em]">Projekcja sali</h2>
          <p className="font-serif m-0 mt-2 text-secondary-foreground leading-[1.5] max-w-[720px] text-[15px] sm:text-base">
            Mandaty rozdzielone proporcjonalnie metodą największej reszty wśród partii powyżej {SEJM_THRESHOLD_PCT}% progu.
            Bez korekty geograficznej D&apos;Hondta — to przybliżenie, nie prognoza wyborów.
          </p>
        </div>
      </header>

      <div className="bg-muted border border-border p-2 sm:p-4 min-w-0 overflow-x-auto">
        <svg viewBox="-540 -540 1080 580" className="w-full min-w-[280px] h-auto block" role="img" aria-label="Projekcja składu Sejmu">
          <style>{`circle.seat{transition:r 0.12s}circle.seat:hover{r:7}`}</style>

          <path d="M -445 0 A 445 445 0 0 1 445 0" fill="none" stroke="var(--rule)" strokeWidth={1} opacity={0.4} />

          {/* Per-mandate dots: no <title> child — we used to render one per dot,
              which inflated the DOM with N copies of the party name (citizen
              test counted "Koalicja Obywatelska" 17× in a row in prod HTML).
              Per-party totals already live in the allocation list below; the
              centroid logos still expose name + seat count via their own
              <title>. */}
          <g aria-label="Mandaty (jeden punkt = jeden poseł)">
            {dots.map((d, i) => (
              <circle
                key={i}
                className="seat"
                cx={d.cx}
                cy={d.cy}
                r={5.5}
                fill={partyColor(d.party)}
              />
            ))}
          </g>

          {logos.map(({ party, cx, cy, size, seats }) => {
            const src = partyLogoSrc(party);
            if (src) {
              return (
                <image
                  key={party}
                  href={src}
                  x={cx - size / 2}
                  y={cy - size / 2}
                  width={size}
                  height={size}
                  preserveAspectRatio="xMidYMid meet"
                  style={{ pointerEvents: "none" }}
                >
                  <title>{`${partyLabel(party)} — ${seats} mandatów`}</title>
                </image>
              );
            }
            const initials = party.replace(/[^A-Za-zŁŚŻŹĆĄĘŃÓ]/g, "").slice(0, 3).toUpperCase() || "??";
            return (
              <g key={party}>
                <circle cx={cx} cy={cy} r={size / 2} fill="var(--background)" stroke={partyColor(party)} strokeWidth={1.5} />
                <text x={cx} y={cy + size * 0.12} textAnchor="middle" fontFamily="var(--font-inter)" fontSize={size * 0.32} fontWeight={600} fill={partyColor(party)}>
                  {initials}
                </text>
              </g>
            );
          })}

          <line x1={0} y1={-200} x2={0} y2={20} stroke="var(--muted-foreground)" strokeWidth={1} strokeDasharray="2 4" opacity={0.5} />
          <text x={0} y={36} textAnchor="middle" fontFamily="var(--font-jetbrains-mono)" fontSize={11} fill="var(--muted-foreground)" letterSpacing={2}>
            MARSZAŁEK
          </text>
        </svg>
      </div>

      <div className="grid gap-3 mt-5 md:grid-cols-3">
        <Block label="Koalicja rządząca (15. kadencja)" seats={govSeats} threshold={MAJORITY} hint="KO + PSL + Polska2050 + Lewica + Razem" />
        <Block label="Opozycja" seats={oppSeats} threshold={MAJORITY} hint="PiS + Konfederacja + KKP + PJJ" />
        <Block label="Pozostali" seats={otherSeats} threshold={MAJORITY} hint="Niezrzeszeni · BS · inne kluby" />
      </div>

      <div className="mt-5 grid gap-y-1.5 md:grid-cols-2 lg:grid-cols-3">
        {allocations.filter((a) => a.seats > 0).map((a) => (
          <div key={a.party_code} className="flex items-center gap-2.5 font-sans text-[13px]">
            <PartyMark code={a.party_code} />
            <span className="text-foreground flex-1 truncate">{partyLabel(a.party_code)}</span>
            <span className="font-mono text-[12px] text-foreground tabular-nums">
              <span className="font-semibold">{a.seats}</span>
              <span className="text-muted-foreground"> ({a.pct.toFixed(1)}%)</span>
            </span>
          </div>
        ))}
      </div>

      {subThreshold.length > 0 && (
        <p className="mt-4 font-mono text-[10px] text-muted-foreground tracking-wide italic">
          Pod progiem {SEJM_THRESHOLD_PCT}% (0 mandatów):{" "}
          {subThreshold.map((a, i) => (
            <span key={a.party_code}>
              {i > 0 ? " · " : ""}
              {partyLabel(a.party_code)} {a.pct.toFixed(1)}%
            </span>
          ))}
        </p>
      )}
    </section>
  );
}

function PartyMark({ code }: { code: string }) {
  const src = partyLogoSrc(code);
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={16} height={16} className="object-contain rounded-sm" style={{ background: "var(--background)", border: "1px solid var(--border)" }} />;
  }
  return <span className="inline-block w-3 h-3 rounded-full" style={{ background: partyColor(code) }} />;
}

function Block({ label, seats, threshold, hint }: { label: string; seats: number; threshold: number; hint: string }) {
  const pct = Math.min(100, (seats / SEJM_SEATS) * 100);
  const overMajority = seats >= threshold;
  return (
    <div className="p-3 sm:p-4 bg-muted border border-border min-w-0">
      <div className="font-mono text-[9px] sm:text-[10px] tracking-[0.12em] sm:tracking-[0.16em] uppercase text-muted-foreground mb-1.5 leading-snug">{label}</div>
      <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 mb-2">
        <span className="font-serif text-[28px] sm:text-[32px] font-medium text-foreground leading-none tabular-nums" style={{ letterSpacing: "-0.02em" }}>{seats}</span>
        <span className="font-mono text-[12px] text-muted-foreground">/ {SEJM_SEATS}</span>
        {overMajority && (
          <span className="sm:ml-auto font-mono text-[10px] tracking-[0.14em] uppercase text-success">Większość</span>
        )}
      </div>
      <div className="h-1 relative border border-border bg-background mb-2">
        <div className="absolute left-0 top-0 bottom-0 bg-foreground" style={{ width: `${pct}%` }} />
        <div className="absolute top-[-2px] bottom-[-2px] border-l border-destructive" style={{ left: `${(threshold / SEJM_SEATS) * 100}%` }} title={`próg większości ${threshold}`} />
      </div>
      <div className="font-serif text-[12px] text-secondary-foreground leading-[1.4]">{hint}</div>
    </div>
  );
}
