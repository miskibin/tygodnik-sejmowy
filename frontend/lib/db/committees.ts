import "server-only";

import { supabase } from "@/lib/supabase";

const DEFAULT_TERM = 10;

export type CommitteeType = "STANDING" | "EXTRAORDINARY" | "INVESTIGATIVE" | null;

export type CommitteeListItem = {
  id: number;
  code: string;
  name: string;
  type: CommitteeType;
  appointmentDate: string | null;
  memberCount: number;
};

export type Committee = {
  id: number;
  term: number;
  code: string;
  name: string;
  nameGenitive: string | null;
  type: CommitteeType;
  scope: string | null;
  phone: string | null;
  appointmentDate: string | null;
  compositionDate: string | null;
};

export type CommitteeMember = {
  mpId: number;
  firstLastName: string;
  clubShort: string | null;
  photoUrl: string | null;
  districtNum: number | null;
  function: string | null;
  rank: number;
};

const COMMITTEE_COLS =
  "id, term, code, name, name_genitive, type, scope, phone, appointment_date, composition_date, is_stub";

function rowToCommittee(r: Record<string, unknown>): Committee {
  return {
    id: r.id as number,
    term: r.term as number,
    code: (r.code as string) ?? "",
    name: (r.name as string) ?? "",
    nameGenitive: (r.name_genitive as string | null) ?? null,
    type: (r.type as CommitteeType) ?? null,
    scope: (r.scope as string | null) ?? null,
    phone: (r.phone as string | null) ?? null,
    appointmentDate: (r.appointment_date as string | null) ?? null,
    compositionDate: (r.composition_date as string | null) ?? null,
  };
}

function functionRank(fn: string | null): number {
  if (!fn) return 3;
  const lower = fn.toLowerCase();
  if (lower.startsWith("przewodnicz")) return 0;
  if (lower.includes("zastęp") || lower.includes("zastep")) return 1;
  if (lower.includes("sekretarz")) return 2;
  return 3;
}

export async function getCommitteeList(term = DEFAULT_TERM): Promise<CommitteeListItem[]> {
  const sb = supabase();
  const { data: cmtRows, error: cmtErr } = await sb
    .from("committees")
    .select(COMMITTEE_COLS)
    .eq("term", term)
    .or("is_stub.is.null,is_stub.eq.false")
    .limit(500);
  if (cmtErr) throw cmtErr;

  const committees = (cmtRows ?? []).map(rowToCommittee);
  const ids = committees.map((c) => c.id);
  if (ids.length === 0) return [];

  const { data: memRows, error: memErr } = await sb
    .from("committee_members")
    .select("committee_id")
    .eq("term", term)
    .in("committee_id", ids);
  if (memErr) throw memErr;

  const counts = new Map<number, number>();
  for (const r of (memRows ?? []) as { committee_id: number }[]) {
    counts.set(r.committee_id, (counts.get(r.committee_id) ?? 0) + 1);
  }

  const items: CommitteeListItem[] = committees.map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    type: c.type,
    appointmentDate: c.appointmentDate,
    memberCount: counts.get(c.id) ?? 0,
  }));

  items.sort((a, b) => {
    if (b.memberCount !== a.memberCount) return b.memberCount - a.memberCount;
    return a.name.localeCompare(b.name, "pl");
  });

  return items;
}

export async function getCommittee(id: number, term = DEFAULT_TERM): Promise<Committee | null> {
  const sb = supabase();
  const { data, error } = await sb
    .from("committees")
    .select(COMMITTEE_COLS)
    .eq("term", term)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if ((data as { is_stub?: boolean }).is_stub === true) return null;
  return rowToCommittee(data);
}

export async function getCommitteeMembers(
  committeeId: number,
  term = DEFAULT_TERM,
): Promise<CommitteeMember[]> {
  const sb = supabase();

  const { data: memRows, error: memErr } = await sb
    .from("committee_members")
    .select("mp_id, club_short, function")
    .eq("term", term)
    .eq("committee_id", committeeId);
  if (memErr) throw memErr;

  const members = (memRows ?? []) as { mp_id: number; club_short: string | null; function: string | null }[];
  if (members.length === 0) return [];

  const mpIds = Array.from(new Set(members.map((m) => m.mp_id)));
  const { data: mpRows, error: mpErr } = await sb
    .from("mps")
    .select("mp_id, first_last_name, photo_url, district_num")
    .eq("term", term)
    .in("mp_id", mpIds);
  if (mpErr) throw mpErr;

  const byId = new Map<number, { firstLastName: string; photoUrl: string | null; districtNum: number | null }>();
  for (const r of (mpRows ?? []) as { mp_id: number; first_last_name: string | null; photo_url: string | null; district_num: number | null }[]) {
    byId.set(r.mp_id, {
      firstLastName: r.first_last_name ?? "",
      photoUrl: r.photo_url ?? null,
      districtNum: r.district_num ?? null,
    });
  }

  const enriched: CommitteeMember[] = members.map((m) => {
    const mp = byId.get(m.mp_id);
    return {
      mpId: m.mp_id,
      firstLastName: mp?.firstLastName ?? `MP ${m.mp_id}`,
      clubShort: m.club_short,
      photoUrl: mp?.photoUrl ?? null,
      districtNum: mp?.districtNum ?? null,
      function: m.function,
      rank: functionRank(m.function),
    };
  });

  enriched.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.firstLastName.localeCompare(b.firstLastName, "pl");
  });

  return enriched;
}

export type CommitteeSittingStatus = "FINISHED" | "ONGOING" | "PLANNED" | null;

export type CommitteeSitting = {
  id: number;
  num: number;
  date: string | null;
  startAt: string | null;
  endAt: string | null;
  room: string | null;
  status: CommitteeSittingStatus;
  closed: boolean;
  remote: boolean;
  // Flat, tag-stripped agenda (legacy; safe for compact rows / fallbacks).
  agendaText: string;
  // Raw HTML straight from `committee_sittings.agenda_html`. Used by
  // parseAgendaHtml to extract structured <li> items. Never rendered via
  // dangerouslySetInnerHTML — parsed in JS, output as plain text inside an
  // ordered/unordered list.
  agendaHtml: string | null;
  videoPlayerLink: string | null;
};

const SITTING_TAG_RE = /<[^>]+>/g;
const SITTING_WS_RE = /\s+/g;

function stripHtml(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.replace(SITTING_TAG_RE, " ").replace(SITTING_WS_RE, " ").trim();
}

// DB-sourced URLs flow into <a href>. Guard against javascript: / data: payloads
// that a poisoned upstream API response could inject.
function safeHttpUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export async function getCommitteeSittings(
  committeeId: number,
  term = DEFAULT_TERM,
): Promise<CommitteeSitting[]> {
  const sb = supabase();

  const { data: rows, error } = await sb
    .from("committee_sittings")
    .select(
      "id, num, date, start_at, end_at, room, status, closed, remote, agenda_html",
    )
    .eq("term", term)
    .eq("committee_id", committeeId)
    .order("date", { ascending: false, nullsFirst: false })
    .order("num", { ascending: false });
  if (error) throw error;

  const sittings = (rows ?? []) as {
    id: number;
    num: number;
    date: string | null;
    start_at: string | null;
    end_at: string | null;
    room: string | null;
    status: CommitteeSittingStatus;
    closed: boolean | null;
    remote: boolean | null;
    agenda_html: string | null;
  }[];

  if (sittings.length === 0) return [];

  const sittingIds = sittings.map((s) => s.id);
  const { data: vidRows, error: vidErr } = await sb
    .from("committee_sitting_videos")
    .select("sitting_id, player_link, video_type")
    .in("sitting_id", sittingIds);
  if (vidErr) throw vidErr;

  const videoBySitting = new Map<number, string>();
  for (const v of (vidRows ?? []) as { sitting_id: number; player_link: string | null; video_type: string | null }[]) {
    const safe = safeHttpUrl(v.player_link);
    if (!safe) continue;
    if (videoBySitting.has(v.sitting_id)) continue;
    videoBySitting.set(v.sitting_id, safe);
  }

  return sittings.map((s) => ({
    id: s.id,
    num: s.num,
    date: s.date,
    startAt: s.start_at,
    endAt: s.end_at,
    room: s.room,
    status: s.status,
    closed: !!s.closed,
    remote: !!s.remote,
    agendaText: stripHtml(s.agenda_html),
    agendaHtml: s.agenda_html ?? null,
    videoPlayerLink: videoBySitting.get(s.id) ?? null,
  }));
}

export function committeeTypeLabel(t: CommitteeType): string {
  switch (t) {
    case "STANDING":
      return "komisja stała";
    case "EXTRAORDINARY":
      return "komisja nadzwyczajna";
    case "INVESTIGATIVE":
      return "komisja śledcza";
    default:
      return "komisja";
  }
}

// ---------------------------------------------------------------------------
// Activity stats — fuels list-page "hot now" sort + dot.

export type CommitteeActivity = {
  last30dCount: number;
  last30dFinishedCount: number;
  lastSittingDate: string | null;
  daysSinceLast: number | null;
  yearCount: number;
};

export type ActivityTier = "hot" | "active" | "recent" | "quiet";

export function activityTier(a: CommitteeActivity): ActivityTier {
  if (a.last30dFinishedCount >= 3) return "hot";
  if (a.last30dFinishedCount >= 1) return "active";
  if (a.daysSinceLast !== null && a.daysSinceLast <= 90) return "recent";
  return "quiet";
}

const MS_DAY = 86_400_000;

function dateOnly(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function getCommitteeActivityStats(
  term = DEFAULT_TERM,
): Promise<Map<number, CommitteeActivity>> {
  const sb = supabase();
  // Pull every sitting for the term (table is small: hundreds, not millions),
  // bucket in JS. Avoids needing a SQL function for the windowed counts.
  const { data: rows, error } = await sb
    .from("committee_sittings")
    .select("committee_id, date, status")
    .eq("term", term);
  if (error) throw error;

  const now = Date.now();
  const cutoff30 = now - 30 * MS_DAY;
  const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();

  type Acc = { last30dCount: number; last30dFinishedCount: number; yearCount: number; lastSittingDate: string | null };
  const acc = new Map<number, Acc>();

  const todayMs = new Date().setHours(23, 59, 59, 999);
  for (const r of (rows ?? []) as { committee_id: number; date: string | null; status: string | null }[]) {
    const d = dateOnly(r.date);
    const cur = acc.get(r.committee_id) ?? { last30dCount: 0, last30dFinishedCount: 0, yearCount: 0, lastSittingDate: null };
    if (d) {
      const t = d.getTime();
      const isFuture = r.status === "PLANNED" || t > todayMs;
      // lastSittingDate / counts track ODBYTE only — future sittings would
      // mislabel committees as "active today" when they're actually waiting
      // to meet. Aligns with "Co ostatnio robili" semantics on detail page.
      if (!isFuture) {
        if (t >= cutoff30) {
          cur.last30dCount += 1;
          if (r.status === "FINISHED" || r.status == null) cur.last30dFinishedCount += 1;
        }
        if (t >= yearStart) cur.yearCount += 1;
        if (!cur.lastSittingDate || t > new Date(cur.lastSittingDate).getTime()) {
          cur.lastSittingDate = r.date;
        }
      }
    }
    acc.set(r.committee_id, cur);
  }

  const out = new Map<number, CommitteeActivity>();
  for (const [id, v] of acc) {
    const days = v.lastSittingDate ? Math.round((now - new Date(v.lastSittingDate).getTime()) / MS_DAY) : null;
    out.set(id, {
      last30dCount: v.last30dCount,
      last30dFinishedCount: v.last30dFinishedCount,
      lastSittingDate: v.lastSittingDate,
      daysSinceLast: days,
      yearCount: v.yearCount,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Linked prints — via process_stages.committee_id → prints.

export type LinkedPrint = {
  printId: number;
  term: number;
  number: string;
  title: string;
  shortTitle: string | null;
  lastTouched: string | null;
  hadReport: boolean;
};

export async function getCommitteeLinkedPrints(
  committeeId: number,
  limit = 12,
): Promise<LinkedPrint[]> {
  const sb = supabase();
  // process_stages.print_id is sparsely populated — most rows carry only the
  // text print_number. We walk via processes: every stage owned by this
  // committee → its process → that process's primary print (matched on
  // (term, number) via the same key processes & prints share). Direct
  // print_id values (rare) are unioned at the end.
  const { data: stageRows, error: stageErr } = await sb
    .from("process_stages")
    .select("process_id, stage_date, stage_type, print_id, print_number")
    .eq("committee_id", committeeId)
    .order("stage_date", { ascending: false, nullsFirst: false })
    .limit(5000);
  if (stageErr) {
    console.error("[getCommitteeLinkedPrints] stages error", { committeeId, stageErr });
    throw stageErr;
  }

  type StageRow = {
    process_id: number;
    stage_date: string | null;
    stage_type: string | null;
    print_id: number | null;
    print_number: string | null;
  };

  const processStats = new Map<number, { lastTouched: string | null; hadReport: boolean }>();
  const directPrintIds = new Set<number>();
  for (const r of (stageRows ?? []) as StageRow[]) {
    const cur = processStats.get(r.process_id) ?? { lastTouched: null, hadReport: false };
    if (r.stage_date && (!cur.lastTouched || r.stage_date > cur.lastTouched)) cur.lastTouched = r.stage_date;
    if (r.stage_type === "CommitteeReport") cur.hadReport = true;
    processStats.set(r.process_id, cur);
    if (r.print_id) directPrintIds.add(r.print_id);
  }
  if (processStats.size === 0) return [];

  // Each process has a primary print via processes.number ↔ prints.number (same term).
  // Pull processes → number, then prints by (term, number).
  const processIds = Array.from(processStats.keys());
  const { data: procRows, error: procErr } = await sb
    .from("processes")
    .select("id, term, number")
    .in("id", processIds);
  if (procErr) {
    console.error("[getCommitteeLinkedPrints] processes error", { committeeId, procErr });
    throw procErr;
  }
  type ProcRow = { id: number; term: number; number: string };
  const procRowsTyped = (procRows ?? []) as ProcRow[];
  const procByNumKey = new Map<string, number>(); // key: `${term}/${number}` → process_id
  const printIdsByProc = new Map<number, number>(); // process_id → print_id
  for (const p of procRowsTyped) {
    procByNumKey.set(`${p.term}/${p.number}`, p.id);
  }

  // Fetch prints by (term, number) — match each process's primary print.
  const printQueries = procRowsTyped.map((p) => `and(term.eq.${p.term},number.eq.${p.number})`);
  let printRowsByKey = new Map<string, { id: number; term: number; number: string; title: string; short_title: string | null }>();
  if (printQueries.length > 0) {
    const { data: printRows, error: printErr } = await sb
      .from("prints")
      .select("id, term, number, title, short_title")
      .or(printQueries.join(","));
    if (printErr) {
      console.error("[getCommitteeLinkedPrints] prints error", { committeeId, printErr });
      throw printErr;
    }
    for (const pr of (printRows ?? []) as { id: number; term: number; number: string; title: string; short_title: string | null }[]) {
      const key = `${pr.term}/${pr.number}`;
      printRowsByKey.set(key, pr);
      const procId = procByNumKey.get(key);
      if (procId !== undefined) printIdsByProc.set(procId, pr.id);
    }
  }

  // Also fetch any direct print_ids referenced from stages (rare).
  if (directPrintIds.size > 0) {
    const { data: directRows } = await sb
      .from("prints")
      .select("id, term, number, title, short_title")
      .in("id", Array.from(directPrintIds));
    for (const pr of (directRows ?? []) as { id: number; term: number; number: string; title: string; short_title: string | null }[]) {
      printRowsByKey.set(`${pr.term}/${pr.number}`, pr);
    }
  }

  // Build output keyed by print id (dedupe across stage rows for same print).
  const out = new Map<number, LinkedPrint>();
  for (const p of procRowsTyped) {
    const printId = printIdsByProc.get(p.id);
    if (!printId) continue;
    const pr = printRowsByKey.get(`${p.term}/${p.number}`);
    if (!pr) continue;
    const stats = processStats.get(p.id);
    if (out.has(printId)) {
      const ex = out.get(printId)!;
      if (stats?.lastTouched && (!ex.lastTouched || stats.lastTouched > ex.lastTouched)) ex.lastTouched = stats.lastTouched;
      if (stats?.hadReport) ex.hadReport = true;
    } else {
      out.set(printId, {
        printId: pr.id,
        term: pr.term,
        number: pr.number,
        title: pr.title,
        shortTitle: pr.short_title,
        lastTouched: stats?.lastTouched ?? null,
        hadReport: !!stats?.hadReport,
      });
    }
  }

  const arr = Array.from(out.values()).sort((a, b) => {
    const at = a.lastTouched ? new Date(a.lastTouched).getTime() : 0;
    const bt = b.lastTouched ? new Date(b.lastTouched).getTime() : 0;
    return bt - at;
  });
  return arr.slice(0, limit);
}

export async function getCommitteeLinkedPrintCount(committeeId: number): Promise<number> {
  const sb = supabase();
  const { data, error } = await sb
    .from("process_stages")
    .select("print_id", { count: "exact", head: false })
    .eq("committee_id", committeeId)
    .not("print_id", "is", null)
    .limit(2000);
  if (error) throw error;
  const ids = new Set<number>();
  for (const r of (data ?? []) as { print_id: number }[]) ids.add(r.print_id);
  return ids.size;
}

// ---------------------------------------------------------------------------
// Subcommittees — direct children only (V1; deeper hierarchy out of scope).

export async function getSubcommittees(parentId: number, term = DEFAULT_TERM): Promise<CommitteeListItem[]> {
  const sb = supabase();
  const { data: edges, error: edgeErr } = await sb
    .from("committee_subcommittees")
    .select("child_id")
    .eq("parent_id", parentId);
  if (edgeErr) {
    console.error("[getSubcommittees] edge query error", { parentId, edgeErr });
    throw edgeErr;
  }
  const childIds = Array.from(new Set(((edges ?? []) as { child_id: number }[]).map((e) => e.child_id)));
  if (childIds.length === 0) return [];

  // Don't filter by term here — committee_subcommittees has no `term` column,
  // and many child committees are stub rows (is_stub=true) added by the loader
  // when the upstream subcommittee code doesn't resolve to a fully-populated
  // committee. We still want to show those to the citizen, so include stubs.
  const { data: rows, error } = await sb
    .from("committees")
    .select(COMMITTEE_COLS)
    .in("id", childIds);
  if (error) throw error;
  const committees = ((rows ?? []) as Record<string, unknown>[]).map(rowToCommittee);
  if (committees.length === 0) return [];

  const { data: memRows, error: memErr } = await sb
    .from("committee_members")
    .select("committee_id")
    .eq("term", term)
    .in("committee_id", committees.map((c) => c.id));
  if (memErr) throw memErr;
  const counts = new Map<number, number>();
  for (const r of (memRows ?? []) as { committee_id: number }[]) {
    counts.set(r.committee_id, (counts.get(r.committee_id) ?? 0) + 1);
  }

  return committees
    .map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      type: c.type,
      appointmentDate: c.appointmentDate,
      memberCount: counts.get(c.id) ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pl"));
}

// ---------------------------------------------------------------------------
// Agenda parsing — preserves structure (was: flat 220-char truncation).

export type AgendaItem = {
  text: string;
  depth: number;
};

// Pull <li> contents in document order. Strips inner tags. Depth via <ol>/<ul>
// nesting count above the <li>. Falls back to line/sentence split if the
// payload has no list tags. Always returns at least one item if input is
// non-empty; never returns undefined.
export function parseAgendaHtml(html: string | null | undefined): AgendaItem[] {
  if (!html) return [];
  const raw = html;

  const liRe = /<li\b([^>]*)>([\s\S]*?)<\/li\s*>/gi;
  const items: AgendaItem[] = [];
  let m: RegExpExecArray | null;
  while ((m = liRe.exec(raw)) !== null) {
    // Approximate depth: count how many <ol>/<ul> tags appear before this <li>
    // that haven't been closed yet. Crude but adequate for shallow Sejm agendas.
    const before = raw.slice(0, m.index);
    const opens = (before.match(/<(ol|ul)\b[^>]*>/gi) ?? []).length;
    const closes = (before.match(/<\/(ol|ul)\s*>/gi) ?? []).length;
    const depth = Math.max(0, opens - closes - 1);
    const text = m[2]
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) items.push({ text, depth });
  }

  if (items.length > 0) {
    // Dedupe consecutive duplicates (Sejm sometimes repeats the heading).
    const out: AgendaItem[] = [];
    for (const it of items) {
      const prev = out[out.length - 1];
      if (!prev || prev.text !== it.text) out.push(it);
    }
    return out;
  }

  // Fallback: no <li> tags. Strip everything, split on linebreaks then numeric
  // bullets ("1.", "2)"), drop empties.
  const flat = raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n+/g, "\n")
    .trim();
  if (!flat) return [];
  const lines = flat
    .split(/\n+|(?<=[.;])\s+(?=\d+[.)]\s)/)
    .map((s) => s.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter(Boolean);
  if (lines.length <= 1) return [{ text: flat, depth: 0 }];
  return lines.map((text) => ({ text, depth: 0 }));
}
