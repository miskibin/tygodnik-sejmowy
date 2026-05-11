import "server-only";

import { cleanStatementBody } from "@/lib/speechExcerpt";
import { supabase } from "@/lib/supabase";

const DEFAULT_TERM = 10;

const STATS_FETCH_PAGE = 1000;

export { MP_QUESTIONS_STATEMENTS_TAB_LIMIT } from "@/lib/posel-tab-page-size";

export type VoteValue = "YES" | "NO" | "ABSTAIN" | "ABSENT" | "PRESENT";

export type MpVoteRow = {
  votingId: number;
  date: string | null;
  title: string;
  yes: number;
  no: number;
  abstain: number;
  vote: VoteValue;
  clubWinner: VoteValue | null;
  printTerm: number | null;
  printNumber: string | null;
  printShortTitle: string | null;
  processTitle: string | null;
  stageType: string | null;
};

export type MpVotesData = {
  rows: MpVoteRow[];
  totals: { yes: number; no: number; abstain: number; absent: number; present: number };
  monthly: Array<{ ym: string; yes: number; no: number; abstain: number; absent: number }>;
  dissentCount: number;
};

function clubWinner(yes: number, no: number, abstain: number): VoteValue | null {
  const total = yes + no + abstain;
  if (total === 0) return null;
  if (yes >= no && yes >= abstain) return "YES";
  if (no >= abstain) return "NO";
  return "ABSTAIN";
}

export async function getMpVotes(mpId: number, term = DEFAULT_TERM): Promise<MpVotesData> {
  const sb = supabase();

  const [mpRes, votesRes] = await Promise.all([
    sb.from("mps").select("club_ref").eq("term", term).eq("mp_id", mpId).maybeSingle(),
    sb.from("votes").select("voting_id, vote").eq("term", term).eq("mp_id", mpId).limit(2000),
  ]);
  if (votesRes.error) throw votesRes.error;
  const clubRef = (mpRes.data?.club_ref as string | null) ?? null;
  const voteRows = (votesRes.data ?? []) as Array<{ voting_id: number; vote: string }>;
  if (voteRows.length === 0) {
    return {
      rows: [],
      totals: { yes: 0, no: 0, abstain: 0, absent: 0, present: 0 },
      monthly: [],
      dissentCount: 0,
    };
  }

  const voteByVotingId = new Map<number, VoteValue>();
  for (const v of voteRows) voteByVotingId.set(v.voting_id, v.vote as VoteValue);
  const votingIds = Array.from(voteByVotingId.keys());

  const [vmeta, vclub] = await Promise.all([
    sb.from("votings").select("id, date, title").in("id", votingIds).limit(votingIds.length),
    clubRef
      ? sb
          .from("voting_by_club")
          .select("voting_id, club_short, yes, no, abstain")
          .eq("term", term)
          .eq("club_short", clubRef)
          .in("voting_id", votingIds)
          .limit(votingIds.length)
      : Promise.resolve({ data: [] as Array<{ voting_id: number; yes: number; no: number; abstain: number }>, error: null }),
  ]);
  if (vmeta.error) throw vmeta.error;
  if ("error" in vclub && vclub.error) throw vclub.error;

  // voting_row_context (mig 0060/0062) — single-row context per voting:
  //   stage_type (Voting / CommitteeReport / SenatePosition / Amendment / ...)
  //   primary print short_title + term/number, parent process title.
  const ctxRes = await sb
    .from("voting_row_context")
    .select("voting_id, stage_type, print_term, print_number, print_short_title, print_title, process_title")
    .in("voting_id", votingIds)
    .limit(votingIds.length);
  if (ctxRes.error) throw ctxRes.error;
  type Ctx = {
    voting_id: number;
    stage_type: string | null;
    print_term: number | null;
    print_number: string | null;
    print_short_title: string | null;
    print_title: string | null;
    process_title: string | null;
  };
  const ctxByVoting = new Map<number, Ctx>();
  for (const c of (ctxRes.data ?? []) as Ctx[]) ctxByVoting.set(c.voting_id, c);

  const meta = (vmeta.data ?? []) as Array<{ id: number; date: string | null; title: string | null }>;
  const metaById = new Map<number, { date: string | null; title: string | null }>();
  for (const m of meta) metaById.set(m.id, { date: m.date, title: m.title });

  const clubData = ((vclub as { data: Array<{ voting_id: number; yes: number; no: number; abstain: number }> }).data ?? []);
  const clubByVoting = new Map<number, { yes: number; no: number; abstain: number }>();
  for (const c of clubData) clubByVoting.set(c.voting_id, { yes: c.yes, no: c.no, abstain: c.abstain });

  const rows: MpVoteRow[] = votingIds.map((vid) => {
    const m = metaById.get(vid) ?? { date: null, title: null };
    const c = clubByVoting.get(vid);
    const winner = c ? clubWinner(c.yes, c.no, c.abstain) : null;
    const ctx = ctxByVoting.get(vid) ?? null;
    return {
      votingId: vid,
      date: m.date,
      title: m.title ?? "",
      yes: c?.yes ?? 0,
      no: c?.no ?? 0,
      abstain: c?.abstain ?? 0,
      vote: voteByVotingId.get(vid) as VoteValue,
      clubWinner: winner,
      printTerm: ctx?.print_term ?? null,
      printNumber: ctx?.print_number ?? null,
      printShortTitle: ctx?.print_short_title ?? null,
      processTitle: ctx?.process_title ?? null,
      stageType: ctx?.stage_type ?? null,
    };
  });

  rows.sort((a, b) => {
    const da = a.date ? Date.parse(a.date) : 0;
    const db = b.date ? Date.parse(b.date) : 0;
    return db - da;
  });

  const totals = { yes: 0, no: 0, abstain: 0, absent: 0, present: 0 };
  let dissentCount = 0;
  const monthAcc = new Map<string, { yes: number; no: number; abstain: number; absent: number }>();
  for (const r of rows) {
    if (r.vote === "YES") totals.yes++;
    else if (r.vote === "NO") totals.no++;
    else if (r.vote === "ABSTAIN") totals.abstain++;
    else if (r.vote === "ABSENT") totals.absent++;
    else if (r.vote === "PRESENT") totals.present++;
    if (r.clubWinner && r.clubWinner !== r.vote && (r.vote === "YES" || r.vote === "NO" || r.vote === "ABSTAIN")) {
      dissentCount++;
    }
    if (r.date) {
      const ym = r.date.slice(0, 7);
      let bucket = monthAcc.get(ym);
      if (!bucket) {
        bucket = { yes: 0, no: 0, abstain: 0, absent: 0 };
        monthAcc.set(ym, bucket);
      }
      if (r.vote === "YES") bucket.yes++;
      else if (r.vote === "NO") bucket.no++;
      else if (r.vote === "ABSTAIN") bucket.abstain++;
      else if (r.vote === "ABSENT" || r.vote === "PRESENT") bucket.absent++;
    }
  }
  const monthly = Array.from(monthAcc.entries())
    .map(([ym, v]) => ({ ym, ...v }))
    .sort((a, b) => a.ym.localeCompare(b.ym));

  return { rows, totals, monthly, dissentCount };
}

export type MpQuestionRow = {
  questionId: number;
  kind: string;
  num: number;
  title: string;
  sentDate: string | null;
  answerDelayedDays: number | null;
  recipients: string[];
};

/** Aggregates over all interpellations / written questions for an MP (full DB scan). */
export type MpQuestionsStats = {
  total: number;
  delayedCount: number;
  avgDelayDays: number | null;
  recipientsTop: Array<{ name: string; count: number }>;
};

type QRowFull = {
  question_id: number;
  questions: {
    id: number;
    kind: string;
    num: number;
    title: string | null;
    sent_date: string | null;
    answer_delayed_days: number | null;
    recipient_titles: string[] | null;
  };
};

type QAggRow = {
  question_id: number;
  questions: {
    answer_delayed_days: number | null;
    recipient_titles: string[] | null;
  };
};

function mapQRowFull(r: QRowFull): MpQuestionRow {
  return {
    questionId: r.question_id,
    kind: r.questions.kind,
    num: r.questions.num,
    title: r.questions.title ?? `${r.questions.kind} ${r.questions.num}`,
    sentDate: r.questions.sent_date,
    answerDelayedDays: r.questions.answer_delayed_days,
    recipients: r.questions.recipient_titles ?? [],
  };
}

export async function getMpQuestionsStats(mpId: number, term = DEFAULT_TERM): Promise<MpQuestionsStats> {
  const sb = supabase();
  const { count: totalN, error: cErr } = await sb
    .from("question_authors")
    .select("*", { count: "exact", head: true })
    .eq("term", term)
    .eq("mp_id", mpId);
  if (cErr) throw cErr;
  const total = totalN ?? 0;
  if (total === 0) {
    return { total: 0, delayedCount: 0, avgDelayDays: null, recipientsTop: [] };
  }

  const all: QAggRow[] = [];
  for (let offset = 0; ; offset += STATS_FETCH_PAGE) {
    const { data, error } = await sb
      .from("question_authors")
      .select("question_id, questions:questions!inner(answer_delayed_days, recipient_titles)")
      .eq("term", term)
      .eq("mp_id", mpId)
      .order("question_id", { ascending: true })
      .range(offset, offset + STATS_FETCH_PAGE - 1);
    if (error) throw error;
    const chunk = (data ?? []) as unknown as QAggRow[];
    all.push(...chunk);
    if (chunk.length < STATS_FETCH_PAGE) break;
  }

  let delayedCount = 0;
  let delaySum = 0;
  let delayN = 0;
  const recipientCount = new Map<string, number>();
  for (const r of all) {
    for (const name of r.questions.recipient_titles ?? []) {
      recipientCount.set(name, (recipientCount.get(name) ?? 0) + 1);
    }
    const d = r.questions.answer_delayed_days;
    if (d != null && d > 0) {
      delayedCount++;
      delaySum += d;
      delayN++;
    }
  }
  const recipientsTop = Array.from(recipientCount.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    total,
    delayedCount,
    avgDelayDays: delayN > 0 ? delaySum / delayN : null,
    recipientsTop,
  };
}

export async function getMpQuestionsRows(
  mpId: number,
  term = DEFAULT_TERM,
  offset: number,
  limit: number,
): Promise<MpQuestionRow[]> {
  if (limit <= 0) return [];
  const sb = supabase();
  const { data, error } = await sb
    .from("question_authors")
    .select(
      "question_id, questions:questions!inner(id, kind, num, title, sent_date, answer_delayed_days, recipient_titles)"
    )
    .eq("term", term)
    .eq("mp_id", mpId)
    .order("question_id", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  // Keep one stable global order across paginated API calls.
  // Re-sorting each page in memory can break cross-page ordering.
  return ((data ?? []) as unknown as QRowFull[]).map(mapQRowFull);
}

export type MpStatementRow = {
  id: number;
  date: string | null;
  function: string | null;
  rapporteur: boolean;
  secretary: boolean;
  bodyLength: number;
  excerpt: string;
  proceedingNumber: number | null;
  proceedingDay: string | null;
};

/** Aggregates over all plenary statements for an MP (full DB scan). */
export type MpStatementsStats = {
  total: number;
  proceedingsTouched: number;
  longest: number;
  monthly: Array<{ ym: string; count: number }>;
};

type StmtSlim = {
  id: number;
  start_datetime: string | null;
  body_text: string | null;
  proceeding_day_id: number | null;
};

type StmtRowFull = {
  id: number;
  start_datetime: string | null;
  body_text: string | null;
  summary_one_line: string | null;
  function: string | null;
  rapporteur: boolean | null;
  secretary: boolean | null;
  proceeding_day_id: number | null;
};

export async function getMpStatementsStats(mpId: number, term = DEFAULT_TERM): Promise<MpStatementsStats> {
  const sb = supabase();
  const { count: totalN, error: cErr } = await sb
    .from("proceeding_statements")
    .select("*", { count: "exact", head: true })
    .eq("term", term)
    .eq("mp_id", mpId);
  if (cErr) throw cErr;
  const total = totalN ?? 0;
  if (total === 0) {
    return { total: 0, proceedingsTouched: 0, longest: 0, monthly: [] };
  }

  const stmts: StmtSlim[] = [];
  for (let offset = 0; ; offset += STATS_FETCH_PAGE) {
    const { data, error } = await sb
      .from("proceeding_statements")
      .select("id, start_datetime, body_text, proceeding_day_id")
      .eq("term", term)
      .eq("mp_id", mpId)
      .order("start_datetime", { ascending: false, nullsFirst: false })
      .range(offset, offset + STATS_FETCH_PAGE - 1);
    if (error) throw error;
    const chunk = (data ?? []) as StmtSlim[];
    stmts.push(...chunk);
    if (chunk.length < STATS_FETCH_PAGE) break;
  }

  const dayIds = Array.from(new Set(stmts.map((s) => s.proceeding_day_id).filter((x): x is number => x != null)));
  let dayInfo = new Map<number, { date: string | null; proceedingNumber: number | null }>();
  if (dayIds.length) {
    const dRes = await sb
      .from("proceeding_days")
      .select("id, date, proceeding_id")
      .in("id", dayIds)
      .limit(Math.max(dayIds.length, 1));
    if (dRes.error) throw dRes.error;
    type D = { id: number; date: string | null; proceeding_id: number | null };
    const days = (dRes.data ?? []) as D[];
    const procIds = Array.from(new Set(days.map((d) => d.proceeding_id).filter((x): x is number => x != null)));
    let procNumByPid = new Map<number, number>();
    if (procIds.length) {
      const pRes = await sb.from("proceedings").select("id, number").in("id", procIds).limit(procIds.length);
      if (pRes.error) throw pRes.error;
      for (const p of (pRes.data ?? []) as Array<{ id: number; number: number }>) procNumByPid.set(p.id, p.number);
    }
    for (const d of days) {
      dayInfo.set(d.id, {
        date: d.date,
        proceedingNumber: d.proceeding_id != null ? procNumByPid.get(d.proceeding_id) ?? null : null,
      });
    }
  }

  const proceedings = new Set<number>();
  let longest = 0;
  const monthAcc = new Map<string, number>();
  for (const s of stmts) {
    const body = s.body_text ?? "";
    if (body.length > longest) longest = body.length;
    const di = s.proceeding_day_id != null ? dayInfo.get(s.proceeding_day_id) : null;
    if (di?.proceedingNumber != null) proceedings.add(di.proceedingNumber);
    const dt = s.start_datetime ?? di?.date ?? null;
    if (dt) {
      const ym = dt.slice(0, 7);
      monthAcc.set(ym, (monthAcc.get(ym) ?? 0) + 1);
    }
  }
  const monthly = Array.from(monthAcc.entries())
    .map(([ym, count]) => ({ ym, count }))
    .sort((a, b) => a.ym.localeCompare(b.ym));

  return {
    total,
    proceedingsTouched: proceedings.size,
    longest,
    monthly,
  };
}

export async function getMpStatementsRows(
  mpId: number,
  term = DEFAULT_TERM,
  offset: number,
  limit: number,
): Promise<MpStatementRow[]> {
  if (limit <= 0) return [];
  const sb = supabase();
  const { data, error } = await sb
    .from("proceeding_statements")
    .select("id, start_datetime, body_text, summary_one_line, function, rapporteur, secretary, proceeding_day_id")
    .eq("term", term)
    .eq("mp_id", mpId)
    .order("start_datetime", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  const stmts = (data ?? []) as StmtRowFull[];

  const dayIds = Array.from(new Set(stmts.map((s) => s.proceeding_day_id).filter((x): x is number => x != null)));
  let dayInfo = new Map<number, { date: string | null; proceedingNumber: number | null }>();
  if (dayIds.length) {
    const dRes = await sb
      .from("proceeding_days")
      .select("id, date, proceeding_id")
      .in("id", dayIds)
      .limit(dayIds.length);
    if (dRes.error) throw dRes.error;
    type D = { id: number; date: string | null; proceeding_id: number | null };
    const days = (dRes.data ?? []) as D[];
    const procIds = Array.from(new Set(days.map((d) => d.proceeding_id).filter((x): x is number => x != null)));
    let procNumByPid = new Map<number, number>();
    if (procIds.length) {
      const pRes = await sb.from("proceedings").select("id, number").in("id", procIds).limit(procIds.length);
      if (pRes.error) throw pRes.error;
      for (const p of (pRes.data ?? []) as Array<{ id: number; number: number }>) procNumByPid.set(p.id, p.number);
    }
    for (const d of days) {
      dayInfo.set(d.id, {
        date: d.date,
        proceedingNumber: d.proceeding_id != null ? procNumByPid.get(d.proceeding_id) ?? null : null,
      });
    }
  }

  return stmts.map((s) => {
    const di = s.proceeding_day_id != null ? dayInfo.get(s.proceeding_day_id) : null;
    const body = s.body_text ?? "";
    const summ = s.summary_one_line?.trim();
    const cleaned = summ ? summ : cleanStatementBody(body);
    const excerpt = cleaned.length > 320 ? cleaned.slice(0, 320).trimEnd() + "…" : cleaned;
    return {
      id: s.id,
      date: s.start_datetime ?? di?.date ?? null,
      function: s.function,
      rapporteur: !!s.rapporteur,
      secretary: !!s.secretary,
      bodyLength: body.length,
      excerpt,
      proceedingNumber: di?.proceedingNumber ?? null,
      proceedingDay: di?.date ?? null,
    };
  });
}

export type PromiseAlignmentVote = {
  votingId: number;
  date: string | null;
  title: string;
  printTerm: number;
  printNumber: string;
  printShort: string | null;
  vote: VoteValue | "NONE";
};

export type PromiseAlignmentRow = {
  promiseId: number;
  promiseTitle: string;
  votes: PromiseAlignmentVote[];
};

export type MpPromiseAlignments = {
  partyCode: string | null;
  rows: PromiseAlignmentRow[];
  totalPromises: number;
  alignedCount: number;
  againstCount: number;
};

const CLUB_TO_PARTY_CODE: Record<string, string> = {
  KO: "KO",
  PiS: "PiS",
  Lewica: "L",
  Polska2050: "P2050",
  Konfederacja: "Konf",
  Konfederacja_KP: "Konf",
};

export async function getMpPromiseAlignments(
  mpId: number,
  term = DEFAULT_TERM
): Promise<MpPromiseAlignments> {
  const sb = supabase();

  const { data: mpData, error: mpErr } = await sb
    .from("mps")
    .select("club_ref")
    .eq("term", term)
    .eq("mp_id", mpId)
    .maybeSingle();
  if (mpErr) throw mpErr;
  const clubRef = (mpData?.club_ref as string | null) ?? null;
  const partyCode = clubRef ? CLUB_TO_PARTY_CODE[clubRef] ?? null : null;

  if (!partyCode) {
    return { partyCode: null, rows: [], totalPromises: 0, alignedCount: 0, againstCount: 0 };
  }

  const { data: promisesData, error: prErr } = await sb
    .from("promises")
    .select("id, title")
    .eq("party_code", partyCode)
    .limit(500);
  if (prErr) throw prErr;
  const promises = (promisesData ?? []) as Array<{ id: number; title: string }>;
  const promiseIds = promises.map((p) => p.id);
  if (promiseIds.length === 0) {
    return { partyCode, rows: [], totalPromises: 0, alignedCount: 0, againstCount: 0 };
  }

  const { data: candData, error: cErr } = await sb
    .from("promise_print_candidates")
    .select("promise_id, print_term, print_number, match_status")
    .in("promise_id", promiseIds)
    .eq("match_status", "confirmed")
    .eq("print_term", term)
    .limit(2000);
  if (cErr) throw cErr;
  const cands = (candData ?? []) as Array<{ promise_id: number; print_term: number; print_number: string }>;
  if (cands.length === 0) {
    return { partyCode, rows: [], totalPromises: 0, alignedCount: 0, againstCount: 0 };
  }

  const printNumbers = Array.from(new Set(cands.map((c) => c.print_number)));
  const { data: printsData, error: pErr } = await sb
    .from("prints")
    .select("id, term, number, short_title")
    .eq("term", term)
    .in("number", printNumbers)
    .limit(printNumbers.length);
  if (pErr) throw pErr;
  type Pr = { id: number; term: number; number: string; short_title: string | null };
  const prints = (printsData ?? []) as Pr[];
  const printByKey = new Map<string, Pr>();
  for (const p of prints) printByKey.set(`${p.term}/${p.number}`, p);

  const printIds = prints.map((p) => p.id);
  if (printIds.length === 0) {
    return { partyCode, rows: [], totalPromises: 0, alignedCount: 0, againstCount: 0 };
  }

  const { data: linksData, error: lErr } = await sb
    .from("voting_print_links")
    .select("voting_id, print_id, role")
    .in("print_id", printIds)
    .limit(printIds.length * 6);
  if (lErr) throw lErr;
  const links = (linksData ?? []) as Array<{ voting_id: number; print_id: number; role: string }>;
  // Pick best voting per print: prefer 'main', else first
  const bestVotingByPrint = new Map<number, number>();
  const sortedLinks = [...links].sort((a, b) => (a.role === "main" ? -1 : b.role === "main" ? 1 : 0));
  for (const l of sortedLinks) {
    if (!bestVotingByPrint.has(l.print_id)) bestVotingByPrint.set(l.print_id, l.voting_id);
  }
  const votingIds = Array.from(new Set(bestVotingByPrint.values()));

  let votingMeta = new Map<number, { date: string | null; title: string }>();
  let mpVoteByVoting = new Map<number, VoteValue>();
  if (votingIds.length > 0) {
    const [vmRes, mvRes] = await Promise.all([
      sb.from("votings").select("id, date, title").in("id", votingIds).limit(votingIds.length),
      sb
        .from("votes")
        .select("voting_id, vote")
        .eq("term", term)
        .eq("mp_id", mpId)
        .in("voting_id", votingIds)
        .limit(votingIds.length),
    ]);
    if (vmRes.error) throw vmRes.error;
    if (mvRes.error) throw mvRes.error;
    for (const v of (vmRes.data ?? []) as Array<{ id: number; date: string | null; title: string | null }>) {
      votingMeta.set(v.id, { date: v.date, title: v.title ?? "" });
    }
    for (const v of (mvRes.data ?? []) as Array<{ voting_id: number; vote: string }>) {
      mpVoteByVoting.set(v.voting_id, v.vote as VoteValue);
    }
  }

  const candsByPromise = new Map<number, Array<{ printTerm: number; printNumber: string }>>();
  for (const c of cands) {
    const arr = candsByPromise.get(c.promise_id) ?? [];
    arr.push({ printTerm: c.print_term, printNumber: c.print_number });
    candsByPromise.set(c.promise_id, arr);
  }

  const rows: PromiseAlignmentRow[] = [];
  let alignedCount = 0;
  let againstCount = 0;
  for (const promise of promises) {
    const myCands = candsByPromise.get(promise.id);
    if (!myCands || myCands.length === 0) continue;
    const votes: PromiseAlignmentVote[] = [];
    for (const c of myCands) {
      const pr = printByKey.get(`${c.printTerm}/${c.printNumber}`);
      if (!pr) continue;
      const vid = bestVotingByPrint.get(pr.id);
      if (vid == null) {
        votes.push({
          votingId: -1,
          date: null,
          title: "(brak głosowania)",
          printTerm: c.printTerm,
          printNumber: c.printNumber,
          printShort: pr.short_title,
          vote: "NONE",
        });
        continue;
      }
      const meta = votingMeta.get(vid) ?? { date: null, title: "" };
      const mpVote = (mpVoteByVoting.get(vid) ?? "ABSENT") as VoteValue;
      votes.push({
        votingId: vid,
        date: meta.date,
        title: meta.title,
        printTerm: c.printTerm,
        printNumber: c.printNumber,
        printShort: pr.short_title,
        vote: mpVote,
      });
      if (mpVote === "YES") alignedCount++;
      else if (mpVote === "NO" || mpVote === "ABSTAIN") againstCount++;
    }
    if (votes.length > 0) {
      // newest voting first
      votes.sort((a, b) => {
        const da = a.date ? Date.parse(a.date) : 0;
        const db = b.date ? Date.parse(b.date) : 0;
        return db - da;
      });
      rows.push({ promiseId: promise.id, promiseTitle: promise.title, votes });
    }
  }

  return {
    partyCode,
    rows,
    totalPromises: rows.length,
    alignedCount,
    againstCount,
  };
}
