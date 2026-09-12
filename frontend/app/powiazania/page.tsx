import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Network } from "lucide-react";
import { getNetworkPageData } from "@/lib/db/network";
import { NetworkExplorer } from "./NetworkExplorer";

export const metadata: Metadata = {
  title: "Powiązania — Tygodnik Sejmowy",
  description: "Odkrywaj wspólne działania posłów i podobieństwa głosowań. Każde powiązanie prowadzi do źródeł.",
  alternates: { canonical: "/powiazania" },
};
export const dynamic = "force-dynamic";

export default async function NetworkPage() {
  const { snapshot, unavailable, stale } = await getNetworkPageData();
  return (
    <main className="mx-auto max-w-[1440px] px-4 py-5 sm:px-8 sm:py-12">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 sm:mb-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Network size={16} aria-hidden="true" /> Atlas / Powiązania
          <span className="rounded-full bg-highlight px-2.5 py-1 text-xs text-foreground">Eksperyment</span>
        </div>
        <Link href="/atlas" className="inline-flex min-h-11 items-center gap-1 text-sm hover:underline"><span className="sm:hidden">Atlas</span><span className="hidden sm:inline">Wróć do Atlasu</span><ArrowUpRight size={14} /></Link>
      </div>
      <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">Powiązania posłów</h1>
      <p className="mt-3 mb-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:mt-4 sm:mb-8 sm:text-lg">
        Wybierz osobę i sprawdź podobieństwo głosowań oraz działania stojące za każdą relacją.
      </p>
      {snapshot ? <NetworkExplorer data={snapshot} stale={stale} /> : (
        <section className="rounded-2xl border border-border bg-muted/40 p-8 sm:p-12" role="status">
          <h2 className="text-xl font-medium">{unavailable ? "Nie udało się pobrać mapy" : "Pierwsza mapa jest jeszcze przed nami"}</h2>
          <p className="mt-3 max-w-xl text-muted-foreground">{unavailable
            ? "Dane są chwilowo niedostępne. Spróbuj odświeżyć stronę za chwilę."
            : "Powiązania pojawią się po zakończeniu pierwszej analizy danych. Przy każdej relacji znajdziesz dokumenty, daty i opis sposobu obliczenia."}</p>
          <Link href="/posel" className="mt-5 inline-flex items-center gap-2 underline underline-offset-4">Przeglądaj posłów <ArrowUpRight size={16} /></Link>
        </section>
      )}
    </main>
  );
}
