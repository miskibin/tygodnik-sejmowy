// Shape consumed by the sitting-view section components. Mirrors the join
// of proceedings + proceeding_days + agenda_items + agenda_item_processes +
// agenda_item_prints + proceeding_statements (with enrichment from
// migration 0061) + votings (with the "Pkt. N ..." title heuristic from
// migration 0092). The hardcoded MOCK in mockup/data.ts feeds the same
// shape so the route at /posiedzenie/mockup keeps working as a design
// control.

import type { TopicId } from "@/lib/topics";

export type Club = string;

export type Tone =
  | "konfrontacyjny"
  | "techniczny"
  | "argumentowy"
  | "emocjonalny"
  | "apel"
  | "neutralny";

export type ViralQuote = {
  text: string;
  speaker: string;
  mpId?: number | null;
  photoUrl?: string | null;
  club: Club | null;
  function: string | null;
  tone: Tone;
  reason: string;
};

export type Vote = {
  time: string;
  votingNumber: number;
  result: "PRZYJĘTA" | "ODRZUCONA" | "WNIOSEK PRZYJĘTY" | "WNIOSEK ODRZUCONY";
  subtitle?: string | null;
  yes: number;
  no: number;
  abstain: number;
  absent: number;
  margin: number;
  motionPolarity?: "pass" | "reject" | "amendment" | "minority" | "procedural" | null;
  byClub?: Partial<Record<Club, { yes: number; no: number; abstain: number; absent: number }>>;
  plainNote?: string | null;
};

export type AgendaPoint = {
  ord: number;
  date: string;
  timeStart: string;
  timeEnd: string;
  durMin: number;
  title: string;
  shortTitle: string;
  plainSummary: string;
  stages: string[];
  prints: { term: number; number: string }[];
  processes: { term: number; number: string }[];
  stats: { statements: number; speakers: number; votes: number };
  tones: Partial<Record<Tone, number>>;
  topics: TopicId[];
  importance: "flagship" | "normal";
  ongoing: boolean;
  planned: boolean;
  viralQuote: ViralQuote | null;
  vote: Vote | null;
};

export type Day = {
  idx: number;
  date: string;
  weekday: string;
  short: string;
  status: "done" | "live" | "planned";
  open: string | null;
  close: string | null;
  headline: string;
  stats: { points: number; statements: number; votes: number };
};

export type TopQuote = {
  rank: number;
  text: string;
  speaker: string;
  mpId?: number | null;
  photoUrl?: string | null;
  club: Club;
  function: string;
  tone: Tone;
  reason: string;
  pointOrd: number;
  pointShort: string;
  pointTime: string;
};

export type TopSpeaker = {
  name: string;
  mpId?: number | null;
  photoUrl?: string | null;
  club: Club;
  function: string;
  minutes: number;
  statements: number;
  dominantTone: Tone;
  bestQuote: string;
};

export type Clash = {
  a: string;
  aClub: Club;
  b: string;
  bClub: Club;
  pointOrd: number;
  pointShort: string;
  exchanges: number;
  snippet: string;
};

export type Rebel = {
  name: string;
  mpId?: number | null;
  club: Club;
  expectedClub: Club;
  actual: "ZA" | "PR" | "WS";
  pointOrd: number;
  pointShort: string;
  note: string;
};

export type PlannedAgendaPoint = {
  ord: number;
  title: string;
  subtitle: string;
  topic: TopicId | null;
  flag?: boolean;
};

export type TomorrowPreview = {
  date: string;
  weekday: string;
  headline: string;
  plannedPoints: PlannedAgendaPoint[];
};

export type SittingView = {
  term: number;
  number: number;
  title: string;
  dates: string[];
  current: boolean;
  liveAt: string;
  totals: { points: number; statements: number; votes: number; speakers: number };
  days: Day[];
  agendaPoints: AgendaPoint[];
  topQuotes: TopQuote[];
  topSpeakers: TopSpeaker[];
  clashes: Clash[];
  rebels: Rebel[];
  tomorrow: TomorrowPreview | null;
};
