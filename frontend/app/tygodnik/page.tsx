import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getLatestSittingWithEvents,
  getSittingsIndex,
} from "@/lib/db/events";
import { BriefList } from "./_components/BriefList";
import { getWeeklyEdition } from "@/lib/db/weekly-stories";

// ISR: `unstable_cache` in `lib/db/events` bounds cold PostgREST work; 300s matches that layer.
export const revalidate = 300;

export const metadata: Metadata = {
  alternates: { canonical: "/tygodnik" },
};

export default async function TygodnikPage() {
  const [latest, sittings] = await Promise.all([
    getLatestSittingWithEvents(10),
    getSittingsIndex(10),
  ]);
  if (!latest) notFound();
  const edition = await getWeeklyEdition(latest.term, latest.sittingNum);
  return <BriefList edition={edition} sitting={latest} sittings={sittings} isIndex />;
}
