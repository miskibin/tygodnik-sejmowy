import { Ornament } from "@/components/chrome/Ornament";
import {
  getPollAverages30d,
  getPollTrendQuarterly,
  getRecentPolls,
  getPollsterSummary,
  TREND_DEFAULT_PARTIES,
} from "@/lib/db/polls";
import { RESIDUAL_CODES } from "./_components/partyMeta";
import { Average30dGrid } from "./_components/Average30dGrid";
import { SeatProjection } from "./_components/SeatProjection";
import { QuarterlyTrendChart } from "./_components/QuarterlyTrendChart";
import { RecentPollsList } from "./_components/RecentPollsList";
import { PollstersStrip } from "./_components/PollstersStrip";

// Threshold for which parties get a line on the quarterly trend chart.
// Anything below ~3% in the 30d average is too noisy to plot meaningfully and
// just clutters the legend (e.g. Polska2050 collapsed below 2%).
const TREND_INCLUSION_PCT = 3;


export const metadata = {
  title: "Sondaże — Tygodnik Sejmowy",
  description:
    "Co Polacy myślą o partiach. Średnia ważona z ostatnich 30 dni i historyczne trendy kwartalne.",
};

function formatToday(): string {
  return new Date().toLocaleDateString("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch {
    return fallback;
  }
}

export default async function SondazePage() {
  const averages = await safe(getPollAverages30d(), []);

  // Adaptive trend party list: anything currently polling >= 3% in the 30d
  // average. Falls back to the curated default if averages are unavailable so
  // the chart never goes blank. Drops residual buckets (Inne / Niezdecydowani).
  const trendParties = (() => {
    const eligible = averages
      .filter((r) => !RESIDUAL_CODES.has(r.party_code) && r.percentage_avg >= TREND_INCLUSION_PCT)
      .map((r) => r.party_code);
    return eligible.length > 0 ? eligible : [...TREND_DEFAULT_PARTIES];
  })();

  const [trend, recent, pollsters] = await Promise.all([
    safe(getPollTrendQuarterly(trendParties), []),
    safe(getRecentPolls(20), []),
    safe(getPollsterSummary(), []),
  ]);

  const totalPolls = pollsters.reduce((acc, r) => acc + r.n_polls, 0);

  return (
    <main className="bg-background text-foreground font-serif px-3 sm:px-8 md:px-14 pt-8 sm:pt-12 pb-20 sm:pb-28 min-w-0">
      <div className="max-w-[1280px] mx-auto min-w-0">
        <header className="mb-8 sm:mb-12 pb-6 sm:pb-7 border-b-2 border-rule">
          <div className="font-sans text-[10px] sm:text-[11px] tracking-[0.14em] sm:tracking-[0.22em] uppercase text-destructive mb-3 sm:mb-4 text-balance">
            ✶ &nbsp; Sondaże · co Polacy myślą o partiach &nbsp; ✶
          </div>
          <h1
            className="font-serif font-medium m-0 leading-[0.94]"
            style={{ fontSize: "clamp(3rem, 8vw, 5.75rem)", letterSpacing: "-0.04em", textWrap: "balance" }}
          >
            Sondaże, <em className="text-destructive not-italic font-serif italic">średnio</em>
            <br />
            ważone.
          </h1>
          <p
            className="font-serif text-secondary-foreground max-w-[720px] mt-5 sm:mt-6 mb-0 text-[17px] sm:text-[19px] leading-[1.5] sm:leading-[1.55] text-pretty"
          >
            Średnia ważona z ostatnich 30 dni — świeższy sondaż waży więcej. Plus historyczne trendy
            kwartalne, surowe odczyty i pracownie które pytały. Bez interpretacji, bez wyrwanych
            cytatów. Liczby same w sobie.
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 sm:gap-x-6 mt-6 sm:mt-7 font-mono text-[10px] sm:text-[11px] uppercase text-muted-foreground tracking-wide sm:tracking-wider">
            <span>Aktualizacja: {formatToday()}</span>
            <span>·</span>
            <span>Źródło: Wikipedia (CC BY-SA)</span>
            <span>·</span>
            <span>n = {totalPolls.toLocaleString("pl-PL")} sondaży</span>
          </div>
        </header>

        <div className="grid gap-12 sm:gap-16 md:gap-20">
          <Average30dGrid rows={averages} />
          <Ornament />
          <SeatProjection rows={averages} />
          <Ornament />
          <QuarterlyTrendChart rows={trend} />
          <Ornament />
          <RecentPollsList rows={recent} averages={averages} />
          <Ornament />
          <PollstersStrip rows={pollsters} />
        </div>

        <footer className="mt-12 sm:mt-20 pt-6 border-t border-rule font-serif text-[13px] sm:text-[14px] text-muted-foreground leading-[1.6]">
          <p className="m-0 max-w-[760px]">
            Dane z Wikipedii (CC BY-SA), aktualizacja codziennie. Średnia ważona to wykładniczy zanik
            z półokresem 14 dni — sondaż sprzed tygodnia waży około 70% świeższego. Trend kwartalny
            to zwykła średnia arytmetyczna w obrębie kwartału.
          </p>
        </footer>
      </div>
    </main>
  );
}
