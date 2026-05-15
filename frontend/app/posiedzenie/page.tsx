import { getSittingsIndex } from "@/lib/db/events";
import { PageBreadcrumb } from "@/components/chrome/PageBreadcrumb";
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
    <main className="bg-background text-foreground font-serif pb-12 sm:pb-16 min-w-0">
      <div className="max-w-[1280px] mx-auto px-3 sm:px-8 md:px-14 pt-8 sm:pt-12 min-w-0">
        <PageBreadcrumb
          items={[{ label: "Posiedzenia" }]}
          subtitle={`${rows.length} posiedzeń w X kadencji — wyszukaj po numerze lub tytule.`}
        />

        <PosiedzeniaDirectoryClient rows={rows} />
      </div>
    </main>
  );
}
