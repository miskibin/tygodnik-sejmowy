import type { PollAverageRow } from "@/lib/db/polls";
import { projectSeatsMap } from "@/lib/polls/seats";
import { partyColor, partyLabel, partyLogoSrc, SEJM_SEATS, SEJM_THRESHOLD_PCT } from "./partyMeta";

const MAJORITY = 231;

// Coalition scenarios are pure arithmetic over the current projection.
// No party-alignment inference, no LLM — just bloc sums of who-could-form-government.
// The "research" path (inferring sides from voting patterns) is a separate task.
type Scenario = {
  id: string;
  name: string;
  members: string[];
  description: string;
};

const SCENARIOS: Scenario[] = [
  {
    id: "current",
    name: "Obecna koalicja",
    members: ["KO", "PSL", "TD", "Polska2050", "Lewica", "Razem"],
    description: "Układ z 15. kadencji: KO, Trzecia Droga, Lewica.",
  },
  {
    id: "right",
    name: "Prawica",
    members: ["PiS", "Konfederacja", "KKP", "PJJ"],
    description: "PiS razem z Konfederacją (i frakcjami pokrewnymi, jeśli wejdą do Sejmu).",
  },
  {
    id: "ko-lewica",
    name: "KO + Lewica + Razem",
    members: ["KO", "Lewica", "Razem"],
    description: "Lewicowa koalicja bez Polski 2050 i PSL.",
  },
  {
    id: "pis-solo",
    name: "PiS solo",
    members: ["PiS"],
    description: "Sam PiS — bez wsparcia innych klubów.",
  },
];

export function KoalicjeStub({ rows }: { rows: PollAverageRow[] }) {
  const seats = projectSeatsMap(rows);

  const scenarios = SCENARIOS.map((s) => {
    // Keep every named candidate visible — sub-threshold parties (Razem, PJJ
    // etc) render grayed instead of silently disappearing. Total only counts
    // qualified members so the majority math stays honest.
    const members = s.members.map((code) => {
      const row = seats.get(code);
      return {
        code,
        seats: row?.seats ?? 0,
        pct: row?.pct ?? null,
        qualified: row?.qualified ?? false,
        inPolls: row != null,
      };
    });
    const total = members.reduce((sum, m) => sum + (m.qualified ? m.seats : 0), 0);
    return { ...s, members, total, viable: total >= MAJORITY };
  });

  return (
    <section className="min-w-0">
      <div className="font-serif text-secondary-foreground text-[15px] sm:text-[16px] leading-[1.55] max-w-[720px] mb-6 text-pretty">
        Suma prognozowanych mandatów dla wstępnie zdefiniowanych bloków. Większość bezwzględna:{" "}
        <strong className="text-foreground tabular-nums">{MAJORITY}</strong> z {SEJM_SEATS}. Czy
        którykolwiek z tych układów byłby politycznie realny — to oddzielna rozmowa.
      </div>

      <div className="grid gap-4 sm:gap-5 sm:grid-cols-2">
        {scenarios.map((s) => {
          const widthPct = Math.min(100, (s.total / SEJM_SEATS) * 100);
          const needed = MAJORITY - s.total;
          return (
            <article
              key={s.id}
              className="border p-5 sm:p-6 min-w-0"
              style={{
                borderColor: s.viable ? "var(--success)" : "var(--border)",
                background: s.viable ? "color-mix(in oklab, var(--success) 8%, var(--background))" : "var(--background)",
              }}
            >
              <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
                <h3 className="font-serif text-[19px] sm:text-[22px] font-medium m-0 tracking-[-0.01em] leading-tight text-balance">
                  {s.name}
                </h3>
                {s.viable && (
                  <span className="font-mono text-[9.5px] tracking-[0.16em] uppercase text-success font-semibold shrink-0">
                    ● ma większość
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5 mb-4">
                {s.members.map((m) => {
                  const src = partyLogoSrc(m.code);
                  const dim = !m.qualified;
                  return (
                    <span
                      key={m.code}
                      title={
                        dim
                          ? `Pod progiem ${SEJM_THRESHOLD_PCT}%${m.pct != null ? ` (${m.pct.toFixed(1)}%)` : ""} — 0 mandatów`
                          : undefined
                      }
                      className={`inline-flex items-center gap-1.5 px-2 py-1 font-mono text-[10.5px] ${
                        dim ? "opacity-55" : ""
                      }`}
                      style={{ background: "var(--muted)", border: "1px solid var(--border)" }}
                    >
                      {src ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={src}
                          alt=""
                          width={12}
                          height={12}
                          className={`object-contain rounded-sm ${dim ? "grayscale" : ""}`}
                          style={{ background: "var(--background)" }}
                        />
                      ) : (
                        <span
                          className="inline-block w-2 h-2 rounded-sm"
                          style={{ background: dim ? "var(--muted-foreground)" : partyColor(m.code) }}
                        />
                      )}
                      <span className={dim ? "text-muted-foreground" : "text-foreground font-semibold"}>
                        {partyLabel(m.code)}
                      </span>
                      <span className="text-muted-foreground tabular-nums">{m.seats}</span>
                      {!m.qualified && (
                        <span className="text-muted-foreground text-[9.5px] italic">
                          (poniżej progu{m.pct != null && m.pct > 0 ? ` · ${m.pct.toFixed(1)}%` : ""})
                        </span>
                      )}
                    </span>
                  );
                })}
                {s.members.length === 0 && (
                  <span className="font-serif italic text-[13px] text-muted-foreground">
                    Brak partii w tym scenariuszu.
                  </span>
                )}
              </div>

              <div className="flex items-baseline gap-3 mb-2">
                <span
                  className="font-serif font-medium leading-none tabular-nums"
                  style={{
                    fontSize: "clamp(2.5rem, 6vw, 3.5rem)",
                    color: s.viable ? "var(--success)" : "var(--foreground)",
                    letterSpacing: "-0.03em",
                  }}
                >
                  {s.total}
                </span>
                <span className="font-sans text-[12px] text-muted-foreground">
                  mandatów z {SEJM_SEATS}
                  <br />
                  <span style={{ color: s.viable ? "var(--success)" : "var(--destructive)" }}>
                    {needed <= 0 ? `+${Math.abs(needed)} ponad próg` : `brakuje ${needed}`}
                  </span>
                </span>
              </div>

              <div className="h-1.5 relative bg-border">
                <div
                  className="absolute inset-y-0 left-0"
                  style={{ width: `${widthPct}%`, background: s.viable ? "var(--success)" : "var(--destructive)", opacity: 0.85 }}
                />
                <span
                  aria-hidden
                  className="absolute -top-1 bottom-[-4px] border-l-2 border-foreground"
                  style={{ left: `${(MAJORITY / SEJM_SEATS) * 100}%` }}
                />
              </div>

              <p className="font-serif italic text-[12.5px] sm:text-[13px] text-muted-foreground mt-3 mb-0 leading-snug">
                {s.description}
              </p>
            </article>
          );
        })}
      </div>

      <p className="mt-6 font-serif text-[13px] text-muted-foreground leading-[1.55] max-w-[760px] italic">
        Te bloki to redakcyjne definicje historycznych podziałów. Bardziej precyzyjna symulacja — liczona z faktycznych
        wzorców głosowań, nie z deklaracji — pojawi się tu wkrótce.
      </p>
    </section>
  );
}
