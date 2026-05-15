import "server-only";

import { normalizeActSourceUrl } from "@/lib/isap";
import { supabase } from "@/lib/supabase";
import { dbTagsToPersonas, type PersonaId } from "@/lib/personas";
import { dbTagsToTopics, type TopicId } from "@/lib/topics";

// Mirrors the CHECK constraint in supabase/migrations/0042_print_document_category.sql.
// Bump in lockstep when extending.
export type DocumentCategory =
  | "projekt_ustawy"
  | "opinia_organu"
  | "sprawozdanie_komisji"
  | "autopoprawka"
  | "wniosek_personalny"
  | "pismo_marszalka"
  | "uchwala_upamietniajaca"
  | "uchwala_senatu"
  | "weto_prezydenta"
  | "wotum_nieufnosci"
  | "wniosek_organizacyjny"
  | "informacja"
  | "inne"
  | null;

// `prints.sponsor_authority` enum (free-text in DB). Coarse origin of the bill.
export type SponsorAuthority =
  | "rzad"
  | "prezydent"
  | "klub_poselski"
  | "senat"
  | "komisja"
  | "prezydium"
  | "obywatele"
  | "inne"
  | null;

export type AffectedGroup = {
  tag: string;
  severity: "low" | "medium" | "high";
  // Population enriched at read-time from `print_affected_with_population` view.
  // Never read from `prints.affected_groups` jsonb — LLM forces null there now.
  estPopulation: number | null;
  sourceYear: number | null;
  sourceNote: string | null;
};

export type BriefItem = {
  id: number;
  term: number;
  number: string;
  shortTitle: string;
  title: string;
  changeDate: string | null;
  impactPunch: string;
  summaryPlain: string | null;
  citizenAction: string | null;
  affectedGroups: AffectedGroup[];
  personas: PersonaId[];
  topics: TopicId[];
  documentCategory: DocumentCategory;
  isProcedural: boolean;
  isMetaDocument: boolean;
  homepageScore: number | null;
  stance: string | null;
  stanceConfidence: number | null;
  sponsorAuthority: SponsorAuthority;
  // Latest process_stages.stage_type for this print's process — feeds the
  // 6-step ProcessStageBar in tygodnik feed. Null when no process linked.
  currentStageType: string | null;
  processPassed: boolean | null;
  // Optional voting summary attached at runtime by BriefList when a vote
  // event in the same sitting links to this print. Lets the print card
  // absorb the vote (no separate "głosowania" duplicate). Null when the
  // print hasn't been voted on yet in this sitting.
  voting: {
    votingId: number;
    votingNumber: number;
    yes: number;
    no: number;
    abstain: number;
    notParticipating: number;
    // Optional semantics for verdict labeling in compact vote bars.
    majorityVotes?: number | null;
    motionPolarity?: import("@/lib/promiseAlignment").MotionPolarity | null;
  } | null;
};

export type PrintDetail = BriefItem & {
  summary: string | null;
  isoClass: number | null;
  documentDate: string | null;
  stance: string | null;
  parentNumber: string | null;
  sponsorAuthority: SponsorAuthority;
  sponsorMps: string[];
  // For sub-prints (opinia/OSR/etc): structured issuer code from migration 0047.
  // NULL on primary projekt_ustawy rows.
  opinionSource: string | null;
};

export type ProcessStage = {
  ord: number;
  depth: number;
  stageName: string;
  stageType: string;
  stageDate: string | null;
  decision: string | null;
  sittingNum: number | null;
  voting: {
    yes?: number;
    no?: number;
    abstain?: number;
    totalVoted?: number;
    notParticipating?: number;
    votingNumber?: number;
    sitting?: number;
    date?: string;
    title?: string;
    topic?: string;
    description?: string;
  } | null;
};

export type LinkedCommitteeSitting = {
  sittingId: number;
  committeeId: number;
  committeeCode: string;
  committeeName: string;
  sittingNum: number;
  date: string | null;
  startAt: string | null;
  endAt: string | null;
  room: string | null;
  status: "FINISHED" | "ONGOING" | "PLANNED" | null;
  matchedPrintNumber: string;
  videoPlayerLink: string | null;
};

// Canonical voting linked to this print via voting_print_links (mig 0047).
// Replaces the prior fragile "sort process_stages.voting JSON by votingNumber".
export type LinkedVoting = {
  votingId: number;
  role: "main" | "autopoprawka" | "sprawozdanie" | "poprawka" | "joint" | "other";
  votingNumber: number;
  sitting: number;
  sittingDay: number;
  date: string;
  title: string;
  yes: number;
  no: number;
  abstain: number;
  notParticipating: number;
  majorityVotes: number | null;
  // Polarity drives the verdict chip on /proces pages — see issue #25 (a failed
  // "wniosek o odrzucenie" must NOT render as "ustawa odrzucona").
  motionPolarity: import("@/lib/promiseAlignment").MotionPolarity | null;
};

export type ClubTally = {
  clubShort: string;
  clubName: string;
  yes: number;
  no: number;
  abstain: number;
  notVoting: number;
  total: number;
};

// Forward-link to a child sub-print (opinion / autopoprawka / OSR / etc).
export type SubPrint = {
  number: string;
  title: string;
  shortTitle: string | null;
  documentCategory: DocumentCategory;
  opinionSource: string | null;
  isProcedural: boolean;
  attachments: string[];
};

// Filename list for a print's attachments (ordered). Empty list = no files.
export type PrintAttachments = {
  number: string;
  filenames: string[];
};

export type MatchedPromise = {
  promiseId: number;
  partyCode: string | null;
  title: string;
  status: string | null;
  matchStatus: "confirmed" | "candidate" | "rejected";
  rationale: string | null;
};

// Final outcome of the legislative process — populated only when
// processes.passed = true. `act` is non-null only after backfill linked
// processes.eli_act_id → acts (i.e. ISAP has published the text).
export type ProcessAct = {
  eliId: string;          // 'DU/2026/305'
  displayAddress: string; // 'Dz.U. 2026 poz. 305'
  title: string | null;
  status: string | null;     // 'obowiązujący' / 'uchylony' / 'wygaszony'
  sourceUrl: string | null;  // direct ISAP link
  publishedAt: string | null;
};

export type ProcessOutcome = {
  passed: boolean;
  closureDate: string | null;
  act: ProcessAct | null;
  // 'URGENT' = tryb pilny (Konst. art. 123). Compressed Senate/President
  // deadlines (14 d / 7 d) and excludes tax, electoral law, kodeksy, etc.
  // Populated from upstream Sejm API processes.urgencyStatus.
  urgencyStatus: "NORMAL" | "URGENT" | null;
  // Raw processes.document_type. Drives whether the "awaiting publication"
  // banner makes sense — wniosek/informacja/lista kandydatów never land
  // in Dz.U. or M.P.
  documentType: string | null;
};

export type MainVotingSeat = {
  mp_id: number;
  club_ref: string | null;
  vote: string;
};

// Agenda point of a plenary sitting where this print was procedowany.
// Two source paths merge per sitting:
//   * agenda_item_prints (mig 0028) — what Sejm scheduled in the porządek
//     obrad. Carries ord + title.
//   * process_stages.sitting_num — what actually happened (I/II/III czytanie,
//     głosowanie, sprawozdanie). Useful when a print was procedowany at a
//     sitting but Sejm never wrote it into the agenda HTML (e.g. druk 2530
//     in sitting 57).
// `agendaItemId` is null on stage-only rows; `stages` is empty on agenda-only.
// statementCount only fires when there's an agenda anchor (statement_print_links
// agenda_item_id key).
export type ProceedingPointStage = {
  stageType: string;
  stageName: string;
  stageDate: string | null;
};

export type ProceedingPoint = {
  agendaItemId: number | null;
  sittingNum: number;
  sittingTitle: string;
  sittingDates: string[];
  ord: number | null;
  title: string | null;
  statementCount: number;
  stages: ProceedingPointStage[];
};

export type PrintWithStages = {
  print: PrintDetail;
  stages: ProcessStage[];
  committeeSittings: LinkedCommitteeSitting[];
  // Canonical "ostatnie głosowanie" — sourced from voting_print_links FK
  // (migration 0047), not from process_stages.voting JSON sort.
  mainVoting: LinkedVoting | null;
  // Per-klub yes/no/abstain tally for mainVoting (from voting_by_club view).
  votingByClub: ClubTally[];
  // Per-MP votes for mainVoting — feeds the HemicycleChart on the druk
  // detail page. Empty when no main voting is linked.
  mainVotingSeats: MainVotingSeat[];
  // All votings linked to this print (incl. mainVoting at index 0). Ranked by
  // role priority then voting_number desc — same order as mainVoting picker.
  relatedVotings: LinkedVoting[];
  // Forward-links: opinia/autopoprawka/OSR sub-prints with structured authority.
  subPrints: SubPrint[];
  // LLM-confirmed promise→print pairs (promise_print_candidates.match_status).
  matchedPromises: MatchedPromise[];
  outcome: ProcessOutcome | null;
  // Attachments for the main print (ordered by ordinal).
  attachments: string[];
  // Plenary sitting agenda points where this print appeared. Grouped per
  // sitting in the UI. Empty when the print never made it to a plenary agenda
  // (e.g. still in committee, or only mentioned indirectly).
  proceedingPoints: ProceedingPoint[];
};

const SELECT_DETAIL =
  "id, term, number, short_title, title, change_date, document_date, impact_punch, summary, summary_plain, iso24495_class, citizen_action, affected_groups, persona_tags, topic_tags, stance, document_category, parent_number, is_procedural, is_meta_document, sponsor_authority, sponsor_mps, opinion_source";

async function fetchAffected(printIds: number[]): Promise<Map<number, AffectedGroup[]>> {
  const out = new Map<number, AffectedGroup[]>();
  if (printIds.length === 0) return out;
  const sb = supabase();
  const { data, error } = await sb
    .from("print_affected_with_population")
    .select("print_id, tag, severity, est_population, source_year, source_note")
    .in("print_id", printIds);
  if (error) throw error;
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const id = r.print_id as number;
    const list = out.get(id) ?? [];
    list.push({
      tag: (r.tag as string) ?? "",
      severity: ((r.severity as string) ?? "low") as AffectedGroup["severity"],
      estPopulation: (r.est_population as number | null) ?? null,
      sourceYear: (r.source_year as number | null) ?? null,
      sourceNote: (r.source_note as string | null) ?? null,
    });
    out.set(id, list);
  }
  return out;
}

export async function getPrint(term: number, number: string): Promise<PrintWithStages | null> {
  const sb = supabase();
  const { data: p, error: pe } = await sb
    .from("prints")
    .select(SELECT_DETAIL)
    .eq("term", term)
    .eq("number", number)
    .limit(1)
    .maybeSingle();
  if (pe) throw pe;
  if (!p) return null;

  const printId = p.id as number;

  // ---------------------------------------------------------------------
  // Phase 1: fire all PostgREST reads that depend only on (term, number,
  // printId) in parallel. Cuts /proces/[term]/[number] TTFB from ~10x RTT
  // to ~3x RTT (worst-case dependent chains: proc -> stages + actRow;
  // subRows -> attRows). All independent reads share one Promise.all.
  //
  // Dependency graph (read after `printId`):
  //   - proc (processes)          — independent  -> drives stagesRows + actRow
  //   - committeeSittingRows      — independent
  //   - linkedRows (voting links) — independent  -> drives clubsRes + seatsRes
  //   - subRows                   — independent  -> drives attRows
  //   - matchRows (promises)      — independent
  //   - aipRows (agenda items)    — independent
  //   - linkRows (stmt prints)    — independent
  //   - affectedMap               — independent (own helper, RPC)
  // ---------------------------------------------------------------------
  const [
    procRes,
    committeeSittingRowsRes,
    linkedRowsRes,
    subRowsRes,
    matchRowsRes,
    aipRowsRes,
    stmtLinkRowsRes,
    affectedMap,
  ] = await Promise.all([
    sb
      .from("processes")
      .select("id, passed, eli, display_address, eli_act_id, closure_date, urgency_status, document_type")
      .eq("term", term)
      .eq("number", number)
      .limit(1)
      .maybeSingle(),
    sb
      .from("print_committee_sittings_v")
      .select(
        "sitting_id, committee_id, committee_code, committee_name, sitting_num, date, start_at, end_at, room, status, matched_print_number, video_player_link",
      )
      .eq("print_id", printId)
      .order("date", { ascending: false, nullsFirst: false })
      .order("sitting_num", { ascending: false }),
    sb
      .from("voting_print_links")
      .select("voting_id, role, votings:voting_id(id, term, sitting, sitting_day, voting_number, date, title, yes, no, abstain, not_participating, majority_votes, motion_polarity)")
      .eq("print_id", printId),
    sb
      .from("prints")
      .select("id, number, title, short_title, document_category, opinion_source, is_procedural")
      .eq("term", term)
      .eq("parent_number", number)
      .order("number", { ascending: true }),
    sb
      .from("promise_print_candidates")
      .select("promise_id, match_status, match_rationale, promises:promise_id(id, party_code, title, status)")
      .eq("print_term", term)
      .eq("print_number", number)
      .eq("match_status", "confirmed"),
    sb
      .from("agenda_item_prints")
      .select(
        "agenda_items:agenda_item_id(id, ord, title, proceedings:proceeding_id(number, title, dates))",
      )
      .eq("term", term)
      .eq("print_number", number),
    sb
      .from("statement_print_links")
      .select("agenda_item_id")
      .eq("print_id", printId)
      .not("agenda_item_id", "is", null),
    fetchAffected([printId]),
  ]);

  // Surface PostgREST errors from Phase 1. Without these, transient 503 /
  // RLS failures silently produce a partial page (empty relatedVotings,
  // empty subPrints, missing proceedingPoints) that revalidate then caches
  // for 5 minutes. Better to fail the request and let the next hit retry.
  if (procRes.error) throw procRes.error;
  if (committeeSittingRowsRes.error) throw committeeSittingRowsRes.error;
  if (linkedRowsRes.error) throw linkedRowsRes.error;
  if (subRowsRes.error) throw subRowsRes.error;
  if (matchRowsRes.error) throw matchRowsRes.error;
  if (aipRowsRes.error) throw aipRowsRes.error;
  if (stmtLinkRowsRes.error) throw stmtLinkRowsRes.error;

  const proc = procRes.data;
  const committeeSittingRows = committeeSittingRowsRes.data;
  const linkedRows = linkedRowsRes.data;
  const subRows = subRowsRes.data;
  const matchRows = matchRowsRes.data;
  const aipRows = aipRowsRes.data;
  const stmtLinkRows = stmtLinkRowsRes.data;

  // ---------------------------------------------------------------------
  // Phase 2: dependent reads (chained after Phase 1 resolved).
  //   - process_stages       depends on proc.id
  //   - acts (actRow)        depends on proc.eli_act_id
  //   - print_attachments    depends on subRows ids + printId
  //   - voting_by_club/votes depends on mainVoting (computed from linkedRows)
  // Run these in parallel where possible.
  // ---------------------------------------------------------------------
  const processId = (proc?.id as number | undefined) ?? -1;
  const eliActId = (proc?.eli_act_id as number | null) ?? null;
  const subIds = (subRows ?? []).map((r) => r.id as number);
  const printIdsForAtt = [printId, ...subIds];

  const [stagesResP2, actRowResP2, attRowsResP2] = await Promise.all([
    sb
      .from("process_stages")
      .select("ord, depth, stage_name, stage_type, stage_date, decision, sitting_num, voting, process_id")
      .eq("process_id", processId)
      .order("ord", { ascending: true }),
    eliActId
      ? sb
          .from("acts")
          .select("eli_id, title, status, source_url, promulgation_date")
          .eq("id", eliActId)
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    sb
      .from("print_attachments")
      .select("print_id, ordinal, filename")
      .in("print_id", printIdsForAtt)
      .order("ordinal", { ascending: true }),
  ]);

  if (stagesResP2.error) throw stagesResP2.error;
  if (actRowResP2.error) throw actRowResP2.error;
  if (attRowsResP2.error) throw attRowsResP2.error;
  const stagesRows = stagesResP2.data;
  const actRow = actRowResP2.data;
  const attRows = attRowsResP2.data;

  // Build outcome — link the act row only when the backfill connected it.
  let outcome: ProcessOutcome | null = null;
  if (proc) {
    let act: ProcessAct | null = null;
    if (actRow) {
      // Real column name is promulgation_date (date of publication in
      // Dz.U./M.P.). announcement_date is the dated upstream of that.
      act = {
        eliId: (actRow.eli_id as string) ?? "",
        displayAddress: (proc.display_address as string) ?? "",
        title: (actRow.title as string) ?? null,
        status: (actRow.status as string) ?? null,
        sourceUrl: normalizeActSourceUrl(
          (actRow.source_url as string) ?? null,
          (actRow.eli_id as string) ?? null,
        ),
        publishedAt: (actRow.promulgation_date as string) ?? null,
      };
    }
    const us = (proc.urgency_status as string | null) ?? null;
    outcome = {
      passed: !!proc.passed,
      closureDate: (proc.closure_date as string) ?? null,
      act,
      urgencyStatus: us === "URGENT" || us === "NORMAL" ? us : null,
      documentType: (proc.document_type as string | null) ?? null,
    };
  }

  const stages: ProcessStage[] = (stagesRows ?? []).map((r): ProcessStage => ({
    ord: r.ord as number,
    depth: r.depth as number,
    stageName: (r.stage_name as string) ?? "",
    stageType: (r.stage_type as string) ?? "",
    stageDate: (r.stage_date as string) ?? null,
    decision: (r.decision as string) ?? null,
    sittingNum: (r.sitting_num as number | null) ?? null,
    voting: (r.voting as ProcessStage["voting"]) ?? null,
  }));
  const committeeSittings: LinkedCommitteeSitting[] = (committeeSittingRows ?? []).map((r) => ({
    sittingId: (r.sitting_id as number) ?? 0,
    committeeId: (r.committee_id as number) ?? 0,
    committeeCode: (r.committee_code as string) ?? "",
    committeeName: (r.committee_name as string) ?? "",
    sittingNum: (r.sitting_num as number) ?? 0,
    date: (r.date as string | null) ?? null,
    startAt: (r.start_at as string | null) ?? null,
    endAt: (r.end_at as string | null) ?? null,
    room: (r.room as string | null) ?? null,
    status: ((r.status as string | null) ?? null) as LinkedCommitteeSitting["status"],
    matchedPrintNumber: (r.matched_print_number as string) ?? "",
    videoPlayerLink: (r.video_player_link as string | null) ?? null,
  }));

  // Canonical voting from voting_print_links FK (mig 0047). Role priority:
  // main > sprawozdanie > autopoprawka > poprawka > joint > other; tiebreak
  // by voting_number desc. Replaces the prior "sort stage JSON by votingNumber"
  // heuristic that broke on multi-print votings + autopoprawki.
  const ROLE_RANK: Record<string, number> = {
    main: 0, sprawozdanie: 1, autopoprawka: 2, poprawka: 3, joint: 4, other: 5,
  };
  let mainVoting: LinkedVoting | null = null;
  let relatedVotings: LinkedVoting[] = [];
  if (linkedRows && linkedRows.length > 0) {
    const ranked = (linkedRows as Array<{ role: string; votings: Record<string, unknown> | Record<string, unknown>[] | null }>)
      .map((r) => {
        const v = Array.isArray(r.votings) ? r.votings[0] : r.votings;
        return v ? { role: r.role, v } : null;
      })
      .filter((x): x is { role: string; v: Record<string, unknown> } => !!x)
      .sort((a, b) => {
        const ra = ROLE_RANK[a.role] ?? 9;
        const rb = ROLE_RANK[b.role] ?? 9;
        if (ra !== rb) return ra - rb;
        return ((b.v.voting_number as number) ?? 0) - ((a.v.voting_number as number) ?? 0);
      });
    relatedVotings = ranked.map(({ role, v }) => ({
      votingId: v.id as number,
      role: role as LinkedVoting["role"],
      votingNumber: (v.voting_number as number) ?? 0,
      sitting: (v.sitting as number) ?? 0,
      sittingDay: (v.sitting_day as number) ?? 0,
      date: (v.date as string) ?? "",
      title: (v.title as string) ?? "",
      yes: (v.yes as number) ?? 0,
      no: (v.no as number) ?? 0,
      abstain: (v.abstain as number) ?? 0,
      notParticipating: (v.not_participating as number) ?? 0,
      majorityVotes: (v.majority_votes as number | null) ?? null,
      motionPolarity: (v.motion_polarity as LinkedVoting["motionPolarity"]) ?? null,
    }));
    if (relatedVotings.length > 0) mainVoting = relatedVotings[0];
  }

  // Per-club tally for the canonical voting (view voting_by_club from mig 0047).
  let votingByClub: ClubTally[] = [];
  let mainVotingSeats: MainVotingSeat[] = [];
  if (mainVoting) {
    const [clubsRes, seatsRes] = await Promise.all([
      sb
        .from("voting_by_club")
        .select("club_short, club_name, yes, no, abstain, not_voting, total")
        .eq("voting_id", mainVoting.votingId)
        .order("yes", { ascending: false }),
      // Per-MP votes for the HemicycleChart on the druk page. Same query
      // shape used by the tygodnik feed enricher in lib/db/events.ts.
      sb
        .from("votes")
        .select("mp_id, club_ref, vote")
        .eq("voting_id", mainVoting.votingId),
    ]);
    votingByClub = (clubsRes.data ?? []).map((r) => ({
      clubShort: (r.club_short as string) ?? "",
      clubName: (r.club_name as string) ?? "",
      yes: (r.yes as number) ?? 0,
      no: (r.no as number) ?? 0,
      abstain: (r.abstain as number) ?? 0,
      notVoting: (r.not_voting as number) ?? 0,
      total: (r.total as number) ?? 0,
    }));
    mainVotingSeats = ((seatsRes.data ?? []) as MainVotingSeat[]).map((r) => ({
      mp_id: r.mp_id,
      club_ref: r.club_ref,
      vote: r.vote,
    }));
  }

  // Forward-link sub-prints (opinia/OSR/autopoprawka) — by parent_number FK.
  // subRows + attRows already fetched in Phase 1 / Phase 2 above.
  const attByPrint = new Map<number, string[]>();
  for (const r of (attRows ?? []) as Array<{ print_id: number; filename: string }>) {
    const list = attByPrint.get(r.print_id) ?? [];
    list.push(r.filename);
    attByPrint.set(r.print_id, list);
  }

  const subPrints: SubPrint[] = (subRows ?? []).map((r) => ({
    number: (r.number as string) ?? "",
    title: (r.title as string) ?? "",
    shortTitle: (r.short_title as string) ?? null,
    documentCategory: ((r.document_category as string) ?? null) as DocumentCategory,
    opinionSource: (r.opinion_source as string) ?? null,
    isProcedural: !!r.is_procedural,
    attachments: attByPrint.get(r.id as number) ?? [],
  }));
  const attachments = attByPrint.get(printId) ?? [];

  // LLM-confirmed promise→print pairs (promise_print_candidates, mig 0046).
  // Show only confirmed; "candidate" rank stays in the matcher pool but
  // would polluate the print page with weak hits. matchRows fetched in Phase 1.
  const matchedPromises: MatchedPromise[] = (matchRows ?? [])
    .map((r): MatchedPromise | null => {
      const raw = (r as { promises: Record<string, unknown> | Record<string, unknown>[] | null }).promises;
      const pm = Array.isArray(raw) ? raw[0] : raw;
      if (!pm) return null;
      return {
        promiseId: (pm.id as number) ?? (r.promise_id as number),
        partyCode: (pm.party_code as string) ?? null,
        title: (pm.title as string) ?? "",
        status: (pm.status as string) ?? null,
        matchStatus: "confirmed",
        rationale: (r.match_rationale as string) ?? null,
      };
    })
    .filter((x): x is MatchedPromise => !!x);

  // Plenary agenda points (mig 0028) where this print is referenced. Joined
  // up to proceedings for sitting num/title/dates. aipRows + stmtLinkRows
  // already fetched in Phase 1.
  type AgendaItemJoined = {
    id: number;
    ord: number;
    title: string;
    proceedings: { number: number; title: string; dates: string[] } | { number: number; title: string; dates: string[] }[] | null;
  };
  const agendaItems: AgendaItemJoined[] = (aipRows ?? [])
    .map((r) => {
      const ai = (r as { agenda_items: AgendaItemJoined | AgendaItemJoined[] | null }).agenda_items;
      return Array.isArray(ai) ? ai[0] : ai;
    })
    .filter((x): x is AgendaItemJoined => !!x);

  const stmtCountByItem = new Map<number, number>();
  if (agendaItems.length > 0) {
    for (const r of (stmtLinkRows ?? []) as Array<{ agenda_item_id: number }>) {
      stmtCountByItem.set(r.agenda_item_id, (stmtCountByItem.get(r.agenda_item_id) ?? 0) + 1);
    }
  }

  // Source A: agenda_item_prints rows (what Sejm scheduled).
  const agendaPoints = agendaItems
    .map((ai) => {
      const proc = Array.isArray(ai.proceedings) ? ai.proceedings[0] : ai.proceedings;
      if (!proc) return null;
      return {
        agendaItemId: ai.id as number | null,
        sittingNum: proc.number,
        sittingTitle: proc.title,
        sittingDates: proc.dates ?? [],
        ord: ai.ord as number | null,
        title: ai.title as string | null,
        statementCount: stmtCountByItem.get(ai.id) ?? 0,
        stages: [] as ProceedingPointStage[],
      };
    })
    .filter((x): x is ProceedingPoint => !!x);

  // Source B: process_stages with sitting_num set (what actually happened on
  // the floor — I/II czytanie, głosowanie, sprawozdanie). Reuse stagesRows
  // already fetched above for the Timeline — same columns, same filter, no
  // need for a second roundtrip.
  const stagesBySitting = new Map<number, ProceedingPointStage[]>();
  for (const r of stagesRows ?? []) {
    const sittingNum = r.sitting_num as number | null;
    if (sittingNum == null) continue;
    const list = stagesBySitting.get(sittingNum) ?? [];
    list.push({
      stageType: (r.stage_type as string) ?? "",
      stageName: (r.stage_name as string) ?? "",
      stageDate: (r.stage_date as string) ?? null,
    });
    stagesBySitting.set(sittingNum, list);
  }

  // Backfill sitting metadata for stage-only sittings (no agenda anchor → no
  // proceedings join available yet). One query scoped to the delta.
  const haveSittingNums = new Set(agendaPoints.map((p) => p.sittingNum));
  const sittingMeta = new Map<number, { title: string; dates: string[] }>();
  const missingSittings = [...stagesBySitting.keys()].filter((n) => !haveSittingNums.has(n));
  if (missingSittings.length > 0) {
    const { data: procRows } = await sb
      .from("proceedings")
      .select("number, title, dates")
      .eq("term", term)
      .in("number", missingSittings);
    for (const r of (procRows ?? []) as Array<{ number: number; title: string; dates: string[] }>) {
      sittingMeta.set(r.number, { title: r.title, dates: r.dates ?? [] });
    }
  }

  // Merge per sitting. When both sources hit the same sitting, stages attach
  // to the FIRST agenda point of that sitting (typical: 1 agenda item → 1-2
  // stages = czytanie + głosowanie). Stage-only sittings (e.g. Sejm proceduje
  // bez wpisu do agenda_html, jak druk 2530 w 57.) get one synthetic row.
  const seenSittings = new Set<number>();
  const proceedingPoints: ProceedingPoint[] = [];
  for (const ap of agendaPoints) {
    const stages = !seenSittings.has(ap.sittingNum)
      ? (stagesBySitting.get(ap.sittingNum) ?? [])
      : [];
    proceedingPoints.push({ ...ap, stages });
    seenSittings.add(ap.sittingNum);
  }
  for (const sn of stagesBySitting.keys()) {
    if (seenSittings.has(sn)) continue;
    const meta = sittingMeta.get(sn);
    if (!meta) continue;
    proceedingPoints.push({
      agendaItemId: null,
      sittingNum: sn,
      sittingTitle: meta.title,
      sittingDates: meta.dates,
      ord: null,
      title: null,
      statementCount: 0,
      stages: stagesBySitting.get(sn) ?? [],
    });
    seenSittings.add(sn);
  }
  proceedingPoints.sort((a, b) => {
    if (a.sittingNum !== b.sittingNum) return a.sittingNum - b.sittingNum;
    return (a.ord ?? Number.MAX_SAFE_INTEGER) - (b.ord ?? Number.MAX_SAFE_INTEGER);
  });

  const sponsorMpsRaw = p.sponsor_mps as unknown;
  const sponsorMps: string[] = Array.isArray(sponsorMpsRaw)
    ? (sponsorMpsRaw.filter((x) => typeof x === "string") as string[])
    : [];

  const detail: PrintDetail = {
    id: printId,
    term: p.term as number,
    number: p.number as string,
    shortTitle: (p.short_title as string) ?? "",
    title: (p.title as string) ?? "",
    changeDate: (p.change_date as string) ?? null,
    documentDate: (p.document_date as string) ?? null,
    impactPunch: (p.impact_punch as string) ?? "",
    summary: (p.summary as string) ?? null,
    summaryPlain: (p.summary_plain as string) ?? null,
    isoClass: (p.iso24495_class as number | null) ?? null,
    citizenAction: (p.citizen_action as string) ?? null,
    affectedGroups: affectedMap.get(printId) ?? [],
    personas: dbTagsToPersonas(p.persona_tags as string[] | null),
    topics: dbTagsToTopics(p.topic_tags as string[] | null),
    stance: (p.stance as string) ?? null,
    documentCategory: ((p.document_category as string) ?? null) as DocumentCategory,
    parentNumber: (p.parent_number as string) ?? null,
    isProcedural: !!p.is_procedural,
    isMetaDocument: !!p.is_meta_document,
    homepageScore: null,
    sponsorAuthority: ((p.sponsor_authority as string) ?? null) as SponsorAuthority,
    sponsorMps,
    opinionSource: (p.opinion_source as string) ?? null,
    stanceConfidence: null,
    currentStageType: null,
    processPassed: null,
    voting: null,
  };

  return {
    print: detail,
    stages,
    committeeSittings,
    mainVoting,
    votingByClub,
    mainVotingSeats,
    relatedVotings,
    subPrints,
    matchedPromises,
    outcome,
    attachments,
    proceedingPoints,
  };
}

// Per-sitting (posiedzenie) metadata for the Tygodnik archive index + nav.
// Sourced from `tygodnik_sittings` view (mig 0059) which joins proceedings
// against `print_sitting_assignment` to give us eligible-print counts.
export type SittingInfo = {
  term: number;
  sittingNum: number;          // proceedings.number — the issue number
  title: string;               // e.g. "56. Posiedzenie Sejmu RP w dniach 28, 29 i 30 kwietnia 2026 r."
  firstDate: string;           // YYYY-MM-DD
  lastDate: string;
  printCount: number;          // eligible Tygodnik prints
};

export async function getSittingsIndex(term = 10): Promise<SittingInfo[]> {
  const sb = supabase();
  const { data, error } = await sb
    .from("tygodnik_sittings")
    .select("term, sitting_num, sitting_title, first_date, last_date, print_count")
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
  }));
}

// Latest sitting (highest sitting_num) that actually has eligible prints.
// Used to default `/tygodnik` to the most recent non-empty issue — the
// current sitting is often "in progress" with 0 enriched prints yet.
export async function getLatestSittingWithPrints(term = 10): Promise<SittingInfo | null> {
  const sb = supabase();
  const { data, error } = await sb
    .from("tygodnik_sittings")
    .select("term, sitting_num, sitting_title, first_date, last_date, print_count")
    .eq("term", term)
    .gt("print_count", 0)
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
  };
}

// Per-sitting Tygodnik feed. Same filters as `getBriefItems` (projekt_ustawy
// only, non-meta, non-procedural, has impact_punch); scoped to one sitting
// via `print_sitting_assignment`. Ranked by homepage_score DESC.
export async function getBriefItemsBySitting(term: number, sittingNum: number): Promise<BriefItem[]> {
  const sb = supabase();

  // 1. Print IDs assigned to this sitting.
  const { data: assigned, error: ae } = await sb
    .from("print_sitting_assignment")
    .select("print_id")
    .eq("term", term)
    .eq("sitting_num", sittingNum);
  if (ae) throw ae;
  const ids = (assigned ?? []).map((r) => r.print_id as number);
  if (ids.length === 0) return [];

  // 2. Score lookup (filtered by view's eligibility).
  const { data: scored, error: se } = await sb
    .from("print_homepage_score")
    .select("print_id, homepage_score, is_meta_document, is_procedural")
    .in("print_id", ids)
    .eq("is_meta_document", false)
    .eq("is_procedural", false);
  if (se) throw se;
  const eligibleIds = (scored ?? []).map((r) => r.print_id as number);
  if (eligibleIds.length === 0) return [];
  const scoreById = new Map<number, number>();
  for (const r of scored ?? []) scoreById.set(r.print_id as number, (r.homepage_score as number) ?? 0);

  // 3. Hydrate prints metadata (only ones with impact_punch).
  const { data, error } = await sb
    .from("prints")
    .select(
      "id, term, number, short_title, title, change_date, impact_punch, summary_plain, citizen_action, persona_tags, topic_tags, document_category, is_procedural, is_meta_document",
    )
    .in("id", eligibleIds)
    .not("impact_punch", "is", null);
  if (error) throw error;

  const printIds = (data ?? []).map((r) => r.id as number);
  const affectedMap = await fetchAffected(printIds);

  const items: BriefItem[] = (data ?? []).map((r): BriefItem => ({
    id: r.id as number,
    term: r.term as number,
    number: r.number as string,
    shortTitle: (r.short_title as string) ?? "",
    title: (r.title as string) ?? "",
    changeDate: (r.change_date as string) ?? null,
    impactPunch: (r.impact_punch as string) ?? "",
    summaryPlain: (r.summary_plain as string) ?? null,
    citizenAction: (r.citizen_action as string) ?? null,
    affectedGroups: affectedMap.get(r.id as number) ?? [],
    personas: dbTagsToPersonas(r.persona_tags as string[] | null),
    topics: dbTagsToTopics(r.topic_tags as string[] | null),
    documentCategory: ((r.document_category as string) ?? null) as DocumentCategory,
    isProcedural: !!r.is_procedural,
    isMetaDocument: !!r.is_meta_document,
    homepageScore: scoreById.get(r.id as number) ?? null,
    stance: null,
    stanceConfidence: null,
    sponsorAuthority: null,
    currentStageType: null,
    processPassed: null,
    voting: null,
  }));

  items.sort((a, b) => {
    const sa = a.homepageScore ?? 0;
    const sb2 = b.homepageScore ?? 0;
    if (sb2 !== sa) return sb2 - sa;
    const da = a.changeDate ? Date.parse(a.changeDate) : 0;
    const db = b.changeDate ? Date.parse(b.changeDate) : 0;
    return db - da;
  });

  return items;
}

// Tygodnik feed — real bills only, ranked by `print_homepage_score` view.
// Filters mirror the user-supplied default sort:
//   document_category = 'projekt_ustawy'
//   AND is_meta_document = false
//   AND COALESCE(is_procedural, false) = false
//   AND impact_punch IS NOT NULL
// Order: homepage_score DESC, change_date DESC.
export async function getBriefItems(): Promise<BriefItem[]> {
  const sb = supabase();

  // 1. Pull eligible IDs + scores from the homepage_score view.
  const { data: scored, error: se } = await sb
    .from("print_homepage_score")
    .select("print_id, homepage_score, is_meta_document, is_procedural")
    .eq("is_meta_document", false)
    .eq("is_procedural", false)
    .order("homepage_score", { ascending: false })
    .limit(60);
  if (se) throw se;
  const ids = (scored ?? []).map((r) => r.print_id as number);
  if (ids.length === 0) return [];
  const scoreById = new Map<number, number>();
  for (const r of scored ?? []) scoreById.set(r.print_id as number, (r.homepage_score as number) ?? 0);

  // 2. Hydrate prints metadata (only ones with impact_punch).
  const { data, error } = await sb
    .from("prints")
    .select(
      "id, term, number, short_title, title, change_date, impact_punch, summary_plain, citizen_action, persona_tags, topic_tags, document_category, is_procedural, is_meta_document",
    )
    .in("id", ids)
    .not("impact_punch", "is", null)
    .limit(60);
  if (error) throw error;

  // 3. Pull affected_groups + populations in one query for all eligible prints.
  const printIds = (data ?? []).map((r) => r.id as number);
  const affectedMap = await fetchAffected(printIds);

  const items: BriefItem[] = (data ?? []).map((r): BriefItem => ({
    id: r.id as number,
    term: r.term as number,
    number: r.number as string,
    shortTitle: (r.short_title as string) ?? "",
    title: (r.title as string) ?? "",
    changeDate: (r.change_date as string) ?? null,
    impactPunch: (r.impact_punch as string) ?? "",
    summaryPlain: (r.summary_plain as string) ?? null,
    citizenAction: (r.citizen_action as string) ?? null,
    affectedGroups: affectedMap.get(r.id as number) ?? [],
    personas: dbTagsToPersonas(r.persona_tags as string[] | null),
    topics: dbTagsToTopics(r.topic_tags as string[] | null),
    documentCategory: ((r.document_category as string) ?? null) as DocumentCategory,
    isProcedural: !!r.is_procedural,
    isMetaDocument: !!r.is_meta_document,
    homepageScore: scoreById.get(r.id as number) ?? null,
    stance: null,
    stanceConfidence: null,
    sponsorAuthority: null,
    currentStageType: null,
    processPassed: null,
    voting: null,
  }));

  // 4. Final sort: homepage_score DESC, then change_date DESC.
  items.sort((a, b) => {
    const sa = a.homepageScore ?? 0;
    const sb2 = b.homepageScore ?? 0;
    if (sb2 !== sa) return sb2 - sa;
    const da = a.changeDate ? Date.parse(a.changeDate) : 0;
    const db = b.changeDate ? Date.parse(b.changeDate) : 0;
    return db - da;
  });

  return items.slice(0, 30);
}
