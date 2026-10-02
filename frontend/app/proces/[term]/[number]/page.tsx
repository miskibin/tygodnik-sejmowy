import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPrint } from "@/lib/db/prints";
import { getProcessCitations } from "@/lib/db/statements";
import { Citations } from "./_components/Citations";
import { ProcessContent } from "./_components/ProcessContent";

// Dynamic rendering: getProcessCitations samples a random subset of
// viral quotes (Fisher-Yates) per request, and the "rotate on reload"
// experience depends on no cached HTML. Without this, ISR/static could
// freeze the sample. Build manifest confirmed this route stays "ƒ"
// (dynamic).
export const revalidate = 0;

export async function generateMetadata({
  params,
}: { params: Promise<{ term: string; number: string }> }): Promise<Metadata> {
  const { term: tRaw, number } = await params;
  const term = Number(tRaw);
  if (!Number.isSafeInteger(term) || term <= 0) return {};
  const data = await getPrint(term, number);
  if (!data) return {};
  const p = data.print;
  const baseTitle = p.shortTitle?.trim() || p.title?.trim() || `Druk ${term}/${number}`;
  // Drop Polish "ustawa o" boilerplate from title where possible — keeps
  // <title> scannable in SERPs (~60-char window).
  const title = `Druk ${term}/${number} — ${baseTitle}`.slice(0, 110);
  const desc =
    p.impactPunch?.trim() ||
    p.summaryPlain?.trim()?.slice(0, 240) ||
    `Pełny przebieg projektu ustawy ${term}/${number}: etapy procesu, głosowania, opinie, dopasowane obietnice wyborcze.`;
  const path = `/proces/${term}/${number}`;
  return {
    title,
    description: desc,
    alternates: { canonical: path },
    openGraph: {
      title,
      description: desc,
      url: path,
      type: "article",
      publishedTime: p.documentDate ?? undefined,
      modifiedTime: p.changeDate ?? undefined,
    },
    twitter: { card: "summary_large_image", title, description: desc },
  };
}

export default async function DrukPage({
  params,
}: {
  params: Promise<{ term: string; number: string }>;
}) {
  const { term: rawTerm, number } = await params;
  const term = Number(rawTerm);
  if (!Number.isFinite(term)) notFound();

  const data = await getPrint(term, number);
  if (!data) notFound();
  return <ProcessContent data={data} citations={
    <Suspense fallback={<p role="status" className="py-6 text-sm text-muted-foreground">Wczytywanie wypowiedzi…</p>}>
      <ProcessCitations term={term} number={number} />
    </Suspense>
  } />;
}

async function ProcessCitations({ term, number }: { term: number; number: string }) {
  let items: Awaited<ReturnType<typeof getProcessCitations>>;
  try {
    items = await getProcessCitations(term, number);
  } catch (err) {
    console.error("Process citations unavailable", { term, number, err });
    return null;
  }
  return items.length > 0 ? <Citations items={items} /> : <p className="text-sm text-muted-foreground">Brak wypowiedzi przypisanych do tego dokumentu w dostępnych danych.</p>;
}
