import "server-only";

import { supabase } from "@/lib/supabase";

const DEFAULT_TERM = 10;

export type StatementPrintRef = {
  printTerm: number;
  printNumber: string;
  shortTitle: string | null;
  source: "agenda_item" | "title_regex";
};

export type StatementListItem = {
  id: number;
  term: number;
  num: number;
  mpId: number | null;
  speakerName: string | null;
  function: string | null;
  bodyText: string;
  startDatetime: string | null;
  endDatetime: string | null;
  dayDate: string | null;
  proceedingNumber: number | null;
  proceedingTitle: string | null;
  dayIdx: number | null;
  clubRef: string | null;
  clubName: string | null;
  transcriptUrl: string | null;
  agendaTopic: string | null;
  printRefs: StatementPrintRef[];
  processTitle: string | null;
};

export type StatementFilter = {
  mpId?: number;
  club?: string;
  from?: string;
  to?: string;
  proc?: number;
  term?: number;
  limit?: number;
  offset?: number;
};

type RawStatement = {
  id: number;
  term: number;
  num: number;
  mp_id: number | null;
  speaker_name: string | null;
  function: string | null;
  body_text: string | null;
  start_datetime: string | null;
  end_datetime: string | null;
  proceeding_day: {
    date: string | null;
    proceeding: { number: number | null; title: string | null; dates: string[] | null } | null;
  } | null;
};

const SELECT_COLS =
  "id, term, num, mp_id, speaker_name, function, body_text, start_datetime, end_datetime, " +
  "proceeding_day:proceeding_days!inner(date, proceeding:proceedings!inner(number, title, dates))";

function buildTranscriptUrl(
  term: number,
  sitting: number | null | undefined,
  _num: number | undefined,
  dayDate: string | null | undefined,
  dates: string[] | null | undefined,
): { url: string | null; dayIdx: number | null } {
  if (!sitting || !dayDate) return { url: null, dayIdx: null };
  const arr = dates ?? [];
  const dayIdx = arr.indexOf(dayDate) + 1;
  // Sejm API uses YYYY-MM-DD in this slot, not 1-based dayIdx. Point at the
  // full-day stenogram PDF — that's what "Pełny stenogram" advertises.
  return {
    url: `https://api.sejm.gov.pl/sejm/term${term}/proceedings/${sitting}/${dayDate}/transcripts/pdf`,
    dayIdx: dayIdx > 0 ? dayIdx : null,
  };
}

async function resolveMpClubs(
  mpIds: number[],
  term: number,
): Promise<Map<number, { clubRef: string | null; clubName: string | null }>> {
  const out = new Map<number, { clubRef: string | null; clubName: string | null }>();
  if (mpIds.length === 0) return out;
  const sb = supabase();
  const { data: mps, error } = await sb
    .from("mps")
    .select("mp_id, club_ref")
    .eq("term", term)
    .in("mp_id", mpIds);
  if (error) throw error;

  const clubRefs = new Set<string>();
  const byMp = new Map<number, string | null>();
  for (const r of (mps ?? []) as { mp_id: number; club_ref: string | null }[]) {
    byMp.set(r.mp_id, r.club_ref);
    if (r.club_ref) clubRefs.add(r.club_ref);
  }

  const clubNames = new Map<string, string>();
  if (clubRefs.size > 0) {
    const { data: clubs, error: cErr } = await sb
      .from("clubs")
      .select("club_id, name")
      .eq("term", term)
      .in("club_id", Array.from(clubRefs));
    if (cErr) throw cErr;
    for (const r of (clubs ?? []) as { club_id: string; name: string }[]) {
      clubNames.set(r.club_id, r.name);
    }
  }

  for (const mpId of mpIds) {
    const ref = byMp.get(mpId) ?? null;
    out.set(mpId, { clubRef: ref, clubName: ref ? clubNames.get(ref) ?? ref : null });
  }
  return out;
}

async function resolveClubMpIds(clubRef: string, term: number): Promise<number[]> {
  const sb = supabase();
  const { data, error } = await sb
    .from("mps")
    .select("mp_id")
    .eq("term", term)
    .eq("club_ref", clubRef);
  if (error) throw error;
  return (data ?? []).map((r) => (r as { mp_id: number }).mp_id);
}

async function resolveProceedingDayIds(proc: number, term: number): Promise<number[]> {
  const sb = supabase();
  const { data: proceeding, error: pErr } = await sb
    .from("proceedings")
    .select("id")
    .eq("term", term)
    .eq("number", proc)
    .maybeSingle();
  if (pErr) throw pErr;
  if (!proceeding) return [];
  const proceedingId = (proceeding as { id: number }).id;
  const { data: days, error: dErr } = await sb
    .from("proceeding_days")
    .select("id")
    .eq("proceeding_id", proceedingId);
  if (dErr) throw dErr;
  return (days ?? []).map((r) => (r as { id: number }).id);
}

export async function getStatements(opts: StatementFilter): Promise<StatementListItem[]> {
  const term = opts.term ?? DEFAULT_TERM;
  const limit = opts.limit ?? 30;
  const offset = opts.offset ?? 0;
  const sb = supabase();

  let mpIdsForClub: number[] | null = null;
  if (opts.club) {
    mpIdsForClub = await resolveClubMpIds(opts.club, term);
    if (mpIdsForClub.length === 0) return [];
  }

  let dayIdsForProc: number[] | null = null;
  if (opts.proc != null) {
    dayIdsForProc = await resolveProceedingDayIds(opts.proc, term);
    if (dayIdsForProc.length === 0) return [];
  }

  let qb = sb
    .from("proceeding_statements")
    .select(SELECT_COLS)
    .eq("term", term)
    .not("body_text", "is", null);

  if (opts.mpId != null) qb = qb.eq("mp_id", opts.mpId);
  if (mpIdsForClub) qb = qb.in("mp_id", mpIdsForClub);
  if (dayIdsForProc) qb = qb.in("proceeding_day_id", dayIdsForProc);
  if (opts.from) qb = qb.gte("start_datetime", `${opts.from}T00:00:00.000Z`);
  if (opts.to) qb = qb.lte("start_datetime", `${opts.to}T23:59:59.999Z`);

  const { data, error } = await qb
    .order("start_datetime", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  const rows = (data as unknown as RawStatement[]) ?? [];

  const mpIds = Array.from(new Set(rows.map((r) => r.mp_id).filter((x): x is number => x != null)));
  const clubMap = await resolveMpClubs(mpIds, term);
  const stmtIds = rows.map((r) => r.id);
  // See note in getStatementById — degrade silently if context lookup fails.
  let linkCtx: Map<number, StatementContext> = new Map();
  try {
    linkCtx = await resolveStatementContext(stmtIds, term);
  } catch (err) {
    console.error("[getStatements] resolveStatementContext failed", { err });
  }

  return rows.map((r): StatementListItem => {
    const day = r.proceeding_day ?? null;
    const proc = day?.proceeding ?? null;
    const { url, dayIdx } = buildTranscriptUrl(r.term, proc?.number ?? null, r.num, day?.date ?? null, proc?.dates ?? null);
    const club = r.mp_id != null ? clubMap.get(r.mp_id) ?? null : null;
    const ctx = linkCtx.get(r.id) ?? null;
    // Topic priority: body preamble (authoritative — reflects executed agenda
    // order, which often differs from the originally planned agenda_items.ord)
    // > agenda_items.title (fallback for speeches without a parseable preamble).
    const bodyTopic = extractPreambleTopic(r.body_text ?? "");
    return {
      id: r.id,
      term: r.term,
      num: r.num,
      mpId: r.mp_id,
      speakerName: r.speaker_name,
      function: r.function,
      bodyText: r.body_text ?? "",
      startDatetime: r.start_datetime,
      endDatetime: r.end_datetime,
      dayDate: day?.date ?? null,
      proceedingNumber: proc?.number ?? null,
      proceedingTitle: proc?.title ?? null,
      dayIdx,
      clubRef: club?.clubRef ?? null,
      clubName: club?.clubName ?? null,
      transcriptUrl: url,
      agendaTopic: bodyTopic ?? ctx?.agendaTopic ?? null,
      printRefs: ctx?.printRefs ?? [],
      processTitle: ctx?.processTitle ?? null,
    };
  });
}

// Pull the executed-agenda topic from a transcript preamble. Sejm preambles
// follow this pattern verbatim:
//   "10. kadencja, 56. posiedzenie, 3. dzień (30-04-2026) 18. punkt porządku
//    dziennego: Wniosek o wyrażenie wotum nieufności ... (druki nr 2409 i 2477)."
// We capture everything after "punkt porządku dziennego:" up to the trailing
// "(druki nr ...)" or sentence end. This is more reliable than agenda_items
// joined by ord — runtime ord can drift from the planned agenda when items
// get reordered or deferred.
const PREAMBLE_TOPIC_RE = /punkt\s+porz[ąa]dku\s+dziennego:\s*([^.]*?)(?:\s*\(druki?\s+nr|\.[\s])/i;

function extractPreambleTopic(body: string): string | null {
  if (!body) return null;
  const window_ = body.slice(0, 800);
  const m = PREAMBLE_TOPIC_RE.exec(window_);
  if (!m) return null;
  const topic = m[1].trim();
  if (topic.length < 6 || topic.length > 400) return null;
  return topic;
}

type StatementContext = {
  agendaTopic: string | null;
  printRefs: StatementPrintRef[];
  processTitle: string | null;
};

// Resolve each statement's agenda topic + linked prints + process title via
// statement_print_links (mig 0060) + agenda_items + processes(by term,number).
// Single batched fan-out: 4 PostgREST round-trips for N statements regardless
// of N. Skipped entirely when stmtIds is empty.
async function resolveStatementContext(
  stmtIds: number[],
  term: number,
): Promise<Map<number, StatementContext>> {
  const out = new Map<number, StatementContext>();
  if (stmtIds.length === 0) return out;
  const sb = supabase();

  const { data: links, error: lErr } = await sb
    .from("statement_print_links")
    .select("statement_id, print_id, source, agenda_item_id")
    .in("statement_id", stmtIds)
    .limit(stmtIds.length * 8);
  if (lErr) throw lErr;
  type Link = {
    statement_id: number;
    print_id: number;
    source: "agenda_item" | "title_regex";
    agenda_item_id: number | null;
  };
  const linkRows = (links ?? []) as Link[];
  if (linkRows.length === 0) return out;

  const printIds = Array.from(new Set(linkRows.map((l) => l.print_id)));
  const agendaIds = Array.from(
    new Set(linkRows.map((l) => l.agenda_item_id).filter((x): x is number => x != null)),
  );

  const [printsRes, agendaRes] = await Promise.all([
    sb.from("prints").select("id, term, number, short_title").in("id", printIds).limit(printIds.length),
    agendaIds.length > 0
      ? sb.from("agenda_items").select("id, title").in("id", agendaIds).limit(agendaIds.length)
      : Promise.resolve({ data: [] as Array<{ id: number; title: string }>, error: null }),
  ]);
  if (printsRes.error) throw printsRes.error;
  if ("error" in agendaRes && agendaRes.error) throw agendaRes.error;

  type Pr = { id: number; term: number; number: string; short_title: string | null };
  const prints = (printsRes.data ?? []) as Pr[];
  const printsById = new Map<number, Pr>();
  for (const p of prints) printsById.set(p.id, p);

  // Process titles via processes(term, number) — main-bill match. Children
  // (autopoprawka, sub-prints) won't resolve; that's expected.
  const printNumbers = Array.from(new Set(prints.map((p) => p.number)));
  let procByNumber = new Map<string, string>();
  if (printNumbers.length > 0) {
    const { data: procs, error: pErr } = await sb
      .from("processes")
      .select("number, title")
      .eq("term", term)
      .in("number", printNumbers)
      .limit(printNumbers.length);
    if (pErr) throw pErr;
    for (const p of (procs ?? []) as Array<{ number: string; title: string }>) {
      procByNumber.set(p.number, p.title);
    }
  }

  const agendaTitleById = new Map<number, string>();
  for (const a of (agendaRes.data ?? []) as Array<{ id: number; title: string }>) {
    agendaTitleById.set(a.id, a.title);
  }

  // Aggregate per statement. Same statement+print under both sources keeps
  // a single chip with the higher-confidence source ('agenda_item' wins).
  const ctxByStmt = new Map<
    number,
    { topic: string | null; refs: Map<number, StatementPrintRef>; procTitle: string | null }
  >();
  for (const l of linkRows) {
    let bucket = ctxByStmt.get(l.statement_id);
    if (!bucket) {
      bucket = { topic: null, refs: new Map(), procTitle: null };
      ctxByStmt.set(l.statement_id, bucket);
    }
    if (l.agenda_item_id != null && bucket.topic == null) {
      bucket.topic = agendaTitleById.get(l.agenda_item_id) ?? null;
    }
    const pr = printsById.get(l.print_id);
    if (pr) {
      const existing = bucket.refs.get(pr.id);
      if (!existing || (existing.source === "title_regex" && l.source === "agenda_item")) {
        bucket.refs.set(pr.id, {
          printTerm: pr.term,
          printNumber: pr.number,
          shortTitle: pr.short_title,
          source: l.source,
        });
      }
      if (bucket.procTitle == null) {
        bucket.procTitle = procByNumber.get(pr.number) ?? null;
      }
    }
  }

  for (const [sid, b] of ctxByStmt.entries()) {
    out.set(sid, {
      agendaTopic: b.topic,
      printRefs: Array.from(b.refs.values()).sort((a, x) =>
        a.source === x.source ? a.printNumber.localeCompare(x.printNumber) : a.source === "agenda_item" ? -1 : 1,
      ),
      processTitle: b.procTitle,
    });
  }
  return out;
}

export async function getStatementsCount(opts: StatementFilter): Promise<number> {
  const term = opts.term ?? DEFAULT_TERM;
  const sb = supabase();

  let mpIdsForClub: number[] | null = null;
  if (opts.club) {
    mpIdsForClub = await resolveClubMpIds(opts.club, term);
    if (mpIdsForClub.length === 0) return 0;
  }

  let dayIdsForProc: number[] | null = null;
  if (opts.proc != null) {
    dayIdsForProc = await resolveProceedingDayIds(opts.proc, term);
    if (dayIdsForProc.length === 0) return 0;
  }

  let qb = sb
    .from("proceeding_statements")
    .select("id", { count: "exact", head: true })
    .eq("term", term)
    .not("body_text", "is", null);

  if (opts.mpId != null) qb = qb.eq("mp_id", opts.mpId);
  if (mpIdsForClub) qb = qb.in("mp_id", mpIdsForClub);
  if (dayIdsForProc) qb = qb.in("proceeding_day_id", dayIdsForProc);
  if (opts.from) qb = qb.gte("start_datetime", `${opts.from}T00:00:00.000Z`);
  if (opts.to) qb = qb.lte("start_datetime", `${opts.to}T23:59:59.999Z`);

  const { count, error } = await qb;
  if (error) throw error;
  return count ?? 0;
}

export async function getStatementById(id: number): Promise<StatementListItem | null> {
  const sb = supabase();
  const { data, error } = await sb
    .from("proceeding_statements")
    .select(SELECT_COLS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = data as unknown as RawStatement;
  const day = r.proceeding_day ?? null;
  const proc = day?.proceeding ?? null;
  const { url, dayIdx } = buildTranscriptUrl(r.term, proc?.number ?? null, r.num, day?.date ?? null, proc?.dates ?? null);
  let clubRef: string | null = null;
  let clubName: string | null = null;
  if (r.mp_id != null) {
    const m = await resolveMpClubs([r.mp_id], r.term);
    const c = m.get(r.mp_id) ?? null;
    clubRef = c?.clubRef ?? null;
    clubName = c?.clubName ?? null;
  }
  // Best-effort: print/agenda context resolution depends on optional cols
  // (e.g. statement_print_links.agenda_item_id from migration 0060). If a
  // freshly-bootstrapped DB lacks them, degrade silently — the page still
  // renders body + hero + enrichment without the print-chip aside.
  let ctx: StatementContext | null = null;
  try {
    const linkCtx = await resolveStatementContext([r.id], r.term);
    ctx = linkCtx.get(r.id) ?? null;
  } catch (err) {
    console.error("[getStatementById] resolveStatementContext failed", { id: r.id, err });
  }
  const bodyTopic = extractPreambleTopic(r.body_text ?? "");
  return {
    id: r.id,
    term: r.term,
    num: r.num,
    mpId: r.mp_id,
    speakerName: r.speaker_name,
    function: r.function,
    bodyText: r.body_text ?? "",
    startDatetime: r.start_datetime,
    endDatetime: r.end_datetime,
    dayDate: day?.date ?? null,
    proceedingNumber: proc?.number ?? null,
    proceedingTitle: proc?.title ?? null,
    dayIdx,
    clubRef,
    clubName,
    transcriptUrl: url,
    agendaTopic: bodyTopic ?? ctx?.agendaTopic ?? null,
    printRefs: ctx?.printRefs ?? [],
    processTitle: ctx?.processTitle ?? null,
  };
}

// ─── Rich detail payload for /mowa/[id] redesign ─────────────────────────
//
// Adds viral fields + MP photo + related speeches on top of the list-item
// shape. Separate fetcher so the existing list view stays cheap.

export type StatementDetail = StatementListItem & {
  viralScore: number | null;
  viralQuote: string | null;
  viralReason: string | null;
  tone: string | null;
  topicTags: string[];
  addressee: string | null;
  summaryOneLine: string | null;
  keyClaims: string[];
  mentionedEntities: {
    mps?: string[]; parties?: string[]; ministers?: string[]; prints?: string[];
  } | null;
  mpPhotoUrl: string | null;
  mpDistrictNum: number | null;
  mpDistrictName: string | null;
  contextStrip: ContextNeighbor[];
};

// Neighbour rows for the /mowa/[id] context strip (prev2..next2 within the
// same proceeding day, ordered ascending by num). The focal statement is
// included with isCurrent=true.
export type ContextNeighbor = {
  id: number;
  num: number;
  speakerName: string | null;
  function: string | null;
  startDatetime: string | null;
  preview: string | null; // viral_quote ?? summary_one_line
  isCurrent: boolean;
};

export type RelatedStatement = {
  id: number;
  speakerName: string | null;
  viralQuote: string | null;
  summaryOneLine: string | null;
  tone: string | null;
  topicTags: string[];
  date: string | null;
  proceedingNumber: number | null;
};

type EnrichRow = {
  viral_score: number | string | null;
  viral_quote: string | null;
  viral_reason: string | null;
  tone: string | null;
  topic_tags: string[] | null;
  addressee: string | null;
  summary_one_line: string | null;
  key_claims: string[] | null;
  mentioned_entities: StatementDetail["mentionedEntities"];
};

export async function getStatementDetail(id: number): Promise<StatementDetail | null> {
  type NeighborRow = {
    id: number;
    num: number;
    speaker_name: string | null;
    function: string | null;
    start_datetime: string | null;
    viral_quote: string | null;
    summary_one_line: string | null;
  };

  const base = await getStatementById(id);
  if (!base) return null;
  const sb = supabase();

  // Resolve focal proceeding_day_id once so we can fetch the prev/next 2
  // neighbour rows for the context strip in the same day. Done here (not in
  // getStatementById) so the list view stays cheap.
  const focalRes = await sb
    .from("proceeding_statements")
    .select("proceeding_day_id")
    .eq("id", id)
    .maybeSingle();
  const focalDayId = (focalRes.data as { proceeding_day_id: number | null } | null)?.proceeding_day_id ?? null;

  const [enrichRes, mpRes, neighborRes] = await Promise.all([
    sb.from("proceeding_statements")
      .select("viral_score, viral_quote, viral_reason, tone, topic_tags, addressee, summary_one_line, key_claims, mentioned_entities")
      .eq("id", id)
      .maybeSingle(),
    base.mpId
      ? sb.from("mps")
          .select("photo_url, district_num, district_name")
          .eq("term", base.term)
          .eq("mp_id", base.mpId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null } as const),
    focalDayId != null
      ? sb.from("proceeding_statements")
          .select("id, num, speaker_name, function, start_datetime, viral_quote, summary_one_line")
          .eq("proceeding_day_id", focalDayId)
          .gte("num", base.num - 2)
          .lte("num", base.num + 2)
          .order("num", { ascending: true })
      : Promise.resolve({ data: [] as NeighborRow[], error: null } as const),
  ]);

  const enrich = (enrichRes.data ?? null) as EnrichRow | null;
  const mp = (mpRes.data ?? null) as { photo_url: string | null; district_num: number | null; district_name: string | null } | null;

  const neighbours = (neighborRes.data ?? []) as NeighborRow[];
  const contextStrip: ContextNeighbor[] = neighbours.map((n) => ({
    id: n.id,
    num: n.num,
    speakerName: n.speaker_name,
    function: n.function,
    startDatetime: n.start_datetime,
    preview: n.viral_quote ?? n.summary_one_line ?? null,
    isCurrent: n.id === id,
  }));

  const viralScore =
    enrich?.viral_score == null ? null
    : typeof enrich.viral_score === "string" ? parseFloat(enrich.viral_score)
    : enrich.viral_score;

  return {
    ...base,
    viralScore,
    viralQuote: enrich?.viral_quote ?? null,
    viralReason: enrich?.viral_reason ?? null,
    tone: enrich?.tone ?? null,
    topicTags: enrich?.topic_tags ?? [],
    addressee: enrich?.addressee ?? null,
    summaryOneLine: enrich?.summary_one_line ?? null,
    keyClaims: enrich?.key_claims ?? [],
    mentionedEntities: enrich?.mentioned_entities ?? null,
    mpPhotoUrl: mp?.photo_url ?? null,
    mpDistrictNum: mp?.district_num ?? null,
    mpDistrictName: mp?.district_name ?? null,
    contextStrip,
  };
}

// Same MP, overlapping topic tag, sorted by date desc. Drop the focal one.
export async function getRelatedStatements(
  mpId: number | null,
  topicTags: string[],
  excludeId: number,
  limit = 3,
): Promise<RelatedStatement[]> {
  if (!mpId) return [];
  const sb = supabase();
  let q = sb
    .from("proceeding_statements")
    .select("id, speaker_name, viral_quote, summary_one_line, tone, topic_tags, start_datetime, proceeding_day:proceeding_days!inner(proceeding:proceedings!inner(number))")
    .eq("mp_id", mpId)
    .not("viral_quote", "is", null)
    .neq("id", excludeId)
    .order("viral_score", { ascending: false, nullsFirst: false })
    .limit(limit * 4);
  if (topicTags.length > 0) q = q.overlaps("topic_tags", topicTags);
  const { data, error } = await q;
  if (error) throw error;
  type Row = {
    id: number;
    speaker_name: string | null;
    viral_quote: string | null;
    summary_one_line: string | null;
    tone: string | null;
    topic_tags: string[] | null;
    start_datetime: string | null;
    proceeding_day: { proceeding: { number: number | null } | null } | null;
  };
  return ((data ?? []) as unknown as Row[]).slice(0, limit).map((r) => ({
    id: r.id,
    speakerName: r.speaker_name,
    viralQuote: r.viral_quote,
    summaryOneLine: r.summary_one_line,
    tone: r.tone,
    topicTags: r.topic_tags ?? [],
    date: r.start_datetime,
    proceedingNumber: r.proceeding_day?.proceeding?.number ?? null,
  }));
}

export type StatementsOverview = {
  totalStatements: number;
  totalProceedings: number;
};

export async function getStatementsOverview(term = DEFAULT_TERM): Promise<StatementsOverview> {
  const sb = supabase();
  const [stmts, procs] = await Promise.all([
    sb
      .from("proceeding_statements")
      .select("id", { count: "exact", head: true })
      .eq("term", term)
      .not("body_text", "is", null),
    sb.from("proceedings").select("id", { count: "exact", head: true }).eq("term", term),
  ]);
  if (stmts.error) throw stmts.error;
  if (procs.error) throw procs.error;
  return { totalStatements: stmts.count ?? 0, totalProceedings: procs.count ?? 0 };
}

// Top-N viral quotes across the whole term, joined with the speaker's current
// club. Powers the landing-page typewriter + carousel and the /mowa "Najgłośniej
// w Sejmie" feed. We don't filter by date — viral_score already biases toward
// memorable + recent. Keep payload tiny (no body_text, no preamble parsing).
export type ViralStatementCard = {
  id: number;
  speakerName: string | null;
  function: string | null;
  clubRef: string | null;
  viralQuote: string;
  viralReason: string | null;
  tone: string | null;
  topicTags: string[];
  date: string | null;
  proceedingNumber: number | null;
  viralScore: number | null;
};

export async function getTopViralStatements(
  limit = 12,
  term = DEFAULT_TERM,
): Promise<ViralStatementCard[]> {
  const sb = supabase();
  const { data, error } = await sb
    .from("proceeding_statements")
    .select(
      "id, mp_id, speaker_name, function, viral_quote, viral_reason, viral_score, tone, topic_tags, start_datetime, proceeding_day:proceeding_days!inner(date, proceeding:proceedings!inner(number))",
    )
    .eq("term", term)
    .not("viral_quote", "is", null)
    .order("viral_score", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;

  type Row = {
    id: number;
    mp_id: number | null;
    speaker_name: string | null;
    function: string | null;
    viral_quote: string | null;
    viral_reason: string | null;
    viral_score: number | string | null;
    tone: string | null;
    topic_tags: string[] | null;
    start_datetime: string | null;
    proceeding_day: { date: string | null; proceeding: { number: number | null } | null } | null;
  };
  const rows = (data ?? []) as unknown as Row[];

  const mpIds = Array.from(new Set(rows.map((r) => r.mp_id).filter((x): x is number => x != null)));
  const clubMap = await resolveMpClubs(mpIds, term);

  return rows
    .filter((r) => r.viral_quote && r.viral_quote.trim().length > 0)
    .map((r): ViralStatementCard => {
      const club = r.mp_id != null ? clubMap.get(r.mp_id) ?? null : null;
      const score =
        r.viral_score == null
          ? null
          : typeof r.viral_score === "string"
            ? parseFloat(r.viral_score)
            : r.viral_score;
      return {
        id: r.id,
        speakerName: r.speaker_name,
        function: r.function,
        clubRef: club?.clubRef ?? null,
        viralQuote: r.viral_quote!,
        viralReason: r.viral_reason,
        tone: r.tone,
        topicTags: r.topic_tags ?? [],
        date: r.start_datetime ?? r.proceeding_day?.date ?? null,
        proceedingNumber: r.proceeding_day?.proceeding?.number ?? null,
        viralScore: score,
      };
    });
}

export async function getActiveClubs(term = DEFAULT_TERM): Promise<{ clubId: string; name: string }[]> {
  const sb = supabase();
  const { data, error } = await sb
    .from("clubs")
    .select("club_id, name")
    .eq("term", term)
    .order("club_id", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as { club_id: string; name: string }[]).map((r) => ({ clubId: r.club_id, name: r.name }));
}
