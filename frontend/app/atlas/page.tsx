import { Ornament } from "@/components/chrome/Ornament";
import {
  getDistrictMap,
  getKlubFlow,
  getKlubHeatmap,
  getMapPlaceholder,
  getPartyDiscipline,
  getSankeyPlaceholder,
  getSlowMinisters,
  getSlowMinistersPlaceholder,
  getTopicTrends,
  TOPICS_ENUM,
} from "@/lib/db/atlas";
import { MapaOkregow } from "./_components/MapaOkregow";
import { HeatmapaKoalicji } from "./_components/HeatmapaKoalicji";
import { SankeyKluby } from "./_components/SankeyKluby";
import { NajwolniejsiMinistrowie } from "./_components/NajwolniejsiMinistrowie";
import { DyscyplinaPartyjna } from "./_components/DyscyplinaPartyjna";
import { OCzymMowiSejm } from "./_components/OCzymMowiSejm";

// Atlas is data-driven (Supabase) and we want it to recompute on each request
// rather than freeze at build time.

async function formatToday(): Promise<string> {
  return new Date().toLocaleDateString("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// Vercel SSR can hit Supabase's PostgREST 8s ceiling on the voting_by_club
// view (~250k votes re-aggregated per request). Don't 500 the page if one
// module fails — render the rest and let the caller retry.
async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try { return await p; } catch { return fallback; }
}

export default async function AtlasPage() {
  const [heatmap, discipline, topics, mapData, sankey, ministers] = await Promise.all([
    safe(getKlubHeatmap(), { klubs: [], cells: [], totalVotings: 0 }),
    safe(getPartyDiscipline(), []),
    safe(getTopicTrends(), { buckets: [], topics: TOPICS_ENUM, shares: [], totalsPerBucket: [] }),
    safe(getDistrictMap(), getMapPlaceholder()),
    safe(getKlubFlow(), getSankeyPlaceholder()),
    safe(getSlowMinisters(), getSlowMinistersPlaceholder()),
  ]);

  return (
    <main className="bg-background text-foreground font-serif px-4 sm:px-8 md:px-14 pt-10 sm:pt-12 pb-24 sm:pb-28">
      <div className="max-w-[1280px] mx-auto">
        <header className="mb-12 pb-7 border-b-2 border-rule">
          <div className="font-sans text-[11px] tracking-[0.22em] uppercase text-destructive mb-4">
            ✶ &nbsp; Atlas · sześć wykresów które naprawdę coś mówią &nbsp; ✶
          </div>
          <h1
            className="font-serif font-medium m-0 leading-[0.94]"
            style={{ fontSize: "clamp(3rem, 8vw, 5.75rem)", letterSpacing: "-0.04em", textWrap: "balance" }}
          >
            Sejm <em className="text-destructive not-italic font-serif italic">w&nbsp;sześciu</em>
            <br />
            ujęciach.
          </h1>
          <p
            className="font-serif text-secondary-foreground max-w-[720px] mt-6 mb-0"
            style={{ fontSize: 19, lineHeight: 1.55, textWrap: "pretty" }}
          >
            Geografia, koalicje, migracje, opóźnienia, dyscyplina, agenda. Bez wykresów-zombie typu „liczba głosowań na miesiąc". Tylko dane, które opowiadają historię — i pozwalają ją zweryfikować.
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-2 mt-7 font-mono text-[11px] uppercase text-muted-foreground tracking-wider">
            <span>Aktualizacja: {await formatToday()}</span>
            <span>·</span>
            <span>Źródło: ETL sejmograf + API Sejmu RP</span>
            <span>·</span>
            <span>n = {heatmap.totalVotings.toLocaleString("pl-PL")} głosowań</span>
          </div>
        </header>

        <div className="grid gap-20">
          <MapaOkregow data={mapData} />
          <Ornament />
          <HeatmapaKoalicji data={heatmap} />
          <Ornament />
          <SankeyKluby data={sankey} />
          <Ornament />
          <NajwolniejsiMinistrowie data={ministers} />
          <Ornament />
          <DyscyplinaPartyjna data={discipline} />
          <Ornament />
          <OCzymMowiSejm data={topics} />
        </div>

        <footer className="mt-20 pt-6 border-t border-rule font-serif text-[14px] text-muted-foreground leading-[1.6]">
          <p className="m-0 max-w-[760px]">
            Wszystkie wykresy odświeżane na żywo z bazy supagraf (district_klub_stats, klub_pair_agreement_mv, voting_by_club_mv, prints.topic, klub_flow_quarter, mp_minister_reply_lag).
          </p>
        </footer>
      </div>
    </main>
  );
}
