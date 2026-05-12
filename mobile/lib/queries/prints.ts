import { supabase } from "@/lib/supabase";
import type {
  DocumentCategory,
  LinkedVoting,
  PrintDetail,
  PrintWithStages,
  ProcessAct,
  ProcessOutcome,
  ProcessStage,
  SponsorAuthority,
} from "@/lib/types";

const SELECT_DETAIL =
  "id, term, number, short_title, title, change_date, document_date, impact_punch, summary, summary_plain, citizen_action, affected_groups, topic_tags, stance, document_category, parent_number, is_procedural, is_meta_document, sponsor_authority, sponsor_mps";

const ROLE_RANK: Record<string, number> = {
  main: 0,
  sprawozdanie: 1,
  autopoprawka: 2,
  poprawka: 3,
  joint: 4,
  other: 5,
};

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

  const { data: proc } = await sb
    .from("processes")
    .select(
      "id, passed, eli, display_address, eli_act_id, closure_date, urgency_status, document_type",
    )
    .eq("term", term)
    .eq("number", number)
    .limit(1)
    .maybeSingle();
  const processId = (proc?.id as number | undefined) ?? -1;

  const { data: stagesRows } = await sb
    .from("process_stages")
    .select("ord, depth, stage_name, stage_type, stage_date, decision, sitting_num")
    .eq("process_id", processId)
    .order("ord", { ascending: true });

  let outcome: ProcessOutcome | null = null;
  if (proc) {
    const eliActId = (proc.eli_act_id as number | null) ?? null;
    let act: ProcessAct | null = null;
    if (eliActId) {
      const { data: actRow } = await sb
        .from("acts")
        .select("eli_id, title, status, source_url, promulgation_date")
        .eq("id", eliActId)
        .limit(1)
        .maybeSingle();
      if (actRow) {
        act = {
          eliId: (actRow.eli_id as string) ?? "",
          displayAddress: (proc.display_address as string) ?? "",
          title: (actRow.title as string) ?? null,
          status: (actRow.status as string) ?? null,
          sourceUrl: (actRow.source_url as string) ?? null,
          publishedAt: (actRow.promulgation_date as string) ?? null,
        };
      }
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
  }));

  const { data: linkedRows } = await sb
    .from("voting_print_links")
    .select(
      "voting_id, role, votings:voting_id(id, term, sitting, sitting_day, voting_number, date, title, yes, no, abstain, not_participating)",
    )
    .eq("print_id", printId);

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
      date: (v.date as string) ?? "",
      title: (v.title as string) ?? "",
      yes: (v.yes as number) ?? 0,
      no: (v.no as number) ?? 0,
      abstain: (v.abstain as number) ?? 0,
      notParticipating: (v.not_participating as number) ?? 0,
    }));
    if (relatedVotings.length > 0) mainVoting = relatedVotings[0];
  }

  const { data: attRows } = await sb
    .from("print_attachments")
    .select("filename, ordinal")
    .eq("print_id", printId)
    .order("ordinal", { ascending: true });
  const attachments = (attRows ?? []).map((r) => (r.filename as string) ?? "").filter(Boolean);

  const affectedRaw = p.affected_groups as
    | Array<{ tag: string; severity: "low" | "medium" | "high"; est_population: number | null }>
    | null;
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
    citizenAction: (p.citizen_action as string) ?? null,
    affectedGroups: (affectedRaw ?? []).map((g) => ({
      tag: g.tag,
      severity: g.severity,
      estPopulation: g.est_population ?? null,
    })),
    topics: (p.topic_tags as string[] | null) ?? [],
    documentCategory: ((p.document_category as string) ?? null) as DocumentCategory,
    parentNumber: (p.parent_number as string) ?? null,
    isProcedural: !!p.is_procedural,
    isMetaDocument: !!p.is_meta_document,
    sponsorAuthority: ((p.sponsor_authority as string) ?? null) as SponsorAuthority,
    sponsorMps,
    stance: (p.stance as string) ?? null,
  };

  return { print: detail, stages, mainVoting, relatedVotings, outcome, attachments };
}
