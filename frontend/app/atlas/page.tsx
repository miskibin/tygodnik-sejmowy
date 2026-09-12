import type { Metadata } from "next";
import Link from "next/link";

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
    <main className="bg-background text-foreground px-3 sm:px-8 md:px-14 pt-8 sm:pt-12 pb-20 sm:pb-28 min-w-0 w-full">
      <div className="max-w-[1280px] mx-auto min-w-0 w-full">
        <PageBreadcrumb
          items={[{ label: "Atlas" }]}
          subtitle={`Aktualizacja: ${formatDataUpdate(lastUpdate)} · n = ${heatmap.totalVotings.toLocaleString("pl-PL")} głosowań · Źródło: Sejm RP`}
        />

        <Link href="/powiazania" className="mb-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 p-5 hover:bg-muted">
          <span><span className="text-xs uppercase tracking-wider text-muted-foreground">Eksperyment</span><span className="mt-1 block text-xl font-medium">Powiązania posłów</span></span>
          <span className="text-sm">Zobacz powiązania posłów →</span>
        </Link>
        <div className="grid gap-12 sm:gap-16 md:gap-20 min-w-0 [&>*]:min-w-0">
          <MapaOkregow data={mapData} />
          <HeatmapaKoalicji data={heatmap} />
          <SankeyKluby data={sankey} />
          <NajwolniejsiMinistrowie data={ministers} />
          <DyscyplinaPartyjna data={discipline} />
          <OCzymMowiSejm data={topics} />
        </div>

        <footer className="mt-12 sm:mt-20 pt-6 border-t border-rule text-[13px] sm:text-[14px] text-muted-foreground leading-[1.6]">
          <p className="m-0 max-w-[760px]">
             Wykresy są odświeżane automatycznie na podstawie danych Sejmu RP.
          </p>
        </footer>
      </div>
    </main>
  );
}
