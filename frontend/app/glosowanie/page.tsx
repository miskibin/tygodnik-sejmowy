import { getAllVotings } from "@/lib/db/voting";
import { PageBreadcrumb } from "@/components/chrome/PageBreadcrumb";
import { GlosowanieDirectoryClient } from "./_components/GlosowanieDirectoryClient";

export const metadata = {
  title: "Głosowania — Tygodnik Sejmowy",
  description:
    "Wszystkie głosowania X kadencji. Wyszukaj po tytule, numerze lub numerze posiedzenia.",
};

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch {
    return fallback;
  }
}

export default async function GlosowanieIndexPage() {
  const rows = await safe(getAllVotings(), []);

  return (
    <main className="bg-background text-foreground font-serif pb-12 sm:pb-16 min-w-0">
      <div className="max-w-[1280px] mx-auto px-3 sm:px-8 md:px-14 pt-8 sm:pt-12 min-w-0">
        <PageBreadcrumb
          items={[{ label: "Głosowania" }]}
          subtitle={`${rows.length} głosowań w X kadencji — wyszukaj po tytule, numerze lub posiedzeniu.`}
        />

        <GlosowanieDirectoryClient rows={rows} />
      </div>
    </main>
  );
}
