import type { Metadata } from "next";
import { Ornament } from "@/components/chrome/Ornament";

export const metadata: Metadata = {
  alternates: { canonical: "/atlas" },
};

import { PageBreadcrumb } from "@/components/chrome/PageBreadcrumb";
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
import { getLastDataUpdate, formatDataUpdate } from "@/lib/db/freshness";
import { MapaOkregow } from "./_components/MapaOkregow";
import { HeatmapaKoalicji } from "./_components/HeatmapaKoalicji";
import { SankeyKluby } from "./_components/SankeyKluby";
import { NajwolniejsiMinistrowie } from "./_components/NajwolniejsiMinistrowie";
import { DyscyplinaPartyjna } from "./_components/DyscyplinaPartyjna";
import { OCzymMowiSejm } from "./_components/OCzymMowiSejm";

// Atlas is data-driven (Supabase) and we want it to recompute on each request
// rather than freeze at build time.

// Vercel SSR can hit Supabase's PostgREST 8s ceiling on the voting_by_club
// view (~250k votes re-aggregated per request). Don't 500 the page if one
// module fails — render the rest and let the caller retry.
async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try { return await p; } catch { return fallback; }
}

export default async function AtlasPage() {
  const [heatmap, discipline, topics, mapData, sankey, ministers, lastUpdate] = await Promise.all([
    safe(getKlubHeatmap(), { klubs: [], cells: [], totalVotings: 0 }),
    safe(getPartyDiscipline(), []),
    safe(getTopicTrends(), { buckets: [], topics: TOPICS_ENUM, shares: [], totalsPerBucket: [] }),
    safe(getDistrictMap(), getMapPlaceholder()),
    safe(getKlubFlow(), getSankeyPlaceholder()),
    safe(getSlowMinisters(), getSlowMinistersPlaceholder()),
    safe(getLastDataUpdate(), null),
  ]);

  return (
    <main className="bg-background text-foreground font-serif px-3 sm:px-8 md:px-14 pt-8 sm:pt-12 pb-20 sm:pb-28 min-w-0 w-full">
      <div className="max-w-[1280px] mx-auto min-w-0 w-full">
        <PageBreadcrumb
          items={[{ label: "Atlas" }]}
          subtitle={`Aktualizacja: ${formatDataUpdate(lastUpdate)} · n = ${heatmap.totalVotings.toLocaleString("pl-PL")} głosowań · Źródło: ETL sejmograf + API Sejmu RP`}
        />

        <div className="grid gap-12 sm:gap-16 md:gap-20 min-w-0 [&>*]:min-w-0">
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

        <footer className="mt-12 sm:mt-20 pt-6 border-t border-rule font-serif text-[13px] sm:text-[14px] text-muted-foreground leading-[1.6]">
          <p className="m-0 max-w-[760px]">
            Wszystkie wykresy odświeżane na żywo z bazy supagraf (district_klub_stats, klub_pair_agreement_mv, voting_by_club_mv, prints.topic, klub_flow_quarter, mp_minister_reply_lag).
          </p>
        </footer>
      </div>
    </main>
  );
}
