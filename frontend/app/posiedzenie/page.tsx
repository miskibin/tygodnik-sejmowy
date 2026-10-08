import { getSittingsIndex } from "@/lib/db/events";
import { PageHeader } from "@/components/chrome/PageHeader";
import { PosiedzeniaDirectoryClient } from "./_components/PosiedzeniaDirectoryClient";

export const revalidate = 300;

export const metadata = {
  title: "Posiedzenia — Tygodnik Sejmowy",
  description:
    "Wszystkie posiedzenia Sejmu X kadencji. Wyszukaj po numerze posiedzenia lub tytule.",
};

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch {
    return fallback;
  }
}

export default async function PosiedzenieIndexPage() {
  const rows = await safe(getSittingsIndex(10), []);

  return (
    <main className="bg-background text-foreground pb-12 sm:pb-16 min-w-0">
      <div className="max-w-[1280px] mx-auto px-5 md:px-8 pt-8 md:pt-10 min-w-0">
        <PageHeader title="Posiedzenia">{`Ostatnie ${rows.length} posiedzeń X kadencji.`}</PageHeader>

        <PosiedzeniaDirectoryClient rows={rows} />
      </div>
    </main>
  );
}
