// Pure types + client-safe helpers shared between server data layer
// (lib/db/events.ts) and client components (e.g. BriefList).
//
// No "server-only" import — this file may run in the client bundle.

import type { TopicId } from "@/lib/topics";
import type { PersonaId } from "@/lib/personas";
import type { BriefItem } from "@/lib/db/prints";
import type { MotionPolarity } from "@/lib/promiseAlignment";
import { dbTagsToPersonas } from "@/lib/personas";
import { dbTagsToTopics } from "@/lib/topics";

// Event type discriminator. Mirrors event_type values in
// weekly_events_v (supabase/migrations/0062_weekly_event_views.sql).
export type EventType =
  | "print"
  | "vote"
  | "eli_inforce"
  | "late_interpellation"
  | "viral_quote";

type AffectedGroupRaw = {
  tag: string;
  severity: "low" | "medium" | "high";
  est_population: number | null;
};

export type PrintEventPayload = {
  print_id: number;
  number: string;
  short_title: string | null;
  title: string;
  impact_punch: string | null;
  summary_plain: string | null;
  citizen_action: string | null;
  affected_groups: AffectedGroupRaw[] | null;
  persona_tags: string[] | null;
  topic_tags: string[] | null;
  change_date: string | null;
  document_category: string | null;
  // Enriched in lib/db/events.ts after fetch — view payload doesn't carry these.
  stance?: string | null;
  stance_confidence?: number | null;
  sponsor_authority?: string | null;
  // Latest process_stages.stage_type for the print's process. Drives the
  // 6-step ProcessStageBar atom in tygodnik feed.
  current_stage_type?: string | null;
  process_passed?: boolean | null;
};

export type LinkedPrint = {
  print_id: number;
  number: string;
  short_title: string | null;
  role: string;
  // Enriched in lib/db/events.ts after fetch — gives the voting card its
  // "DOTYCZY CIĘ, JEŚLI" callout (same one print cards show), so a citizen
  // skimming the feed instantly knows what the vote was actually about.
  impact_punch?: string | null;
};

export type ClubTallyRaw = {
  club_short: string;
  club_name: string;
  yes: number;
  no: number;
  abstain: number;
  not_voting: number;
  total: number;
};

export type VoteSeatRaw = {
  mp_id: number;
  club_ref: string | null;
  vote: string;
};

export type VoteEventPayload = {
  voting_id: number;
  voting_number: number;
  sitting: number;
  sitting_day: number;
  date: string;
  title: string;
  topic: string;
  yes: number;
  no: number;
  abstain: number;
  not_participating: number;
  total_voted: number;
  // Enriched in lib/db/events.ts after fetch from votings.
  majority_votes?: number | null;
  motion_polarity?: MotionPolarity | null;
  linked_prints: LinkedPrint[];
  club_tally: ClubTallyRaw[];
  // Enriched in lib/db/events.ts after fetch — per-MP votes for hemicycle.
  seats?: VoteSeatRaw[];
};

// Mirrors compute_act_kind() in supabase/migrations/0077_acts_act_kind.sql.
// Used to split "Wchodzi w życie" into new-law vs republication sub-sections.
export type ActKind =
  | "ustawa_nowa"
  | "nowelizacja"
  | "tekst_jednolity"
  | "obwieszczenie"
  | "rozporzadzenie"
  | "uchwala_sejmu"
  | "inne";

export type EliInforceEventPayload = {
  act_id: number;
  eli_id: string;
  publisher: string;
  year: number;
  position: number;
  type: string;
  act_kind: ActKind | null;
  title: string;
  short_title: string | null;
  in_force: string | null;
  legal_status_date: string | null;
  announcement_date: string | null;
  promulgation_date: string | null;
  display_address: string | null;
  keywords: string[] | null;
};

// Citizen-facing categories: which act_kinds count as "new law" vs
// "republications/updates". Filter in BriefList for citizen review #13.
export const ACT_KIND_NEW_LAW: ReadonlySet<ActKind> = new Set([
  "ustawa_nowa",
  "nowelizacja",
]);
export const ACT_KIND_REPUBLICATION: ReadonlySet<ActKind> = new Set([
  "tekst_jednolity",
  "obwieszczenie",
  "rozporzadzenie",
  "uchwala_sejmu",
  "inne",
]);

export type LateInterpellationAuthor = {
  mp_id: number;
  first_last_name: string | null;
  // Enriched in lib/db/events.ts after fetch — Supabase view doesn't carry these.
  photo_url?: string | null;
  klub?: string | null;
  district?: number | null;
};

export type LateInterpellationEventPayload = {
  question_id: number;
  kind: "interpellation" | "written";
  num: number;
  title: string;
  sent_date: string;
  answer_delayed_days: number;
  recipient_titles: string[];
  authors: LateInterpellationAuthor[];
};

export type ViralQuoteEventPayload = {
  statement_id: number;
  speaker_name: string;
  function: string | null;
  mp_id: number | null;
  date: string;
  start_datetime: string | null;
  viral_quote: string | null;
  viral_reason: string | null;
  tone: string | null;
  topic_tags: string[] | null;
  mentioned_entities: {
    mps?: string[];
    parties?: string[];
    ministers?: string[];
    prints?: string[];
  } | null;
  key_claims: string[] | null;
  addressee: string | null;
  summary_one_line: string | null;
  /** Order of this speech in the day's transcript (`proceeding_statements.num`). */
  statement_num?: number | null;
  /** Official Sejm proceedings title for the sitting (`proceedings.title`). */
  proceeding_title?: string | null;
  /** Agenda point being debated when the statement was spoken — resolved
   * server-side via `viral_quote_events_v` lateral join to the next "Pkt. N ..."
   * voting after `start_datetime`. NULL when no matching voting (debate-only
   * agenda item or statement after the last vote of the day). */
  agenda_point_title?: string | null;
  // Enriched in lib/db/events.ts after fetch.
  photo_url?: string | null;
  klub?: string | null;
  district?: number | null;
};

type EventCommon = {
  term: number;
  sittingNum: number;
  eventDate: string | null;
  impactScore: number;
  sourceUrl: string;
};

export type WeeklyEvent =
  | (EventCommon & { eventType: "print"; payload: PrintEventPayload })
  | (EventCommon & { eventType: "vote"; payload: VoteEventPayload })
  | (EventCommon & { eventType: "eli_inforce"; payload: EliInforceEventPayload })
  | (EventCommon & { eventType: "late_interpellation"; payload: LateInterpellationEventPayload })
  | (EventCommon & { eventType: "viral_quote"; payload: ViralQuoteEventPayload });

// Per-event-type caps. Section sizes target a Tygodnik scan in <60 seconds.
export const SECTION_LIMITS: Record<EventType, number> = {
  print: 30,
  vote: 5,
  eli_inforce: 8,
  late_interpellation: 10,
  viral_quote: 5,
};

export type SittingInfo = {
  term: number;
  sittingNum: number;
  title: string;
  firstDate: string;
  lastDate: string;
  printCount: number;
  eventCount: number;
  topTopics: TopicId[];
};

export type NextSittingInfo = {
  term: number;
  sittingNum: number;
  firstDate: string; // YYYY-MM-DD (Europe/Warsaw)
  lastDate: string;
  isActive: boolean;
};

const TOPIC_ALLOWED = new Set<string>([
  "sady-prawa", "bezpieczenstwo-obrona", "biznes-podatki",
  "praca-zus", "zdrowie", "edukacja-rodzina", "emerytury",
  "rolnictwo-wies", "mieszkanie-media", "transport", "srodowisko-klimat",
]);

export function topicsFromDb(raw: string[] | null | undefined): TopicId[] {
  if (!raw) return [];
  return raw.filter((t) => TOPIC_ALLOWED.has(t)) as TopicId[];
}

export function partitionEvents(events: WeeklyEvent[]): {
  prints: Array<Extract<WeeklyEvent, { eventType: "print" }>>;
  votes: Array<Extract<WeeklyEvent, { eventType: "vote" }>>;
  eliInforce: Array<Extract<WeeklyEvent, { eventType: "eli_inforce" }>>;
  lateInterpellations: Array<Extract<WeeklyEvent, { eventType: "late_interpellation" }>>;
  viralQuotes: Array<Extract<WeeklyEvent, { eventType: "viral_quote" }>>;
} {
  return {
    prints: events.filter((e): e is Extract<WeeklyEvent, { eventType: "print" }> => e.eventType === "print"),
    votes: events.filter((e): e is Extract<WeeklyEvent, { eventType: "vote" }> => e.eventType === "vote"),
    eliInforce: events.filter((e): e is Extract<WeeklyEvent, { eventType: "eli_inforce" }> => e.eventType === "eli_inforce"),
    lateInterpellations: events.filter((e): e is Extract<WeeklyEvent, { eventType: "late_interpellation" }> => e.eventType === "late_interpellation"),
    viralQuotes: events.filter((e): e is Extract<WeeklyEvent, { eventType: "viral_quote" }> => e.eventType === "viral_quote"),
  };
}

export function printEventToBriefItem(
  ev: Extract<WeeklyEvent, { eventType: "print" }>,
): BriefItem {
  const p = ev.payload;
  return {
    id: p.print_id,
    term: ev.term,
    number: p.number,
    shortTitle: p.short_title ?? "",
    title: p.title ?? "",
    changeDate: p.change_date ?? null,
    impactPunch: p.impact_punch ?? "",
    summaryPlain: p.summary_plain ?? null,
    citizenAction: p.citizen_action ?? null,
    affectedGroups: (p.affected_groups ?? []).map((g) => ({
      tag: g.tag,
      severity: g.severity,
      estPopulation: g.est_population ?? null,
      sourceYear: null,
      sourceNote: null,
    })),
    personas: dbTagsToPersonas(p.persona_tags ?? null) as PersonaId[],
    topics: dbTagsToTopics(p.topic_tags ?? null),
    documentCategory: (p.document_category ?? null) as BriefItem["documentCategory"],
    isProcedural: false,
    isMetaDocument: false,
    homepageScore: ev.impactScore,
    stance: p.stance ?? null,
    stanceConfidence: p.stance_confidence ?? null,
    sponsorAuthority: (p.sponsor_authority ?? null) as BriefItem["sponsorAuthority"],
    currentStageType: p.current_stage_type ?? null,
    processPassed: p.process_passed ?? null,
    voting: null,
  };
}
