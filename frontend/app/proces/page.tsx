import {
  getThreadsInFlight,
  getPassedProcesses,
  type ProcessSummary,
} from "@/lib/db/threads";
import { PageBreadcrumb } from "@/components/chrome/PageBreadcrumb";
import { classifyInFlight } from "@/lib/proces-classify";
import {
  ProcesDirectoryClient,
  type ProcesListItem,
} from "@/app/proces/_components/ProcesDirectoryClient";

export const metadata = {
  title: "Procesy legislacyjne — Tygodnik Sejmowy",
  description:
    "Wszystkie projekty ustaw w 10. kadencji Sejmu — z filtrami po fazie procesu, wyszukiwarką i sortowaniem.",
};

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (err) {
    console.error("[/proces] data fetch failed", err);
    return fallback;
  }
}

export default async function ProcesIndexPage() {
  const [inFlight, passed] = await Promise.all([
    safe(getThreadsInFlight(120, 90), [] as ProcessSummary[]),
    safe(getPassedProcesses(50, 90), [] as ProcessSummary[]),
  ]);

  const items: ProcesListItem[] = [
    ...inFlight.map((p) => ({ ...p, groupKey: classifyInFlight(p) })),
    ...passed.map((p) => ({ ...p, groupKey: "uchwalone" as const })),
  ];

  return (
    <main className="bg-background text-foreground font-serif pb-20">
      <div className="max-w-[1100px] mx-auto px-4 md:px-8 lg:px-14 pt-8 md:pt-10">
        <PageBreadcrumb
          items={[{ label: "Procesy" }]}
          subtitle="Projekty ustaw w 10. kadencji — wyszukaj po druku lub tytule, filtruj po fazie. Aktywność w ostatnich 90 dniach."
        />

        <ProcesDirectoryClient items={items} />
      </div>
    </main>
  );
}
