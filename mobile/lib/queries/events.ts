import { supabase } from "@/lib/supabase";
import type {
  EventType,
  WeeklyEvent,
} from "@/lib/types";

// Per-event caps so heavy sittings don't bloat the wire (mirrors web).
const SECTION_LIMITS: Record<EventType, number> = {
  print: 30,
  vote: 12,
  eli_inforce: 12,
  late_interpellation: 12,
  viral_quote: 8,
};

type Row = {
  event_type: EventType;
  term: number;
  sitting_num: number;
  event_date: string | null;
  impact_score: number | null;
  payload: Record<string, unknown>;
  source_url: string;
};

function toEvent(r: Row): WeeklyEvent {
  const base = {
    term: r.term,
    sittingNum: r.sitting_num,
    eventDate: r.event_date,
    impactScore: r.impact_score ?? 0,
    sourceUrl: r.source_url ?? "",
  };
  // payload validated at use site; cast preserves discriminated union.
  return { ...base, eventType: r.event_type, payload: r.payload as never } as WeeklyEvent;
}

export async function getEventsBySitting(
  term: number,
  sittingNum: number,
): Promise<WeeklyEvent[]> {
  const sb = supabase();
  const { data, error } = await sb
    .from("weekly_events_v")
    .select("event_type, term, sitting_num, event_date, impact_score, payload, source_url")
    .eq("term", term)
    .eq("sitting_num", sittingNum)
    .order("impact_score", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as Row[];

  // Cap per-type so a long sitting can't crush a phone screen.
  const buckets: Record<EventType, Row[]> = {
    print: [],
    vote: [],
    eli_inforce: [],
    late_interpellation: [],
    viral_quote: [],
  };
  for (const r of rows) {
    const bucket = buckets[r.event_type];
    if (bucket && bucket.length < SECTION_LIMITS[r.event_type]) bucket.push(r);
  }
  return Object.values(buckets).flat().map(toEvent);
}

export type PartitionedEvents = {
  prints: Array<Extract<WeeklyEvent, { eventType: "print" }>>;
  votes: Array<Extract<WeeklyEvent, { eventType: "vote" }>>;
  eliInforce: Array<Extract<WeeklyEvent, { eventType: "eli_inforce" }>>;
  lateInterpellations: Array<Extract<WeeklyEvent, { eventType: "late_interpellation" }>>;
  viralQuotes: Array<Extract<WeeklyEvent, { eventType: "viral_quote" }>>;
};

export function partitionEvents(events: WeeklyEvent[]): PartitionedEvents {
  const out: PartitionedEvents = {
    prints: [],
    votes: [],
    eliInforce: [],
    lateInterpellations: [],
    viralQuotes: [],
  };
  for (const e of events) {
    if (e.eventType === "print") out.prints.push(e);
    else if (e.eventType === "vote") out.votes.push(e);
    else if (e.eventType === "eli_inforce") out.eliInforce.push(e);
    else if (e.eventType === "late_interpellation") out.lateInterpellations.push(e);
    else if (e.eventType === "viral_quote") out.viralQuotes.push(e);
  }
  return out;
}
