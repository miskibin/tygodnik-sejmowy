import "server-only";

import { normalizeActSourceUrl } from "@/lib/isap";
import { supabase } from "@/lib/supabase";

// Voting tally rendered inline next to a stage row (yes/no/abstain pill).
// May come either from process_stages.voting jsonb or from voting_print_links
// → votings join (canonical, mig 0047).
export type ThreadStageVoting = {
  yes: number;
  no: number;
  abstain: number;
  notParticipating: number | null;
  votingNumber: number | null;
};

export type ThreadStage = {
  ord: number;
  depth: number;
  stageName: string;
  stageType: string;
  stageDate: string | null;
  decision: string | null;
  sittingNum: number | null;
  voting: ThreadStageVoting | null;
};

export type ThreadAct = {
  eliId: string;
  displayAddress: string;
  title: string | null;
  status: string | null;
  sourceUrl: string | null;
  publishedAt: string | null;
};

export type ThreadDetail = {
  processId: number;
  term: number;
  number: string;
  title: string;
  shortTitle: string | null;
  passed: boolean;
  closureDate: string | null;
  lastRefreshedAt: string | null;
  changeDate: string | null;
  stages: ThreadStage[];
  // Final voting linked via voting_print_links (canonical), if any.
  finalVoting: ThreadStageVoting | null;
  act: ThreadAct | null;
};

export type ThreadSummary = {
  processId: number;
  term: number;
  number: string;
  title: string;
  shortTitle: string | null;
  lastStageType: string | null;
  lastStageName: string | null;
  lastStageDate: string | null;
  lastRefreshedAt: string | null;
};

// Threads currently moving through Sejm — passed=false AND seen by ETL in the
// last 90 days. Sorted by most-recent stage_date desc so freshly-active bills
// surface above stale-but-still-open ones.
export async function getThreadsInFlight(limit = 30): Promise<ThreadSummary[]> {
  const sb = supabase();
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  // Pull candidate processes; we'll attach the latest stage in a second query
  // because process_stages → max(stage_date) is awkward in PostgREST.
  const { data: procs, error: pe } = await sb
    .from("processes")
    .select("id, term, number, title, last_refreshed_at")
    .eq("passed", false)
    .gte("last_refreshed_at", cutoff)
    .order("last_refreshed_at", { ascending: false })
    .limit(limit * 3); // overfetch so we can drop processes with no stages
  if (pe) throw pe;
  const rows = (procs ?? []) as Array<{
    id: number;
    term: number;
    number: string;
    title: string | null;
    last_refreshed_at: string | null;
  }>;
  if (rows.length === 0) return [];

  const procIds = rows.map((r) => r.id);

  // Fetch latest stage per process. We grab top-level (depth=0) stages with
  // a stage_date and let the client pick the max — keeps the query simple.
  const { data: stageRows, error: se } = await sb
    .from("process_stages")
    .select("process_id, stage_type, stage_name, stage_date")
    .in("process_id", procIds)
    .eq("depth", 0)
    .not("stage_date", "is", null)
    .order("stage_date", { ascending: false });
  if (se) throw se;

  const latestByProc = new Map<number, { stageType: string; stageName: string; stageDate: string }>();
  for (const r of (stageRows ?? []) as Array<{
    process_id: number;
    stage_type: string | null;
    stage_name: string | null;
    stage_date: string | null;
  }>) {
    if (!r.stage_date) continue;
    if (latestByProc.has(r.process_id)) continue;
    latestByProc.set(r.process_id, {
      stageType: r.stage_type ?? "",
      stageName: r.stage_name ?? "",
      stageDate: r.stage_date,
    });
  }

  // Hydrate short_title from prints (term, number). PostgREST has no
  // composite-IN, so we filter the cartesian and dedupe client-side.
  const { data: printRows } = await sb
    .from("prints")
    .select("term, number, short_title")
    .in("term", Array.from(new Set(rows.map((r) => r.term))))
    .in("number", Array.from(new Set(rows.map((r) => r.number))));
  const shortByKey = new Map<string, string | null>();
  for (const r of (printRows ?? []) as Array<{
    term: number;
    number: string;
    short_title: string | null;
  }>) {
    shortByKey.set(`${r.term}::${r.number}`, r.short_title ?? null);
  }

  const summaries: ThreadSummary[] = rows.map((r) => {
    const latest = latestByProc.get(r.id);
    return {
      processId: r.id,
      term: r.term,
      number: r.number,
      title: r.title ?? "",
      shortTitle: shortByKey.get(`${r.term}::${r.number}`) ?? null,
      lastStageType: latest?.stageType ?? null,
      lastStageName: latest?.stageName ?? null,
      lastStageDate: latest?.stageDate ?? null,
      lastRefreshedAt: r.last_refreshed_at ?? null,
    };
  });

  // Sort by latest stage_date desc, with refreshed_at as tiebreak. Unstaged
  // processes fall to the bottom.
  summaries.sort((a, b) => {
    const da = a.lastStageDate ? Date.parse(a.lastStageDate) : 0;
    const db = b.lastStageDate ? Date.parse(b.lastStageDate) : 0;
    if (db !== da) return db - da;
    const ra = a.lastRefreshedAt ? Date.parse(a.lastRefreshedAt) : 0;
    const rb = b.lastRefreshedAt ? Date.parse(b.lastRefreshedAt) : 0;
    return rb - ra;
  });

  return summaries.slice(0, limit);
}

// Single thread detail. id == print number ("2180"); term defaults to 10.
export async function getThread(term: number, number: string): Promise<ThreadDetail | null> {
  const sb = supabase();

  // Process row + outcome columns.
  const { data: proc, error: pe } = await sb
    .from("processes")
    .select(
      "id, term, number, title, passed, closure_date, last_refreshed_at, eli_act_id, display_address",
    )
    .eq("term", term)
    .eq("number", number)
    .limit(1)
    .maybeSingle();
  if (pe) throw pe;
  if (!proc) return null;

  // Print short_title for the kicker (best-effort; not all processes have one).
  const { data: printRow } = await sb
    .from("prints")
    .select("short_title, change_date")
    .eq("term", term)
    .eq("number", number)
    .limit(1)
    .maybeSingle();

  const processId = proc.id as number;

  const { data: stagesRows, error: se } = await sb
    .from("process_stages")
    .select(
      "ord, depth, stage_name, stage_type, stage_date, decision, sitting_num, voting",
    )
    .eq("process_id", processId)
    .order("ord", { ascending: true });
  if (se) throw se;

  // Find printId for voting_print_links lookup.
  const { data: printIdRow } = await sb
    .from("prints")
    .select("id")
    .eq("term", term)
    .eq("number", number)
    .limit(1)
    .maybeSingle();
  const printId = (printIdRow?.id as number | undefined) ?? null;

  let finalVoting: ThreadStageVoting | null = null;
  if (printId) {
    const { data: linkedRows } = await sb
      .from("voting_print_links")
      .select(
        "role, votings:voting_id(voting_number, yes, no, abstain, not_participating)",
      )
      .eq("print_id", printId);
    // Prefer role='main', then sprawozdanie, fallback to highest voting_number.
    const ROLE_RANK: Record<string, number> = {
      main: 0,
      sprawozdanie: 1,
      autopoprawka: 2,
      poprawka: 3,
      joint: 4,
      other: 5,
    };
    const ranked = (linkedRows as Array<{
      role: string;
      votings: Record<string, unknown> | Record<string, unknown>[] | null;
    }> | null ?? [])
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
    if (ranked.length > 0) {
      const v = ranked[0].v;
      finalVoting = {
        yes: (v.yes as number) ?? 0,
        no: (v.no as number) ?? 0,
        abstain: (v.abstain as number) ?? 0,
        notParticipating: (v.not_participating as number | null) ?? null,
        votingNumber: (v.voting_number as number | null) ?? null,
      };
    }
  }

  // Resolve outcome act if linked.
  let act: ThreadAct | null = null;
  const eliActId = (proc.eli_act_id as number | null) ?? null;
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
        sourceUrl: normalizeActSourceUrl(
          (actRow.source_url as string) ?? null,
          (actRow.eli_id as string) ?? null,
        ),
        publishedAt: (actRow.promulgation_date as string) ?? null,
      };
    }
  }

  const stages: ThreadStage[] = ((stagesRows ?? []) as Array<{
    ord: number;
    depth: number;
    stage_name: string | null;
    stage_type: string | null;
    stage_date: string | null;
    decision: string | null;
    sitting_num: number | null;
    voting: Record<string, unknown> | null;
  }>).map((r): ThreadStage => {
    const v = r.voting;
    let voting: ThreadStageVoting | null = null;
    if (v && typeof v === "object" && (typeof v.yes === "number" || typeof v.no === "number")) {
      voting = {
        yes: (v.yes as number) ?? 0,
        no: (v.no as number) ?? 0,
        abstain: (v.abstain as number) ?? 0,
        notParticipating: (v.notParticipating as number | null) ?? null,
        votingNumber: (v.votingNumber as number | null) ?? null,
      };
    }
    return {
      ord: r.ord,
      depth: r.depth,
      stageName: r.stage_name ?? "",
      stageType: r.stage_type ?? "",
      stageDate: r.stage_date,
      decision: r.decision,
      sittingNum: r.sitting_num,
      voting,
    };
  });

  return {
    processId,
    term: proc.term as number,
    number: proc.number as string,
    title: (proc.title as string) ?? "",
    shortTitle: (printRow?.short_title as string | null) ?? null,
    passed: !!proc.passed,
    closureDate: (proc.closure_date as string | null) ?? null,
    lastRefreshedAt: (proc.last_refreshed_at as string | null) ?? null,
    changeDate: (printRow?.change_date as string | null) ?? null,
    stages,
    finalVoting,
    act,
  };
}
