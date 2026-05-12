import { getAllActiveMps } from "@/lib/db/mps";
import { getAllMpCardStats } from "@/lib/db/mp-card-stats";
import { PoselDirectoryClient } from "./_components/PoselDirectoryClient";
import { PageBreadcrumb } from "@/components/chrome/PageBreadcrumb";

export const metadata = {
  title: "Posłowie — Tygodnik Sejmowy",
  description:
    "Wszyscy posłowie X kadencji. Filtruj po klubie, okręgu, sortuj po aktywności. Każde dossier zawiera głosowania, interpelacje, wystąpienia.",
};

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch {
    return fallback;
  }
}

export default async function PoselIndexPage() {
  const [mps, statsMap] = await Promise.all([
    safe(getAllActiveMps(), []),
    safe(getAllMpCardStats(), new Map()),
  ]);

  // Merge stats into the directory rows; never drop an MP if stats are missing.
  const rows = mps.map((m) => {
    const s = statsMap.get(m.mpId);
    return {
      ...m,
      attendancePct: s?.attendancePct ?? null,
      loyaltyPct: s?.loyaltyPct ?? null,
      questionCount: s?.questionCount ?? 0,
      statementCount: s?.statementCount ?? 0,
    };
  });

  return (
    <main className="bg-background text-foreground font-serif pb-12 sm:pb-16 min-w-0">
      <div className="max-w-[1280px] mx-auto px-3 sm:px-8 md:px-14 pt-8 sm:pt-12 min-w-0">
        <PageBreadcrumb
          items={[{ label: "Posłowie" }]}
          subtitle="Imię, nazwisko, klub lub okręg — wyszukiwanie działa w jednym polu."
        />

        <PoselDirectoryClient mps={rows} />
      </div>
    </main>
  );
}
