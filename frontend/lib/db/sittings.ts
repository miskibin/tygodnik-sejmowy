import "server-only";

import { unstable_cache } from "next/cache";
import { supabase } from "@/lib/supabase";
import { dbTagsToTopics, type TopicId } from "@/lib/topics";
import type {
  AgendaPoint,
  Clash,
  Day,
  Rebel,
  SittingView,
  TomorrowPreview,
  Tone,
  TopQuote,
  TopSpeaker,
  ViralQuote,
  Vote,
} from "@/app/posiedzenie/_components/types";

const SITTING_REVALIDATE_SEC = 300;

// DB tone enum (migration 0061: konfrontacyjny | merytoryczny | populistyczny |
// emocjonalny | techniczny | proceduralny) does not align 1:1 with the
// frontend Tone palette used by ToneBadge / TONE_INK. This map narrows DB
// values into the displayable union — unknowns fall back to "neutralny".
const TONE_MAP: Record<string, Tone> = {
  konfrontacyjny: "konfrontacyjny",
  merytoryczny: "argumentowy",
  populistyczny: "konfrontacyjny",
  emocjonalny: "emocjonalny",
  techniczny: "techniczny",
  proceduralny: "neutralny",
};

function mapTone(raw: string | null | undefined): Tone | null {
  if (!raw) return null;
  return TONE_MAP[raw] ?? null;
}

function warsawTodayDate(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw" }).format(
    new Date(),
  );
}

function warsawHhMm(): string {
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

const WEEKDAY_FMT = new Intl.DateTimeFormat("pl-PL", {
  timeZone: "Europe/Warsaw",
  weekday: "long",
});
const MONTHDAY_FMT = new Intl.DateTimeFormat("pl-PL", {
  timeZone: "Europe/Warsaw",
  day: "numeric",
  month: "long",
});

function formatWeekday(dateIso: string): string {
  return WEEKDAY_FMT.format(new Date(`${dateIso}T12:00:00Z`));
}

function formatShortDate(dateIso: string): string {
  return MONTHDAY_FMT.format(new Date(`${dateIso}T12:00:00Z`));
}

function hhMm(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return fmt.format(d);
}

function dateOnly(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return iso.slice(0, 10);
}

function diffMinutes(start: string | null, end: string | null): number {
  if (!start || !end) return 0;
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return Math.round((b - a) / 60000);
}

function shortenTitle(title: string, max = 100): string {
  if (title.length <= max) return title.replace(/\.$/, "");
  const slice = title.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > 40 ? slice.slice(0, lastSpace) : slice) + "…";
}

// Extract the ord from a voting title like "Pkt. 12 ..." (migration 0092
// heuristic). Returns null when the title doesn't match.
const PKT_ORD_RE = /^Pkt\.\s+(\d+)\b/;
function extractPktOrd(title: string | null | undefined): number | null {
  if (!title) return null;
  const m = PKT_ORD_RE.exec(title);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

// "Pkt. 12 <rest>" → "<rest>" trimmed. Falls back to original.
function stripPktPrefix(title: string | null | undefined): string {
  if (!title) return "";
  return title.replace(/^Pkt\.\s+\d+\s*/, "").trim();
}

type ProceedingRow = {
  id: number;
  term: number;
  number: number;
  title: string;
  dates: string[] | null;
};

type ProceedingDayRow = { id: number; date: string };

type AgendaItemRow = { id: number; ord: number; title: string };

type StatementRow = {
  id: number;
  num: number;
  proceeding_day_id: number;
  mp_id: number | null;
  speaker_name: string | null;
  function: string | null;
  start_datetime: string | null;
  end_datetime: string | null;
  tone: string | null;
  topic_tags: string[] | null;
  viral_score: number | string | null;
  viral_quote: string | null;
  viral_reason: string | null;
};

type VotingRow = {
  id: number;
  voting_number: number;
  date: string;
  title: string;
  yes: number;
  no: number;
  abstain: number;
  not_participating: number;
  majority_votes: number | null;
  motion_polarity:
    | "pass" | "reject" | "amendment" | "minority" | "procedural" | "other" | null;
  short_title: string | null;
};

type VoteRow = {
  voting_id: number;
  mp_id: number;
  club_ref: string | null;
  vote: "YES" | "NO" | "ABSTAIN" | "PRESENT" | "ABSENT" | string;
};

type StatementPrintLinkRow = {
  statement_id: number;
  agenda_item_id: number | null;
};

type AgendaItemPrintRow = {
  agenda_item_id: number;
  term: number;
  print_number: string;
};

type AgendaItemProcessRow = {
  agenda_item_id: number;
  term: number;
  process_id: string;
};

type MpRow = { mp_id: number; photo_url: string | null };
type MembershipRow = { mp_id: number; club_id: string };

type ViralQuoteEventRow = {
  event_date: string | null;
  impact_score: number | string | null;
  payload: {
    statement_id?: number;
    mp_id?: number | null;
    speaker_name?: string | null;
    function?: string | null;
    tone?: string | null;
    topic_tags?: string[] | null;
    viral_quote?: string | null;
    viral_reason?: string | null;
    start_datetime?: string | null;
    agenda_point_title?: string | null;
    proceeding_title?: string | null;
  };
};

function deriveResult(
  v: VotingRow,
): {
  result: Vote["result"];
  motionPolarity: Vote["motionPolarity"];
} {
  const passed = v.yes > v.no;
  const rawPolarity = v.motion_polarity ?? null;
  const motionPolarity: Vote["motionPolarity"] =
    rawPolarity && rawPolarity !== "other" ? rawPolarity : null;
  const procedural =
    motionPolarity === "reject" ||
    motionPolarity === "minority" ||
    motionPolarity === "procedural";
  if (procedural) {
    return {
      result: passed ? "WNIOSEK PRZYJĘTY" : "WNIOSEK ODRZUCONY",
      motionPolarity,
    };
  }
  return {
    result: passed ? "PRZYJĘTA" : "ODRZUCONA",
    motionPolarity,
  };
}

function buildVote(v: VotingRow, voteRows: VoteRow[]): Vote {
  const { result, motionPolarity } = deriveResult(v);
  const byClub: NonNullable<Vote["byClub"]> = {};
  for (const r of voteRows) {
    const club = r.club_ref ?? "niez.";
    const bucket = byClub[club] ?? { yes: 0, no: 0, abstain: 0, absent: 0 };
    if (r.vote === "YES") bucket.yes += 1;
    else if (r.vote === "NO") bucket.no += 1;
    else if (r.vote === "ABSTAIN") bucket.abstain += 1;
    else bucket.absent += 1;
    byClub[club] = bucket;
  }
  return {
    time: hhMm(v.date),
    votingNumber: v.voting_number,
    result,
    yes: v.yes,
    no: v.no,
    abstain: v.abstain,
    absent: v.not_participating,
    margin: Math.abs(v.yes - v.no),
    motionPolarity,
    byClub: Object.keys(byClub).length > 0 ? byClub : undefined,
    subtitle: v.short_title,
  };
}

async function loadSitting(
  term: number,
  sittingNum: number,
): Promise<SittingView | null> {
  const sb = supabase();

  // 1. proceedings row — bail when missing.
  const procRes = await sb
    .from("proceedings")
    .select("id, term, number, title, dates")
    .eq("term", term)
    .eq("number", sittingNum)
    .maybeSingle();
  if (procRes.error) throw procRes.error;
  const proc = procRes.data as ProceedingRow | null;
  if (!proc) return null;

  const dates = (proc.dates ?? []).slice().sort();

  // 2. proceeding_days
  const daysRes = await sb
    .from("proceeding_days")
    .select("id, date")
    .eq("proceeding_id", proc.id)
    .order("date", { ascending: true });
  if (daysRes.error) throw daysRes.error;
  const dayRows = (daysRes.data ?? []) as ProceedingDayRow[];
  const dayIdsByDate = new Map<string, number>();
  for (const d of dayRows) dayIdsByDate.set(d.date, d.id);
  const dayIds = dayRows.map((d) => d.id);

  // 3. agenda_items
  const agendaRes = await sb
    .from("agenda_items")
    .select("id, ord, title")
    .eq("proceeding_id", proc.id)
    .order("ord", { ascending: true });
  if (agendaRes.error) throw agendaRes.error;
  const agendaRows = (agendaRes.data ?? []) as AgendaItemRow[];
  const agendaById = new Map<number, AgendaItemRow>();
  const agendaByOrd = new Map<number, AgendaItemRow>();
  for (const a of agendaRows) {
    agendaById.set(a.id, a);
    agendaByOrd.set(a.ord, a);
  }
  const agendaIds = agendaRows.map((a) => a.id);

  // 4. parallel fetches: statements, votings, junction rows, viral events,
  //    statement_print_links.
  const [
    statementsRes,
    votingsRes,
    agendaPrintsRes,
    agendaProcessesRes,
    viralRes,
  ] = await Promise.all([
    dayIds.length > 0
      ? sb
          .from("proceeding_statements")
          .select(
            "id, num, proceeding_day_id, mp_id, speaker_name, function, start_datetime, end_datetime, tone, topic_tags, viral_score, viral_quote, viral_reason",
          )
          .in("proceeding_day_id", dayIds)
      : Promise.resolve({ data: [] as StatementRow[], error: null }),
    sb
      .from("votings")
      .select(
        "id, voting_number, date, title, yes, no, abstain, not_participating, majority_votes, motion_polarity, short_title",
      )
      .eq("term", term)
      .eq("sitting", sittingNum)
      .order("date", { ascending: true }),
    agendaIds.length > 0
      ? sb
          .from("agenda_item_prints")
          .select("agenda_item_id, term, print_number")
          .in("agenda_item_id", agendaIds)
      : Promise.resolve({ data: [] as AgendaItemPrintRow[], error: null }),
    agendaIds.length > 0
      ? sb
          .from("agenda_item_processes")
          .select("agenda_item_id, term, process_id")
          .in("agenda_item_id", agendaIds)
      : Promise.resolve({ data: [] as AgendaItemProcessRow[], error: null }),
    sb
      .from("viral_quote_events_v")
      .select("event_date, impact_score, payload")
      .eq("term", term)
      .eq("sitting_num", sittingNum)
      .order("impact_score", { ascending: false }),
  ]);
  if (statementsRes.error) throw statementsRes.error;
  if (votingsRes.error) throw votingsRes.error;
  if (agendaPrintsRes.error) throw agendaPrintsRes.error;
  if (agendaProcessesRes.error) throw agendaProcessesRes.error;
  if (viralRes.error) throw viralRes.error;

  const statements = (statementsRes.data ?? []) as StatementRow[];
  const votings = (votingsRes.data ?? []) as VotingRow[];
  const agendaPrints = (agendaPrintsRes.data ?? []) as AgendaItemPrintRow[];
  const agendaProcesses = (agendaProcessesRes.data ?? []) as AgendaItemProcessRow[];
  const viralEvents = (viralRes.data ?? []) as ViralQuoteEventRow[];

  // 5. follow-up parallel: votes (for byClub), statement_print_links (for
  //    agenda_item grouping), mps (photos), memberships (club resolution).
  const votingIds = votings.map((v) => v.id);
  const statementIds = statements.map((s) => s.id);
  const mpIds = Array.from(
    new Set([
      ...statements
        .map((s) => s.mp_id)
        .filter((x): x is number => x != null),
    ]),
  );

  const [votesRes, linksRes, mpsRes, memRes] = await Promise.all([
    votingIds.length > 0
      ? sb
          .from("votes")
          .select("voting_id, mp_id, club_ref, vote")
          .in("voting_id", votingIds)
      : Promise.resolve({ data: [] as VoteRow[], error: null }),
    statementIds.length > 0
      ? sb
          .from("statement_print_links")
          .select("statement_id, agenda_item_id")
          .in("statement_id", statementIds)
      : Promise.resolve({ data: [] as StatementPrintLinkRow[], error: null }),
    mpIds.length > 0
      ? sb
          .from("mps")
          .select("mp_id, photo_url")
          .eq("term", term)
          .in("mp_id", mpIds)
      : Promise.resolve({ data: [] as MpRow[], error: null }),
    mpIds.length > 0
      ? sb
          .from("mp_club_membership")
          .select("mp_id, club_id")
          .eq("term", term)
          .in("mp_id", mpIds)
      : Promise.resolve({ data: [] as MembershipRow[], error: null }),
  ]);
  if (votesRes.error) throw votesRes.error;
  if (linksRes.error) throw linksRes.error;
  if (mpsRes.error) throw mpsRes.error;
  if (memRes.error) throw memRes.error;

  const votes = (votesRes.data ?? []) as VoteRow[];
  const links = (linksRes.data ?? []) as StatementPrintLinkRow[];
  const mpRows = (mpsRes.data ?? []) as MpRow[];
  const memRows = (memRes.data ?? []) as MembershipRow[];

  const mpPhotos = new Map<number, string | null>();
  for (const m of mpRows) mpPhotos.set(m.mp_id, m.photo_url);
  const mpClubs = new Map<number, string>();
  for (const m of memRows) mpClubs.set(m.mp_id, m.club_id);

  // Index votes by voting_id.
  const votesByVoting = new Map<number, VoteRow[]>();
  for (const v of votes) {
    const list = votesByVoting.get(v.voting_id) ?? [];
    list.push(v);
    votesByVoting.set(v.voting_id, list);
  }

  // Statement → agenda_item_id (collapsed). First non-null wins.
  const stmtAgendaId = new Map<number, number>();
  for (const l of links) {
    if (l.agenda_item_id == null) continue;
    if (!stmtAgendaId.has(l.statement_id)) {
      stmtAgendaId.set(l.statement_id, l.agenda_item_id);
    }
  }

  // 6. Day-level aggregates.
  const today = warsawTodayDate();
  const days: Day[] = dates.map((date, idx) => {
    const dayStatements = statements.filter(
      (s) => dayIdsByDate.get(date) === s.proceeding_day_id,
    );
    const startTimes = dayStatements
      .map((s) => s.start_datetime)
      .filter((x): x is string => !!x);
    const endTimes = dayStatements
      .map((s) => s.end_datetime)
      .filter((x): x is string => !!x);
    const open = startTimes.length > 0 ? hhMm(startTimes.sort()[0]) : null;
    const close = endTimes.length > 0 ? hhMm(endTimes.sort()[endTimes.length - 1]) : null;
    let status: Day["status"];
    if (date < today) status = "done";
    else if (date === today) status = "live";
    else status = "planned";
    const votesOnDay = votings.filter((v) => dateOnly(v.date) === date).length;
    const pointsOnDay = agendaRows.length > 0
      ? // No direct linkage; approximate by votings linked to agenda ords via
        // their title prefix that hit this date.
        new Set(
          votings
            .filter((v) => dateOnly(v.date) === date)
            .map((v) => extractPktOrd(v.title))
            .filter((x): x is number => x != null),
        ).size
      : 0;
    return {
      idx,
      date,
      weekday: formatWeekday(date),
      short: formatShortDate(date),
      status,
      open,
      close,
      headline: "",
      stats: {
        points: pointsOnDay,
        statements: dayStatements.length,
        votes: votesOnDay,
      },
    };
  });

  // 7. Per-agenda-point aggregates.
  // Group statements by agenda_item_id (via statement_print_links).
  const stmtsByAgendaId = new Map<number, StatementRow[]>();
  for (const s of statements) {
    const aid = stmtAgendaId.get(s.id);
    if (aid == null) continue;
    const list = stmtsByAgendaId.get(aid) ?? [];
    list.push(s);
    stmtsByAgendaId.set(aid, list);
  }
  const printsByAgendaId = new Map<number, { term: number; number: string }[]>();
  for (const p of agendaPrints) {
    const list = printsByAgendaId.get(p.agenda_item_id) ?? [];
    list.push({ term: p.term, number: p.print_number });
    printsByAgendaId.set(p.agenda_item_id, list);
  }
  const processesByAgendaId = new Map<
    number,
    { term: number; number: string }[]
  >();
  for (const p of agendaProcesses) {
    const list = processesByAgendaId.get(p.agenda_item_id) ?? [];
    list.push({ term: p.term, number: p.process_id });
    processesByAgendaId.set(p.agenda_item_id, list);
  }

  // Votings grouped by their Pkt-ord.
  const votingsByPktOrd = new Map<number, VotingRow[]>();
  for (const v of votings) {
    const ord = extractPktOrd(v.title);
    if (ord == null) continue;
    const list = votingsByPktOrd.get(ord) ?? [];
    list.push(v);
    votingsByPktOrd.set(ord, list);
  }

  // Top viral quote per agenda ord (from the viral_quote_events_v stream
  // which is already filtered to viral_score > 0 and ordered DESC).
  const viralByOrd = new Map<number, ViralQuoteEventRow>();
  for (const ev of viralEvents) {
    const ord = extractPktOrd(ev.payload.agenda_point_title);
    if (ord == null) continue;
    if (!viralByOrd.has(ord)) viralByOrd.set(ord, ev);
  }

  const now = Date.now();
  const liveAtNow = warsawHhMm();

  const agendaPoints: AgendaPoint[] = agendaRows.map((a): AgendaPoint => {
    const stmts = stmtsByAgendaId.get(a.id) ?? [];
    const stmtStartTimes = stmts
      .map((s) => s.start_datetime)
      .filter((x): x is string => !!x);
    const stmtEndTimes = stmts
      .map((s) => s.end_datetime)
      .filter((x): x is string => !!x);
    // When statement_print_links lack rows for this agenda_item (pure-debate
    // points or backfill gap), fall back to: (a) matching votings'
    // timestamps, (b) the viral_quote_events_v statement that resolved to
    // this ord. Keeps the time rail meaningful even without link data.
    const matchingVotings = (votingsByPktOrd.get(a.ord) ?? []).slice();
    matchingVotings.sort((x, y) =>
      new Date(x.date).getTime() - new Date(y.date).getTime(),
    );
    const votingStarts = matchingVotings.map((v) => v.date);
    const viralEv = viralByOrd.get(a.ord);
    const viralStart = viralEv?.payload.start_datetime ?? null;
    const fallbackTimes = [
      ...votingStarts,
      ...(viralStart ? [viralStart] : []),
    ];
    const startCandidates = stmtStartTimes.length > 0 ? stmtStartTimes : fallbackTimes;
    const endCandidates = stmtEndTimes.length > 0 ? stmtEndTimes : fallbackTimes;
    const earliestStart = startCandidates.slice().sort()[0] ?? null;
    const latestEnd = endCandidates.slice().sort()[endCandidates.length - 1] ?? null;
    const pointDate = dateOnly(earliestStart) ?? dates[0] ?? "";
    const timeStart = earliestStart ? hhMm(earliestStart) : "—";
    const timeEnd = latestEnd ? hhMm(latestEnd) : "—";
    const durMin = stmtStartTimes.length > 0 && stmtEndTimes.length > 0
      ? diffMinutes(earliestStart, latestEnd)
      : 0;

    const tones: Partial<Record<Tone, number>> = {};
    const topicSet = new Set<string>();
    const speakerSet = new Set<number>();
    for (const s of stmts) {
      const t = mapTone(s.tone);
      if (t) tones[t] = (tones[t] ?? 0) + 1;
      for (const tag of s.topic_tags ?? []) topicSet.add(tag);
      if (s.mp_id != null) speakerSet.add(s.mp_id);
    }

    const primaryVoting = matchingVotings[0] ?? null;
    const vote: Vote | null = primaryVoting
      ? buildVote(primaryVoting, votesByVoting.get(primaryVoting.id) ?? [])
      : null;

    // Viral quote for this point — first lookup by ord, then fall back to
    // the highest-score statement assigned to this agenda_item.
    let viralQuote: ViralQuote | null = null;
    if (viralEv?.payload.viral_quote) {
      const tone = mapTone(viralEv.payload.tone) ?? "neutralny";
      const mpId = viralEv.payload.mp_id ?? null;
      viralQuote = {
        text: viralEv.payload.viral_quote,
        speaker: viralEv.payload.speaker_name ?? "—",
        mpId,
        photoUrl: mpId != null ? mpPhotos.get(mpId) ?? null : null,
        club: mpId != null ? mpClubs.get(mpId) ?? null : null,
        function: viralEv.payload.function ?? null,
        tone,
        reason: viralEv.payload.viral_reason ?? "",
      };
    } else {
      // Fallback: max viral_score statement linked to this agenda_item.
      const candidate = stmts
        .filter((s) => s.viral_quote && (s.viral_score != null))
        .sort((x, y) => {
          const sx =
            typeof x.viral_score === "string"
              ? parseFloat(x.viral_score)
              : x.viral_score ?? 0;
          const sy =
            typeof y.viral_score === "string"
              ? parseFloat(y.viral_score)
              : y.viral_score ?? 0;
          return sy - sx;
        })[0];
      if (candidate?.viral_quote) {
        const tone = mapTone(candidate.tone) ?? "neutralny";
        viralQuote = {
          text: candidate.viral_quote,
          speaker: candidate.speaker_name ?? "—",
          mpId: candidate.mp_id,
          photoUrl: candidate.mp_id != null ? mpPhotos.get(candidate.mp_id) ?? null : null,
          club: candidate.mp_id != null ? mpClubs.get(candidate.mp_id) ?? null : null,
          function: candidate.function ?? null,
          tone,
          reason: candidate.viral_reason ?? "",
        };
      }
    }

    const planned = pointDate > today || stmts.length === 0 && pointDate >= today;
    const ongoing = !!earliestStart && !!latestEnd
      && new Date(earliestStart).getTime() <= now
      && new Date(latestEnd).getTime() >= now;

    return {
      ord: a.ord,
      date: pointDate,
      timeStart,
      timeEnd,
      durMin,
      title: a.title,
      shortTitle: shortenTitle(a.title),
      plainSummary: "",
      stages: [],
      prints: printsByAgendaId.get(a.id) ?? [],
      processes: processesByAgendaId.get(a.id) ?? [],
      stats: {
        statements: stmts.length,
        speakers: speakerSet.size,
        votes: matchingVotings.length,
      },
      tones,
      topics: dbTagsToTopics([...topicSet]),
      importance: "normal",
      ongoing,
      planned,
      viralQuote,
      vote,
    };
  });

  // 8. Top quotes — top 5 from the viral feed, with point context resolved
  //    against agendaByOrd.
  const topQuotes: TopQuote[] = [];
  for (const ev of viralEvents.slice(0, 5)) {
    const ord = extractPktOrd(ev.payload.agenda_point_title);
    const agenda = ord != null ? agendaByOrd.get(ord) : null;
    const tone = mapTone(ev.payload.tone) ?? "neutralny";
    const mpId = ev.payload.mp_id ?? null;
    topQuotes.push({
      rank: topQuotes.length + 1,
      text: ev.payload.viral_quote ?? "",
      speaker: ev.payload.speaker_name ?? "—",
      mpId,
      photoUrl: mpId != null ? mpPhotos.get(mpId) ?? null : null,
      club: (mpId != null ? mpClubs.get(mpId) : null) ?? "niez.",
      function: ev.payload.function ?? "",
      tone,
      reason: ev.payload.viral_reason ?? "",
      pointOrd: ord ?? 0,
      pointShort: agenda
        ? shortenTitle(agenda.title)
        : shortenTitle(stripPktPrefix(ev.payload.agenda_point_title)),
      pointTime: hhMm(ev.payload.start_datetime),
    });
  }

  // 9. Top speakers — aggregate from statements (sum minutes + count +
  //    dominant tone + best viral quote). Top 8 by minutes.
  type SpeakerAgg = {
    name: string;
    mpId: number | null;
    function: string;
    minutes: number;
    count: number;
    toneTally: Map<Tone, number>;
    bestQuote: string;
    bestScore: number;
  };
  const speakerAgg = new Map<string, SpeakerAgg>();
  for (const s of statements) {
    if (!s.speaker_name) continue;
    const key = s.mp_id != null ? `mp:${s.mp_id}` : `name:${s.speaker_name}`;
    let agg = speakerAgg.get(key);
    if (!agg) {
      agg = {
        name: s.speaker_name,
        mpId: s.mp_id,
        function: s.function ?? "",
        minutes: 0,
        count: 0,
        toneTally: new Map(),
        bestQuote: "",
        bestScore: -1,
      };
      speakerAgg.set(key, agg);
    }
    agg.minutes += diffMinutes(s.start_datetime, s.end_datetime);
    agg.count += 1;
    const t = mapTone(s.tone);
    if (t) agg.toneTally.set(t, (agg.toneTally.get(t) ?? 0) + 1);
    const score =
      s.viral_score == null
        ? -1
        : typeof s.viral_score === "string"
          ? parseFloat(s.viral_score)
          : s.viral_score;
    if (s.viral_quote && score > agg.bestScore) {
      agg.bestQuote = s.viral_quote;
      agg.bestScore = score;
    }
  }
  const topSpeakers: TopSpeaker[] = [...speakerAgg.values()]
    .filter((a) => a.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 8)
    .map((a): TopSpeaker => {
      let dominantTone: Tone = "neutralny";
      let bestN = 0;
      for (const [t, n] of a.toneTally) {
        if (n > bestN) {
          bestN = n;
          dominantTone = t;
        }
      }
      return {
        name: a.name,
        mpId: a.mpId,
        photoUrl: a.mpId != null ? mpPhotos.get(a.mpId) ?? null : null,
        club: (a.mpId != null ? mpClubs.get(a.mpId) : null) ?? "niez.",
        function: a.function,
        minutes: a.minutes,
        statements: a.count,
        dominantTone,
        bestQuote: a.bestQuote,
      };
    });

  // 10. Tomorrow preview — first future day in the sitting; agenda points
  //     filtered by date. Headline left blank when no DB source.
  const futureDay = days.find((d) => d.date > today) ?? null;
  let tomorrow: TomorrowPreview | null = null;
  if (futureDay) {
    const plannedPoints = agendaPoints
      .filter((p) => p.date === futureDay.date)
      .slice(0, 3)
      .map((p) => ({
        ord: p.ord,
        title: p.shortTitle,
        subtitle: p.processes.length > 0
          ? `proces ${p.processes[0].number}`
          : p.prints.length > 0
            ? `druk ${p.prints[0].number}`
            : "",
        topic: (p.topics[0] as TopicId | undefined) ?? null,
        flag: p.importance === "flagship",
      }));
    tomorrow = {
      date: futureDay.date,
      weekday: futureDay.weekday,
      headline: "",
      plannedPoints,
    };
  }

  // 11. Totals.
  const totals = {
    points: agendaPoints.length,
    statements: statements.length,
    votes: votings.length,
    speakers: new Set(
      statements
        .map((s) => s.mp_id)
        .filter((x): x is number => x != null),
    ).size,
  };

  // 12. Live flag — true when warsaw "today" falls inside the sitting date range.
  const current =
    dates.length > 0 && today >= dates[0] && today <= dates[dates.length - 1];
  const liveAt = current ? liveAtNow : "";

  const clashes: Clash[] = [];
  const rebels: Rebel[] = [];

  return {
    term: proc.term,
    number: proc.number,
    title: proc.title,
    dates,
    current,
    liveAt,
    totals,
    days,
    agendaPoints,
    topQuotes,
    topSpeakers,
    clashes,
    rebels,
    tomorrow,
  };
}

export function getSittingView(
  term: number,
  sittingNum: number,
): Promise<SittingView | null> {
  return unstable_cache(
    () => loadSitting(term, sittingNum),
    ["sitting-view", "v2", String(term), String(sittingNum)],
    { revalidate: SITTING_REVALIDATE_SEC },
  )();
}
