import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { getNetworkPageData } from "@/lib/db/network";
import { PageHeader } from "@/components/chrome/PageHeader";
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
    <main className="mx-auto max-w-[1280px] px-5 py-8 md:px-8 md:py-10">
      <PageHeader title="Powiązania posłów">Podobieństwo głosowań i wspólne działania. Powiązanie nie oznacza relacji osobistej.</PageHeader>
      {snapshot ? <NetworkExplorer data={snapshot} stale={stale} /> : (
        <section className="rounded-md border border-border bg-muted/40 p-8 sm:p-12" role="status">
          <h2 className="text-xl font-medium">{unavailable ? "Nie udało się pobrać mapy" : "Brak danych o powiązaniach"}</h2>
          <p className="mt-3 max-w-xl text-muted-foreground">{unavailable
            ? "Dane są chwilowo niedostępne. Spróbuj odświeżyć stronę za chwilę."
            : "Powiązania pojawią się po zakończeniu pierwszej analizy danych. Przy każdej relacji znajdziesz dokumenty, daty i opis sposobu obliczenia."}</p>
          <Link href="/posel" className="mt-5 inline-flex items-center gap-2 underline underline-offset-4">Przeglądaj posłów <ArrowUpRight size={16} /></Link>
        </section>
      )}
    </main>
  );
}
