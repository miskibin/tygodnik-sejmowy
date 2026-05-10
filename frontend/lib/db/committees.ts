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
