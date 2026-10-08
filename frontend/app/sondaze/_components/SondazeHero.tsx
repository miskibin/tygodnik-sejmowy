import type { PollAverageRow } from "@/lib/db/polls";
import { SeatProjection } from "./SeatProjection";
import { partyLabel, RESIDUAL_CODES } from "./partyMeta";

export function SondazeHero({ rows, lastUpdateLabel }: { rows: PollAverageRow[]; lastUpdateLabel: string }) {
  const top = rows.filter(row => !RESIDUAL_CODES.has(row.party_code))
    .sort((a, b) => b.percentage_avg - a.percentage_avg)[0];
  return <section className="grid gap-8 md:grid-cols-2 pb-8 border-b border-border">
    <div>
      <h2 className="text-xl font-medium">Średnia z ostatnich 30 dni</h2>
      {top ? <p className="mt-4 text-lg">{partyLabel(top.party_code)}: <strong>{top.percentage_avg.toLocaleString("pl-PL", { maximumFractionDigits: 1 })}%</strong></p>
        : <p className="mt-4 text-sm text-muted-foreground">Brak sondaży w tym okresie.</p>}
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">Średnia ważona: nowsze sondaże mają większą wagę. Model mandatów zakłada próg 5% dla każdej listy i jeden okręg. Nie odwzorowuje wyniku wyborów.</p>
      <p className="mt-4 text-xs text-muted-foreground">Aktualizacja danych: {lastUpdateLabel}</p>
    </div>
    <div><h2 className="mb-4 text-xl font-medium">Podział mandatów w modelu</h2><SeatProjection rows={rows} compact /></div>
  </section>;
}
