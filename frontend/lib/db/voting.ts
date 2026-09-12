import "server-only";

import { supabase } from "@/lib/supabase";
import type { SeatVote } from "@/components/tygodnik/HemicycleChart";

export type VotingHeader = {
  voting_id: number;
  voting_number: number;
  title: string;
  date: string;
  yes: number;
  no: number;
  abstain: number;
  not_participating: number;
  total_voted: number;
  sitting: number;
  sitting_day: number;
  term: number;
  majority_type: string | null;
  majority_votes: number | null;
  present: number | null;
  topic: string | null;
  description: string | null;
  kind: string | null;
  // Classifier label from `classify_motion_polarity()` (migration 0087).
  // Drives polarity-aware timeline copy on /glosowanie/[id] — see issue #25.
  motion_polarity: import("@/lib/promiseAlignment").MotionPolarity | null;
};

export type ClubTallyRow = {
  club_short: string;
  club_name: string;
  yes: number;
  no: number;
  abstain: number;
  not_voting: number;
  total: number;
};

export type VotingListItem = {
  id: number;
  voting_number: number;
  title: string;
  date: string;
  sitting: number;
  yes: number;
  no: number;
  abstain: number;
};

export async function getAllVotings(term = 10): Promise<VotingListItem[]> {
  const sb = supabase();
  const PAGE = 1000;
  const rows: VotingListItem[] = [];
  let from = 0;
  // Term 10 has thousands of votings; PostgREST caps each request at ~1000 rows.
  while (true) {
    const { data, error } = await sb
      .from("votings")
      .select("id, voting_number, title, date, sitting, yes, no, abstain")
      .eq("term", term)
      .order("date", { ascending: false })
      .order("voting_number", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as VotingListItem[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

export async function getVotingHeader(votingId: number): Promise<VotingHeader | null> {
  const sb = supabase();
  const { data, error } = await sb
    .from("votings")
    .select("id, term, voting_number, title, date, yes, no, abstain, not_participating, total_voted, sitting, sitting_day, majority_type, majority_votes, present, topic, description, kind, motion_polarity")
    .eq("id", votingId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    voting_id: data.id as number,
    voting_number: data.voting_number as number,
    title: (data.title as string) ?? "",
    date: data.date as string,
    yes: data.yes as number,
    no: data.no as number,
    abstain: data.abstain as number,
    not_participating: data.not_participating as number,
    total_voted: data.total_voted as number,
    sitting: data.sitting as number,
    sitting_day: data.sitting_day as number,
    term: data.term as number,
    majority_type: (data.majority_type as string) ?? null,
    majority_votes: (data.majority_votes as number) ?? null,
    present: (data.present as number) ?? null,
    topic: (data.topic as string) ?? null,
    description: (data.description as string) ?? null,
    kind: (data.kind as string) ?? null,
    motion_polarity: (data.motion_polarity as VotingHeader["motion_polarity"]) ?? null,
  };
}

export async function getVotingClubs(votingId: number): Promise<ClubTallyRow[]> {
  const sb = supabase();
  const { data, error } = await sb
    .from("voting_by_club_mv")
    .select("club_short, club_name, yes, no, abstain, not_voting, total")
    .eq("voting_id", votingId);
  if (error) throw error;
  return (data ?? []) as ClubTallyRow[];
}

export async function getVotingSeats(votingId: number): Promise<SeatVote[]> {
  const sb = supabase();
  // Page through if needed; PostgREST default cap is 1000 rows — 460 MPs fits.
  const { data, error } = await sb
    .from("votes")
    .select("mp_id, club_ref, vote")
    .eq("voting_id", votingId);
  if (error) throw error;
  return (data ?? []) as SeatVote[];
}

export type VotingFullPayload = {
  header: VotingHeader;
  clubs: ClubTallyRow[];
  seats: SeatVote[];
  linkedPrint: { number: string; short_title: string | null } | null;
};

export async function getVotingFull(votingId: number): Promise<VotingFullPayload | null> {
  const sb = supabase();
  const [header, clubs, seats] = await Promise.all([
    getVotingHeader(votingId),
    getVotingClubs(votingId),
    getVotingSeats(votingId),
  ]);
  if (!header) return null;
  // Linked print via voting_print_links role priority.
  const { data: linksRaw } = await sb
    .from("voting_print_links")
    .select("print_id, role")
    .eq("voting_id", votingId);
  let linkedPrint: VotingFullPayload["linkedPrint"] = null;
  if (linksRaw && linksRaw.length > 0) {
    const ROLE_RANK: Record<string, number> = {
      sprawozdanie: 1, main: 2, joint: 3, poprawka: 4, autopoprawka: 5,
    };
    const top = [...linksRaw as Array<{ print_id: number; role: string }>]
      .sort((a, b) => (ROLE_RANK[a.role] ?? 9) - (ROLE_RANK[b.role] ?? 9))[0];
    const { data: pr } = await sb
      .from("prints")
      .select("number, short_title")
      .eq("id", top.print_id)
      .maybeSingle();
    if (pr) linkedPrint = { number: pr.number as string, short_title: (pr.short_title as string) ?? null };
  }
  return { header, clubs, seats, linkedPrint };
}

// ─────────────────────────────────────────────────────────────────────────────
// New voting detail page payload — design redesign per VOTING_REDESIGN_SPEC.md
// ─────────────────────────────────────────────────────────────────────────────

import { predictStages, type PredictedStage } from "@/lib/voting/predict_stages";
import { KLUB_COLORS } from "@/lib/atlas/constants";

// Canonical seating order (left → right) for the term-10 plenary chamber.
// Source: Sejm.gov.pl + PolsatNews/Wprost coverage of the X kadencja seating
// chart. Lewica/Razem on far left, PiS on far right. Confederation sits
// between PSL and PiS. Independents and smaller splinter groups (Centrum,
// Demokracja) cluster around the center.
export const SEATING_ORDER: readonly string[] = [
  "Razem",
  "Lewica",
  "KO",
  "Polska2050",
  "PSL-TD",
  "Demokracja",
  "Centrum",
  "niez.",
  "Konfederacja",
  "Konfederacja_KP",
  "Republikanie",
  "PiS",
];

export type ClubBreakdownRow = ClubTallyRow & {
  club_ref: string;
  clubColor: string;
  dominant: "YES" | "NO" | "ABSTAIN";
  differentCount: number;
  disciplineLabel: "ZA" | "PRZECIW" | "WSTRZ." | "brak przewagi" | "—";
};

export type Seat = {
  mp_id: number;
  club_ref: string;
  club_color: string;
  vote: "YES" | "NO" | "ABSTAIN" | "ABSENT" | "EXCUSED";
  mp_name: string;
  district_num: number | null;
  district_name: string | null;
  photo_url: string | null;
};

export type Rebel = {
  mp_id: number;
  name: string;
  club_ref: string;
  club_label: string;
  expected: "YES" | "NO" | "ABSTAIN";
  actual: "YES" | "NO" | "ABSTAIN";
  district_num: number | null;
  district_name: string | null;
  photo_url: string | null;
};

export type LinkedPrintRich = {
  id: number;
  number: string;
  parent_number: string | null;
  short_title: string | null;
  summary_plain: string | null;
  impact_punch: string | null;
  affected_groups: Array<{ tag?: string; description?: string; est_population?: number }> | null;
  iso24495_class: string | null;
};

export type VotingPageData = {
  header: VotingHeader;
  passed: boolean;
  clubs: ClubBreakdownRow[];
  seats: Seat[];
  rebels: Rebel[];
  linkedPrint: LinkedPrintRich | null;
  predictedStages: PredictedStage[];
  promiseLink: { id: number; party_code: string; title: string } | null;
  relatedVotings: Array<{ id: number; voting_number: number; sitting: number; date: string; yes: number; no: number }>;
};

const VOTE_LABEL_FROM_DOMINANT: Record<"YES" | "NO" | "ABSTAIN", "ZA" | "PRZECIW" | "WSTRZ."> = {
  YES: "ZA", NO: "PRZECIW", ABSTAIN: "WSTRZ.",
};

function dominantVote(row: { yes: number; no: number; abstain: number }): "YES" | "NO" | "ABSTAIN" {
  // Deterministic tie order; ties are excluded from majority comparisons.
  if (row.yes >= row.no && row.yes >= row.abstain) return "YES";
  if (row.no >= row.abstain) return "NO";
  return "ABSTAIN";
}

function isPassed(header: VotingHeader): boolean {
  // majority_votes is the precomputed threshold (handles SIMPLE_MAJORITY, ABSOLUTE_MAJORITY,
  // CONSTITUTIONAL_MAJORITY). When null, fall back to yes > no.
  if (header.majority_votes != null) return header.yes >= header.majority_votes;
  return header.yes > header.no;
}

export async function getVotingPageData(votingId: number): Promise<VotingPageData | null> {
  const sb = supabase();

  const header = await getVotingHeader(votingId);
  if (!header) return null;
  const passed = isPassed(header);

  // ─── Parallel fan-out: clubs, seats (votes joined to mps), print link ───
  const [clubsRaw, seatsRaw, printLinks] = await Promise.all([
    sb.from("voting_by_club_mv")
      .select("club_short, club_name, yes, no, abstain, not_voting, total")
      .eq("voting_id", votingId),
    // Pull votes; join to mps in a second query for naming/district fields. We
    // can't `select("*, mps(...)")` because Supabase auto-FK detection isn't
    // configured for these tables. Two-step is fine — 460 rows.
    sb.from("votes")
      .select("mp_id, club_ref, vote")
      .eq("voting_id", votingId),
    sb.from("voting_print_links")
      .select("print_id, role")
      .eq("voting_id", votingId),
  ]);

  if (clubsRaw.error) throw clubsRaw.error;
  if (seatsRaw.error) throw seatsRaw.error;
  if (printLinks.error) throw printLinks.error;

  const voteRows = (seatsRaw.data ?? []) as Array<{ mp_id: number; club_ref: string | null; vote: string }>;
  const mpIds = Array.from(new Set(voteRows.map(v => v.mp_id)));

  // ─── MPs lookup (for seats + rebels) ───
  const { data: mpsRaw, error: mpsErr } = await sb
    .from("mps")
    .select("mp_id, first_last_name, district_num, district_name, photo_url")
    .in("mp_id", mpIds);
  if (mpsErr) throw mpsErr;
  const mpById = new Map<number, { name: string; district_num: number | null; district_name: string | null; photo_url: string | null }>();
  for (const m of (mpsRaw ?? []) as Array<{ mp_id: number; first_last_name: string; district_num: number | null; district_name: string | null; photo_url: string | null }>) {
    mpById.set(m.mp_id, {
      name: m.first_last_name,
      district_num: m.district_num,
      district_name: m.district_name,
      photo_url: m.photo_url,
    });
  }

  // ─── Club breakdown with discipline ───
  const clubs: ClubBreakdownRow[] = ((clubsRaw.data ?? []) as ClubTallyRow[])
    .map(c => {
      const dom = dominantVote(c);
      // Members who voted differently from the club's dominant recorded vote.
      // NOT_VOTING (absences) doesn't count as breaking discipline.
      const voted = c.yes + c.no + c.abstain;
      const dominantCount = dom === "YES" ? c.yes : dom === "NO" ? c.no : c.abstain;
      const differentCount = voted - dominantCount;
      // Only describe a dominant position when one option received at least 60% of cast votes.
      const isFree = voted > 0 && dominantCount / voted < 0.6;
      const disciplineLabel: ClubBreakdownRow["disciplineLabel"] = isFree
        ? "brak przewagi"
        : VOTE_LABEL_FROM_DOMINANT[dom];
      return {
        ...c,
        club_ref: c.club_short,
        clubColor: KLUB_COLORS[c.club_short] ?? "#6e6356",
        dominant: dom,
        differentCount,
        disciplineLabel,
      };
    })
    // Sort by total mandates desc — biggest clubs first
    .sort((a, b) => b.total - a.total);

  // ─── Seats (full roster) sorted by canonical seating order ───
  const clubRank = new Map(SEATING_ORDER.map((c, i) => [c, i]));
  const seats: Seat[] = voteRows
    .map(v => {
      const mp = mpById.get(v.mp_id);
      const club = v.club_ref ?? "niez.";
      return {
        mp_id: v.mp_id,
        club_ref: club,
        club_color: KLUB_COLORS[club] ?? "#6e6356",
        vote: (v.vote as Seat["vote"]) ?? "ABSENT",
        mp_name: mp?.name ?? `Poseł #${v.mp_id}`,
        district_num: mp?.district_num ?? null,
        district_name: mp?.district_name ?? null,
        photo_url: mp?.photo_url ?? null,
      };
    })
    .sort((a, b) => {
      const ra = clubRank.get(a.club_ref) ?? 99;
      const rb = clubRank.get(b.club_ref) ?? 99;
      if (ra !== rb) return ra - rb;
      // Deterministic intra-club shuffle keyed by mp_id so the chamber doesn't
      // show stripes but is stable across renders.
      const ha = (a.mp_id * 9301 + 49297) % 233280;
      const hb = (b.mp_id * 9301 + 49297) % 233280;
      return ha - hb;
    });

  // ─── Rebels: MPs whose vote ≠ club dominant, excluding free-vote clubs ───
  const clubByRef = new Map(clubs.map(c => [c.club_ref, c]));
  const rebelDraft: Rebel[] = [];
  for (const seat of seats) {
    const club = clubByRef.get(seat.club_ref);
    if (!club) continue;
    if (club.disciplineLabel === "brak przewagi" || club.disciplineLabel === "—") continue;
    if (seat.vote !== "YES" && seat.vote !== "NO" && seat.vote !== "ABSTAIN") continue;
    if (seat.vote === club.dominant) continue;
    const mp = mpById.get(seat.mp_id);
    rebelDraft.push({
      mp_id: seat.mp_id,
      name: seat.mp_name,
      club_ref: seat.club_ref,
      club_label: club.club_name,
      expected: club.dominant,
      actual: seat.vote,
      district_num: mp?.district_num ?? null,
      district_name: mp?.district_name ?? null,
      photo_url: mp?.photo_url ?? null,
    });
  }

  const rebels = rebelDraft;

  // ─── Linked print (richest one — sprawozdanie > main > joint > poprawka) ───
  const ROLE_RANK: Record<string, number> = { main: 1, sprawozdanie: 2, joint: 3, poprawka: 4, autopoprawka: 5 };
  let linkedPrint: LinkedPrintRich | null = null;
  let topPrintId: number | null = null;
  let documentType: string | null = null;
  const linkRows = (printLinks.data ?? []) as Array<{ print_id: number; role: string }>;
  if (linkRows.length > 0) {
    const top = [...linkRows].sort((a, b) => (ROLE_RANK[a.role] ?? 9) - (ROLE_RANK[b.role] ?? 9))[0];
    topPrintId = top.print_id;
    const { data: pr } = await sb
      .from("prints")
      .select("id, number, parent_number, short_title, summary_plain, impact_punch, affected_groups, iso24495_class, document_category")
      .eq("id", top.print_id)
      .maybeSingle();
    if (pr) {
      documentType = pr.document_category as string | null;
      linkedPrint = {
        id: pr.id as number,
        number: pr.number as string,
        parent_number: (pr.parent_number as string) ?? null,
        short_title: (pr.short_title as string) ?? null,
        summary_plain: (pr.summary_plain as string) ?? null,
        impact_punch: (pr.impact_punch as string) ?? null,
        affected_groups: (pr.affected_groups as LinkedPrintRich["affected_groups"]) ?? null,
        iso24495_class: (pr.iso24495_class as string) ?? null,
      };
    }
  }

  // ─── Process stages — for "co dalej" timeline ───
  let predictedStages: PredictedStage[] = [];
  if (topPrintId != null) {
    const { data: stages } = await sb
      .from("process_stages")
      .select("stage_type, stage_date, process_id")
      .eq("print_id", topPrintId)
      .order("ord", { ascending: true });
    // Pick MIN date per stage_type (matches validation harness logic)
    const byType: Record<string, string> = {};
    for (const s of (stages ?? []) as Array<{ stage_type: string; stage_date: string }>) {
      if (!s.stage_date) continue;
      const cur = byType[s.stage_type];
      if (!cur || s.stage_date < cur) byType[s.stage_type] = s.stage_date;
    }
    predictedStages = predictStages({
      sejmVoteDate: new Date(header.date),
      documentType,
      toSenateDate: byType.ToSenate ? new Date(byType.ToSenate) : null,
      senatePositionDate: byType.SenatePosition ? new Date(byType.SenatePosition) : null,
      toPresidentDate: byType.ToPresident ? new Date(byType.ToPresident) : null,
      presidentSignatureDate: byType.PresidentSignature ? new Date(byType.PresidentSignature) : null,
      promulgationDate: null, // No confirmed publication date in this query.
      passed,
      motionPolarity: header.motion_polarity,
    });
  } else {
    predictedStages = predictStages({ sejmVoteDate: new Date(header.date), passed, motionPolarity: header.motion_polarity });
  }

  // ─── Promise link via voting_promise_link_mv (E3) ───
  let promiseLink: VotingPageData["promiseLink"] = null;
  const { data: pl } = await sb
    .from("voting_promise_link_mv")
    .select("promise_id, party_code")
    .eq("voting_id", votingId)
    .limit(1)
    .maybeSingle();
  if (pl) {
    const { data: pr } = await sb
      .from("promises")
      .select("id, party_code, title")
      .eq("id", pl.promise_id)
      .maybeSingle();
    if (pr) promiseLink = { id: pr.id as number, party_code: pr.party_code as string, title: pr.title as string };
  }

  // ─── Related votings (same print, ≠ current) ───
  let relatedVotings: VotingPageData["relatedVotings"] = [];
  if (topPrintId != null) {
    const { data: related } = await sb
      .from("voting_print_links")
      .select("voting_id")
      .eq("print_id", topPrintId);
    const otherIds = ((related ?? []) as Array<{ voting_id: number }>)
      .map(r => r.voting_id)
      .filter(id => id !== votingId);
    if (otherIds.length > 0) {
      const { data: rv } = await sb
        .from("votings")
        .select("id, voting_number, sitting, date, yes, no")
        .in("id", otherIds)
        .order("date", { ascending: false })
        .limit(8);
      relatedVotings = (rv ?? []) as VotingPageData["relatedVotings"];
    }
  }

  return {
    header,
    passed,
    clubs,
    seats,
    rebels,
    linkedPrint,
    predictedStages,
    promiseLink,
    relatedVotings,
  };
}

