import {
  getPollAverages30d,
  getPollTrendQuarterly,
  getRecentPolls,
  getPollsterSummary,
  TREND_DEFAULT_PARTIES,
} from "@/lib/db/polls";
import { getKlubPairAgreement, DEFAULT_TERM as COHESION_TERM } from "@/lib/db/coalition_agreement";
import { getLastDataUpdate, formatDataUpdate } from "@/lib/db/freshness";
import { RESIDUAL_CODES } from "./_components/partyMeta";
import { Average30dGrid } from "./_components/Average30dGrid";
import { QuarterlyTrendChart } from "./_components/QuarterlyTrendChart";
import { RecentPollsList } from "./_components/RecentPollsList";
import { PollstersStrip } from "./_components/PollstersStrip";
import { SondazeHero } from "./_components/SondazeHero";
import { SondazeTabsClient } from "./_components/SondazeTabsClient";
import { KoalicjeStub } from "./_components/KoalicjeStub";
import { ViewMethodologyFooter } from "@/components/chrome/ViewMethodologyFooter";
import { PageBreadcrumb } from "@/components/chrome/PageBreadcrumb";

const TREND_INCLUSION_PCT = 3;

export const metadata = {
  title: "Sondaże — Tygodnik Sejmowy",
  description:
    "Co Polacy myślą o partiach. Średnia ważona z ostatnich 30 dni, projekcja mandatów i historyczne trendy kwartalne.",
  alternates: { canonical: "/sondaze" },
};

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch {
    return fallback;
  }
}

export default async function SondazePage() {
  const averages = await safe(getPollAverages30d(), []);

  const trendParties = (() => {
    const eligible = averages
      .filter((r) => !RESIDUAL_CODES.has(r.party_code) && r.percentage_avg >= TREND_INCLUSION_PCT)
      .map((r) => r.party_code);
    return eligible.length > 0 ? eligible : [...TREND_DEFAULT_PARTIES];
  })();

  const [trend, recent, pollsters, agreement, lastUpdate] = await Promise.all([
    safe(getPollTrendQuarterly(trendParties), []),
    safe(getRecentPolls(20), []),
    safe(getPollsterSummary(), []),
    safe(getKlubPairAgreement(COHESION_TERM), { byPair: new Map() }),
    safe(getLastDataUpdate(), null),
  ]);

  const mainCount = averages.filter((r) => !RESIDUAL_CODES.has(r.party_code)).length;
  const trendCount = new Set(trend.map((t) => t.party_code)).size;

  const tabs = [
    { id: "teraz", label: "Średnia teraz", count: mainCount },
    { id: "trend", label: "Trend kwartalny", count: trendCount },
    { id: "koalicje", label: "Możliwe koalicje" },
    { id: "lista", label: "Wszystkie sondaże", count: recent.length },
  ];

  return (
    <main className="bg-background text-foreground font-serif px-3 sm:px-8 md:px-14 pt-8 sm:pt-12 pb-12 sm:pb-16 min-w-0">
      <div className="max-w-[1280px] mx-auto min-w-0">
        <PageBreadcrumb items={[{ label: "Sondaże" }]} />
        <SondazeHero rows={averages} lastUpdateLabel={formatDataUpdate(lastUpdate)} />

        <div className="mt-8 sm:mt-12">
          <SondazeTabsClient
            tabs={tabs}
            panels={{
              teraz: <Average30dGrid rows={averages} />,
              trend: <QuarterlyTrendChart rows={trend} />,
              koalicje: <KoalicjeStub rows={averages} agreement={agreement} term={COHESION_TERM} />,
              lista: (
                <div className="space-y-12 sm:space-y-16">
                  <RecentPollsList rows={recent} averages={averages} />
                  <PollstersStrip rows={pollsters} />
                </div>
              ),
            }}
          />
        </div>

        <ViewMethodologyFooter
          columns={[
            {
              kicker: "Metoda średniej",
              children:
                "Wykładniczy zanik z półokresem 14 dni — sondaż sprzed tygodnia waży około 70% świeższego.",
            },
            {
              kicker: "Mandaty",
              children:
                "Largest-remainder · próg 5% dla partii, 8% dla koalicji. Przybliżenie, nie prognoza wyborów (bez geografii D'Hondta).",
            },
            {
              kicker: "Źródła sondaży",
              children: "Wikipedia (CC BY-SA) — IBRiS, CBOS, Kantar, United Surveys, OPINIA24, Pollster i inne.",
            },
            {
              kicker: "Znaczniki wydarzeń",
              children: (
                <>
                  Pionowe linie na osiach to ręcznie kuratorowana lista istotnych
                  momentów politycznych (wybory, zmiany przywództwa, afery, rozłamy).
                  Daty weryfikowane z mediami i Wikipedią; pełna lista i historia zmian
                  w pliku{" "}
                  <a
                    href="https://github.com/miskibin/tygodnik-sejmowy/blob/main/frontend/lib/timeline-events.ts"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline decoration-dotted underline-offset-2 hover:text-destructive"
                  >
                    lib/timeline-events.ts
                  </a>
                  . Brakuje czegoś?{" "}
                  <a
                    href="https://github.com/miskibin/tygodnik-sejmowy/issues/new"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline decoration-dotted underline-offset-2 hover:text-destructive"
                  >
                    Zgłoś na GitHubie
                  </a>
                  .
                </>
              ),
            },
            {
              kicker: "Aktualizacja",
              children: "Codziennie o 09:00. Newsletter z syntezą wychodzi w piątki.",
            },
          ]}
        />
      </div>
    </main>
  );
}
