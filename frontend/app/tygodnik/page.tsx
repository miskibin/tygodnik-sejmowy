import { notFound } from "next/navigation";
import {
  getEventsBySitting,
  getLatestSittingWithEvents,
  getSittingsIndex,
} from "@/lib/db/events";
import { BriefList } from "./_components/BriefList";

// ISR: `unstable_cache` in `lib/db/events` bounds cold PostgREST work; 300s matches that layer.
export const revalidate = 300;

export default async function TygodnikPage() {
  const [latest, sittings] = await Promise.all([
    getLatestSittingWithEvents(10),
    getSittingsIndex(10),
  ]);
  if (!latest) notFound();
  const events = await getEventsBySitting(latest.term, latest.sittingNum);
  return <BriefList events={events} sitting={latest} sittings={sittings} />;
}
