import type { Metadata } from "next";
import Link from "next/link";
import { getTopViralStatements } from "@/lib/db/statements";
import { PageHeader } from "@/components/chrome/PageHeader";
import { KLUB_LABELS } from "@/lib/atlas/constants";

export const metadata: Metadata = {
  title: "Wypowiedzi — Tygodnik Sejmowy",
  alternates: { canonical: "/mowa" },
};

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("pl-PL", {
    timeZone: "Europe/Warsaw", day: "numeric", month: "long", year: "numeric",
  });
}

export default async function MowaPage() {
  const quotes = await getTopViralStatements(36);

  return (
    <main className="mx-auto min-h-screen max-w-[1280px] px-5 pb-20 pt-8 md:px-8 md:pt-10">
      <PageHeader title="Wypowiedzi">
        Fragmenty stenogramów X kadencji. Dobór automatyczny.
        Wybór nie jest pełnym ani reprezentatywnym zapisem debaty. Kluby według obecnego składu.
      </PageHeader>
      {quotes.length === 0 ? (
        <p className="py-8 text-muted-foreground">Brak cytatów w dostępnych danych.</p>
      ) : (
        <ul className="grid list-none gap-x-12 md:grid-cols-2">
          {quotes.map(quote => {
            const date = fmtDate(quote.date);
            const club = quote.clubRef ? KLUB_LABELS[quote.clubRef] ?? quote.clubRef : null;
            return (
              <li key={quote.id} className="border-b border-border py-7">
                <p className="mb-4 text-xs text-muted-foreground">
                  {[date, club].filter(Boolean).join(" · ")}
                </p>
                <blockquote className="font-serif text-xl leading-relaxed text-foreground">
                  {quote.viralQuote}
                </blockquote>
                <p className="mt-4 text-sm font-medium">
                  {quote.speakerName ?? "Mówca nieustalony"}
                </p>
                {quote.function && <p className="mt-1 text-xs text-muted-foreground">{quote.function}</p>}
                <Link href={`/mowa/${quote.id}`} className="mt-4 inline-block text-sm underline underline-offset-4">
                  Pełna wypowiedź
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
