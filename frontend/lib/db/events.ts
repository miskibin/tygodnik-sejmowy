import "server-only";

import { unstable_cache } from "next/cache";
import { supabase } from "@/lib/supabase";
import { normalizeActSourceUrl } from "@/lib/isap";
import {
  topicsFromDb,
  SECTION_LIMITS,
  type EventType,
  type SittingInfo,
  type WeeklyEvent,
} from "@/lib/events-types";

// Re-export for callers that hit this module — keeps import paths stable
// while pure types live in lib/events-types.ts (so client components can
// pull types without dragging in the server-only data layer).
export type { SittingInfo, WeeklyEvent, EventType };

// Batches PostgREST work; keeps prerender + ISR under budget and cuts warm latency.
const EVENTS_REVALIDATE_SEC = 300;

async function loadSittingsIndex(term: number): Promise<SittingInfo[]> {
  const sb = supabase();
  const { data, error } = await sb
    .from("tygodnik_sittings")
    .select("term, sitting_num, sitting_title, first_date, last_date, print_count, event_count, top_topics")
    .eq("term", term)
    .order("sitting_num", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r): SittingInfo => ({
    term: r.term as number,
    sittingNum: r.sitting_num as number,
    title: (r.sitting_title as string) ?? "",
    firstDate: (r.first_date as string) ?? "",
    lastDate: (r.last_date as string) ?? "",
    printCount: (r.print_count as number) ?? 0,
    eventCount: (r.event_count as number) ?? 0,
    topTopics: topicsFromDb(r.top_topics as string[] | null),
  }));
}

export function getSittingsIndex(term = 10): Promise<SittingInfo[]> {
  return unstable_cache(
    async () => loadSittingsIndex(term),
    ["tygodnik-sittings-index", String(term)],
    { revalidate: EVENTS_REVALIDATE_SEC },
  )();
}

async function loadLatestSittingWithEvents(term: number): Promise<SittingInfo | null> {
  const sb = supabase();
  const { data, error } = await sb
    .from("tygodnik_sittings")
    .select("term, sitting_num, sitting_title, first_date, last_date, print_count, event_count, top_topics")
    .eq("term", term)
    .gt("event_count", 0)
    .order("sitting_num", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    term: data.term as number,
    sittingNum: data.sitting_num as number,
    title: (data.sitting_title as string) ?? "",
    firstDate: (data.first_date as string) ?? "",
    lastDate: (data.last_date as string) ?? "",
    printCount: (data.print_count as number) ?? 0,
    eventCount: (data.event_count as number) ?? 0,
    topTopics: topicsFromDb(data.top_topics as string[] | null),
  };
}

export function getLatestSittingWithEvents(term = 10): Promise<SittingInfo | null> {
  return unstable_cache(
    async () => loadLatestSittingWithEvents(term),
    ["tygodnik-latest-sitting", String(term)],
    { revalidate: EVENTS_REVALIDATE_SEC },
  )();
}

type RawEventRow = {
  event_type: EventType;
  term: number;
  sitting_num: number;
  event_date: string | null;
  impact_score: number | null;
  payload: Record<string, unknown>;
  source_url: string;
};

async function loadEventsBySitting(term: number, sittingNum: number): Promise<WeeklyEvent[]> {
  const sb = supabase();
  const { data, error } = await sb
    .from("weekly_events_v")
    .select("event_type, term, sitting_num, event_date, impact_score, payload, source_url")
    .eq("term", term)
    .eq("sitting_num", sittingNum)
    .order("impact_score", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as RawEventRow[];
  const buckets: Record<EventType, RawEventRow[]> = {
    print: [],
    vote: [],
    eli_inforce: [],
    late_interpellation: [],
    viral_quote: [],
  };
  for (const r of rows) buckets[r.event_type]?.push(r);

  const out: WeeklyEvent[] = [];
  for (const t of Object.keys(buckets) as EventType[]) {
    const cap = SECTION_LIMITS[t];
    for (const r of buckets[t].slice(0, cap)) {
      out.push({
        eventType: r.event_type,
        term: r.term,
        sittingNum: r.sitting_num,
        eventDate: r.event_date,
        impactScore: r.impact_score ?? 0,
        sourceUrl: r.event_type === "eli_inforce"
          ? (normalizeActSourceUrl(
              r.source_url,
              (r.payload as { eli_id?: string | null })?.eli_id,
            ) ?? r.source_url)
          : r.source_url,
        payload: r.payload as never,
      } as WeeklyEvent);
    }
  }

  // Enrich print events with stance + sponsor_authority (not in view payload)
  // and current process stage (latest process_stages row by ord). Used by the
  // tygodnik feed for StanceSponsorChip + ProcessStageBar atoms.
  const printEvents = out.filter(
    (e): e is Extract<WeeklyEvent, { eventType: "print" }> => e.eventType === "print",
  );
  if (printEvents.length > 0) {
    const printIds = printEvents.map((e) => e.payload.print_id);
    const printNumbers = printEvents.map((e) => e.payload.number);
    const [{ data: pRows }, { data: procRows }] = await Promise.all([
      sb
        .from("prints")
        .select("id, stance, stance_confidence, sponsor_authority")
        .in("id", printIds),
      sb
        .from("processes")
        .select("term, number, passed, id")
        .eq("term", term)
        .in("number", printNumbers),
    ]);
    type PRow = { id: number; stance: string | null; stance_confidence: number | null; sponsor_authority: string | null };
    type ProcRow = { term: number; number: string; passed: boolean | null; id: number };
    const pMap = new Map<number, PRow>();
    for (const r of (pRows ?? []) as PRow[]) pMap.set(r.id, r);
    const procByNum = new Map<string, ProcRow>();
    for (const r of (procRows ?? []) as ProcRow[]) procByNum.set(r.number, r);

    // Latest process_stages.stage_type per process — single round-trip.
    const procIds = [...procByNum.values()].map((p) => p.id);
    const stageByProc = new Map<number, string>();
    if (procIds.length > 0) {
      const { data: stageRows } = await sb
        .from("process_stages")
        .select("process_id, ord, stage_type")
        .in("process_id", procIds)
        .order("ord", { ascending: false });
      type StageRow = { process_id: number; ord: number; stage_type: string };
      for (const r of (stageRows ?? []) as StageRow[]) {
        if (!stageByProc.has(r.process_id)) stageByProc.set(r.process_id, r.stage_type);
      }
    }

    for (const ev of printEvents) {
      const p = pMap.get(ev.payload.print_id);
      ev.payload.stance = p?.stance ?? null;
      ev.payload.stance_confidence = p?.stance_confidence ?? null;
      ev.payload.sponsor_authority = p?.sponsor_authority ?? null;
      const proc = procByNum.get(ev.payload.number);
      ev.payload.process_passed = proc?.passed ?? null;
      ev.payload.current_stage_type = proc ? stageByProc.get(proc.id) ?? null : null;
    }
  }

  // Enrich vote events with per-MP seat votes for the hemicycle chart.
  // Batch-fetch all relevant voting_ids in one round-trip.
  const voteEvents = out.filter(
    (e): e is Extract<WeeklyEvent, { eventType: "vote" }> => e.eventType === "vote",
  );
  const voteIds = voteEvents.map((e) => e.payload.voting_id);
  if (voteIds.length > 0) {
    const [{ data: seatRows }, { data: voteMetaRows }] = await Promise.all([
      sb
        .from("votes")
        .select("voting_id, mp_id, club_ref, vote")
        .in("voting_id", voteIds),
      sb
        .from("votings")
        .select("id, majority_votes, motion_polarity")
        .in("id", voteIds),
    ]);
    type SeatRow = { voting_id: number; mp_id: number; club_ref: string | null; vote: string };
    type VoteMetaRow = {
      id: number;
      majority_votes: number | null;
      motion_polarity:
        | "pass"
        | "reject"
        | "amendment"
        | "minority"
        | "procedural"
        | "other"
        | null;
    };
    const byVoting = new Map<number, Array<{ mp_id: number; club_ref: string | null; vote: string }>>();
    for (const r of (seatRows ?? []) as SeatRow[]) {
      const list = byVoting.get(r.voting_id) ?? [];
      list.push({ mp_id: r.mp_id, club_ref: r.club_ref, vote: r.vote });
      byVoting.set(r.voting_id, list);
    }
    const metaByVoting = new Map<number, VoteMetaRow>();
    for (const r of (voteMetaRows ?? []) as VoteMetaRow[]) {
      metaByVoting.set(r.id, r);
    }
    for (const ev of voteEvents) {
      ev.payload.seats = byVoting.get(ev.payload.voting_id) ?? [];
      const meta = metaByVoting.get(ev.payload.voting_id);
      ev.payload.majority_votes = meta?.majority_votes ?? null;
      ev.payload.motion_polarity = meta?.motion_polarity ?? null;
    }
  }

  // Enrich each vote's linked_prints[] with impact_punch so the voting card
  // can show the same "DOTYCZY CIĘ, JEŚLI" callout citizens already get on
  // print cards. Single batched fetch across all linked print_ids.
  const linkedPrintIds = new Set<number>();
  for (const ev of voteEvents) {
    for (const lp of ev.payload.linked_prints ?? []) {
      if (lp.print_id) linkedPrintIds.add(lp.print_id);
    }
  }
  if (linkedPrintIds.size > 0) {
    const { data: punchRows } = await sb
      .from("prints")
      .select("id, impact_punch")
      .in("id", [...linkedPrintIds]);
    type PunchRow = { id: number; impact_punch: string | null };
    const punchById = new Map<number, string | null>();
    for (const r of (punchRows ?? []) as PunchRow[]) {
      punchById.set(r.id, r.impact_punch);
    }
    for (const ev of voteEvents) {
      for (const lp of ev.payload.linked_prints ?? []) {
        lp.impact_punch = punchById.get(lp.print_id) ?? null;
      }
    }
  }

  // Enrich MP-bearing events (late_interpellation authors + viral_quote
  // speaker) with photo_url + current klub + district. Single round-trip:
  // collect all mp_ids, fetch mps + current membership, then inject.
  const mpIds = new Set<number>();
  for (const ev of out) {
    if (ev.eventType === "late_interpellation") {
      for (const a of ev.payload.authors ?? []) {
        if (a.mp_id) mpIds.add(a.mp_id);
      }
    } else if (ev.eventType === "viral_quote" && ev.payload.mp_id) {
      mpIds.add(ev.payload.mp_id);
    }
  }
  if (mpIds.size > 0) {
    const ids = [...mpIds];
    const [mpsRes, memRes] = await Promise.all([
      sb
        .from("mps")
        .select("mp_id, photo_url, district_num")
        .eq("term", term)
        .in("mp_id", ids),
      sb
        .from("mp_club_membership")
        .select("mp_id, club_id")
        .eq("term", term)
        .in("mp_id", ids),
    ]);
    type MpRow = { mp_id: number; photo_url: string | null; district_num: number | null };
    type MemRow = { mp_id: number; club_id: string };
    const mpMap = new Map<number, MpRow>();
    for (const r of (mpsRes.data ?? []) as MpRow[]) mpMap.set(r.mp_id, r);
    const klubMap = new Map<number, string>();
    for (const r of (memRes.data ?? []) as MemRow[]) klubMap.set(r.mp_id, r.club_id);

    for (const ev of out) {
      if (ev.eventType === "late_interpellation") {
        for (const a of ev.payload.authors ?? []) {
          const mp = a.mp_id ? mpMap.get(a.mp_id) : null;
          a.photo_url = mp?.photo_url ?? null;
          a.district = mp?.district_num ?? null;
          a.klub = a.mp_id ? klubMap.get(a.mp_id) ?? null : null;
        }
      } else if (ev.eventType === "viral_quote") {
        const mp = ev.payload.mp_id ? mpMap.get(ev.payload.mp_id) : null;
        ev.payload.photo_url = mp?.photo_url ?? null;
        ev.payload.district = mp?.district_num ?? null;
        ev.payload.klub = ev.payload.mp_id ? klubMap.get(ev.payload.mp_id) ?? null : null;
      }
    }
  }

  return out;
}

export function getEventsBySitting(
  term: number,
  sittingNum: number,
): Promise<WeeklyEvent[]> {
  return unstable_cache(
    async () => loadEventsBySitting(term, sittingNum),
    ["tygodnik-events-by-sitting", String(term), String(sittingNum)],
    { revalidate: EVENTS_REVALIDATE_SEC },
  )();
}
