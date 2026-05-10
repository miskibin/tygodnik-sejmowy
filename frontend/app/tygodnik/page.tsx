import { notFound } from "next/navigation";
import {
  getEventsBySitting,
  getLatestSittingWithEvents,
  getSittingsIndex,
} from "@/lib/db/events";
import { BriefList } from "./_components/BriefList";

// Heavy Supabase aggregates exceed PostgREST 8s during prerender. Render on demand.
export const dynamic = "force-dynamic";

export default async function TygodnikPage() {
  const [latest, sittings] = await Promise.all([
    getLatestSittingWithEvents(10),
    getSittingsIndex(10),
  ]);
  if (!latest) notFound();
  const events = await getEventsBySitting(latest.term, latest.sittingNum);
  return <BriefList events={events} sitting={latest} sittings={sittings} />;
}
