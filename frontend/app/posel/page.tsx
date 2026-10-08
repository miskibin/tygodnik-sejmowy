import { getAllActiveMps } from "@/lib/db/mps";
import { getAllMpCardStats } from "@/lib/db/mp-card-stats";
import { PoselDirectoryClient } from "./_components/PoselDirectoryClient";
import { PageHeader } from "@/components/chrome/PageHeader";

export const metadata = {
  title: "Posłowie — Tygodnik Sejmowy",
  description:
    "Wszyscy posłowie X kadencji. Filtruj po klubie, okręgu, sortuj po aktywności. Każde dossier zawiera głosowania, interpelacje, wystąpienia.",
};

export default async function PoselIndexPage() {
  const [mps, statsMap] = await Promise.all([
    getAllActiveMps(),
    getAllMpCardStats(),
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
    <main className="bg-background text-foreground pb-12 sm:pb-16 min-w-0">
      <div className="max-w-[1280px] mx-auto px-5 md:px-8 pt-8 md:pt-10 min-w-0">
        <PageHeader title="Posłowie" />

        <PoselDirectoryClient mps={rows} />
      </div>
    </main>
  );
}
