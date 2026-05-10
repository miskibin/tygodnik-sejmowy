import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEventsBySitting, getSittingsIndex } from "@/lib/db/events";
import { BriefList } from "../../_components/BriefList";


function fmtDateRange(first: string, last: string): string {
  if (!first) return "";
  try {
    const a = new Date(first).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });
    if (!last || last === first) return a;
    const b = new Date(last).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });
    return `${a} – ${b}`;
  } catch {
    return first;
  }
}

export async function generateMetadata({
  params,
}: { params: Promise<{ sitting: string }> }): Promise<Metadata> {
  const { sitting: raw } = await params;
  const sittingNum = Number(raw);
  if (!Number.isFinite(sittingNum) || sittingNum < 1) return {};
  const sittings = await getSittingsIndex(10);
  const s = sittings.find((x) => x.sittingNum === sittingNum);
  if (!s) return {};
  const dates = fmtDateRange(s.firstDate, s.lastDate);
  const title = `Tygodnik #${s.sittingNum} — ${dates || "posiedzenie Sejmu"}`;
  const desc = `Co Sejm zmienił w Twoim życiu w ${s.sittingNum}. posiedzeniu — ${s.eventCount} wydarzeń w prostym polskim, dopasowanych do okręgu i sytuacji życiowej.`;
  const path = `/tygodnik/p/${sittingNum}`;
  return {
    title,
    description: desc,
    alternates: { canonical: path },
    openGraph: {
      title,
      description: desc,
      url: path,
      type: "article",
    },
    twitter: { card: "summary_large_image", title, description: desc },
  };
}

export default async function TygodnikSittingPage({
  params,
}: {
  params: Promise<{ sitting: string }>;
}) {
  const { sitting: raw } = await params;
  const sittingNum = Number(raw);
  if (!Number.isFinite(sittingNum) || sittingNum < 1) notFound();

  const sittings = await getSittingsIndex(10);
  const sitting = sittings.find((s) => s.sittingNum === sittingNum);
  if (!sitting) notFound();

  const events = await getEventsBySitting(sitting.term, sitting.sittingNum);
  return <BriefList events={events} sitting={sitting} sittings={sittings} />;
}
