import { supabase } from "@/lib/supabase";
import type { PrintEvent, PrintEventPayload, SittingInfo } from "@/lib/types";

const TOPIC_ALLOWED = new Set<string>([
  "sady-prawa",
  "bezpieczenstwo-obrona",
  "biznes-podatki",
  "praca-zus",
  "zdrowie",
  "edukacja-rodzina",
  "emerytury",
  "rolnictwo-wies",
  "mieszkanie-media",
  "transport",
  "srodowisko-klimat",
]);

function topicsFromDb(raw: string[] | null | undefined): string[] {
  if (!raw) return [];
  return raw.filter((t) => TOPIC_ALLOWED.has(t));
}

function mapSitting(r: Record<string, unknown>): SittingInfo {
  return {
    term: r.term as number,
    sittingNum: r.sitting_num as number,
    title: (r.sitting_title as string) ?? "",
    firstDate: (r.first_date as string) ?? "",
    lastDate: (r.last_date as string) ?? "",
    printCount: (r.print_count as number) ?? 0,
    eventCount: (r.event_count as number) ?? 0,
    topTopics: topicsFromDb(r.top_topics as string[] | null),
  };
}

export async function getSittingsIndex(term = 10): Promise<SittingInfo[]> {
  const sb = supabase();
  const { data, error } = await sb
    .from("tygodnik_sittings")
    .select(
      "term, sitting_num, sitting_title, first_date, last_date, print_count, event_count, top_topics",
    )
    .eq("term", term)
    .order("sitting_num", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapSitting);
}

export async function getLatestSittingWithEvents(term = 10): Promise<SittingInfo | null> {
  const sb = supabase();
  const { data, error } = await sb
    .from("tygodnik_sittings")
    .select(
      "term, sitting_num, sitting_title, first_date, last_date, print_count, event_count, top_topics",
    )
    .eq("term", term)
    .gt("event_count", 0)
    .order("sitting_num", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapSitting(data as Record<string, unknown>);
}

const PRINT_SECTION_LIMIT = 30;

export async function getPrintEventsBySitting(
  term: number,
  sittingNum: number,
): Promise<PrintEvent[]> {
  const sb = supabase();
  const { data, error } = await sb
    .from("weekly_events_v")
    .select("event_type, term, sitting_num, event_date, impact_score, payload, source_url")
    .eq("term", term)
    .eq("sitting_num", sittingNum)
    .eq("event_type", "print")
    .order("impact_score", { ascending: false })
    .limit(PRINT_SECTION_LIMIT);
  if (error) throw error;
  return (data ?? []).map((r): PrintEvent => ({
    term: r.term as number,
    sittingNum: r.sitting_num as number,
    eventDate: (r.event_date as string) ?? null,
    impactScore: (r.impact_score as number) ?? 0,
    sourceUrl: (r.source_url as string) ?? "",
    payload: r.payload as PrintEventPayload,
  }));
}
