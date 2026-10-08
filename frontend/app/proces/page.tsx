import {
  getThreadsInFlight,
  getPassedProcesses,
} from "@/lib/db/threads";
import { PageHeader } from "@/components/chrome/PageHeader";
import { classifyInFlight } from "@/lib/proces-classify";
import {
  ProcesDirectoryClient,
  type ProcesListItem,
} from "@/app/proces/_components/ProcesDirectoryClient";

export const metadata = {
  title: "Procesy legislacyjne — Tygodnik Sejmowy",
  description:
    "Procesy z aktywnością w ostatnich 90 dniach: etapy prac, głosowania i dokumenty.",
};

export default async function ProcesIndexPage() {
  const [inFlight, passed] = await Promise.all([
    getThreadsInFlight(120, 90),
    getPassedProcesses(50, 90),
  ]);

  const items: ProcesListItem[] = [
    ...inFlight.map((p) => ({ ...p, groupKey: classifyInFlight(p) })),
    ...passed.map((p) => ({ ...p, groupKey: "uchwalone" as const })),
  ];

  return (
    <main className="bg-background text-foreground pb-20">
      <div className="max-w-[1280px] mx-auto px-5 md:px-8 pt-8 md:pt-10">
        <PageHeader title="Procesy">{`${items.length} procesów z aktywnością w ostatnich 90 dniach · do 120 nieprzyjętych i 50 przyjętych.`}</PageHeader>

        <ProcesDirectoryClient items={items} />
      </div>
    </main>
  );
}
