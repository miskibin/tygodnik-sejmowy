import "server-only";

import { supabase } from "@/lib/supabase";

const DEFAULT_TERM = 10;

export type MpRow = {
  mpId: number;
  firstLastName: string;
  clubRef: string | null;
  districtNum: number | null;
  voivodeship: string | null;
  active: boolean;
  photoUrl: string | null;
  profession: string | null;
  educationLevel: string | null;
  email: string | null;
  birthDate: string | null;
  birthLocation: string | null;
};

export type MpListItem = Pick<MpRow, "mpId" | "firstLastName" | "clubRef" | "photoUrl" | "districtNum">;

export type MpStats = {
  attendancePct: number | null;
  attendanceCount: number;
  attendanceTotal: number;
  loyaltyPct: number | null;
  loyaltyVotes: number | null;
  questionCount: number;
  statementCount: number;
};

export type MpEvent = {
  kind: "statement" | "question";
  date: string | null;
  title: string;
  subtitle: string | null;
  href?: string;
  // Surface statement_id so the Tab1 "tydzien" row can link to /mowa/{id}.
  // Null for "question" rows (no /mowa equivalent yet).
  statementId?: number | null;
};

const SELECT_MP_COLS =
  "mp_id, first_last_name, club_ref, district_num, voivodeship, active, photo_url, profession, education_level, email, birth_date, birth_location";

function rowToMp(r: Record<string, unknown>): MpRow {
  return {
    mpId: r.mp_id as number,
    firstLastName: (r.first_last_name as string) ?? "",
    clubRef: (r.club_ref as string) ?? null,
    districtNum: (r.district_num as number | null) ?? null,
    voivodeship: (r.voivodeship as string | null) ?? null,
    active: !!r.active,
    photoUrl: (r.photo_url as string | null) ?? null,
    profession: (r.profession as string | null) ?? null,
    educationLevel: (r.education_level as string | null) ?? null,
    email: (r.email as string | null) ?? null,
    birthDate: (r.birth_date as string | null) ?? null,
    birthLocation: (r.birth_location as string | null) ?? null,
  };
}

export async function getMpsByDistrict(districtNum: number, term = DEFAULT_TERM): Promise<MpListItem[]> {
  const sb = supabase();
  const { data, error } = await sb
    .from("mps")
    .select(SELECT_MP_COLS)
    .eq("term", term)
    .eq("district_num", districtNum)
    .eq("active", true)
    .order("last_name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r): MpListItem => {
    const mp = rowToMp(r);
    return { mpId: mp.mpId, firstLastName: mp.firstLastName, clubRef: mp.clubRef, photoUrl: mp.photoUrl, districtNum: mp.districtNum };
  });
}

export async function getMostActiveRecent(limit = 8, term = DEFAULT_TERM): Promise<MpListItem[]> {
  const sb = supabase();
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 30);
  const sinceIso = since.toISOString();

  const { data: stmts, error: stmtsErr } = await sb
    .from("proceeding_statements")
    .select("mp_id")
    .eq("term", term)
    .not("mp_id", "is", null)
    .gte("start_datetime", sinceIso);
  if (stmtsErr) throw stmtsErr;

  const counts = new Map<number, number>();
  for (const r of (stmts ?? []) as { mp_id: number | null }[]) {
    if (r.mp_id == null) continue;
    counts.set(r.mp_id, (counts.get(r.mp_id) ?? 0) + 1);
  }
  const topIds = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);

  if (topIds.length === 0) return [];

  const { data: mpsRows, error: mpsErr } = await sb
    .from("mps")
    .select(SELECT_MP_COLS)
    .eq("term", term)
    .in("mp_id", topIds);
  if (mpsErr) throw mpsErr;

  const byId = new Map<number, MpListItem>();
  for (const r of mpsRows ?? []) {
    const mp = rowToMp(r);
    byId.set(mp.mpId, {
      mpId: mp.mpId,
      firstLastName: mp.firstLastName,
      clubRef: mp.clubRef,
      photoUrl: mp.photoUrl,
      districtNum: mp.districtNum,
    });
  }
  return topIds.map((id) => byId.get(id)).filter((x): x is MpListItem => !!x);
}

export async function getActiveMpSample(limit = 12, term = DEFAULT_TERM): Promise<MpListItem[]> {
  const sb = supabase();
  const { data, error } = await sb
    .from("mps")
    .select(SELECT_MP_COLS)
    .eq("term", term)
    .eq("active", true)
    .order("last_name", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r): MpListItem => {
    const mp = rowToMp(r);
    return { mpId: mp.mpId, firstLastName: mp.firstLastName, clubRef: mp.clubRef, photoUrl: mp.photoUrl, districtNum: mp.districtNum };
  });
}

export async function getAllActiveMps(term = DEFAULT_TERM): Promise<MpListItem[]> {
  const sb = supabase();
  const { data, error } = await sb
    .from("mps")
    .select(SELECT_MP_COLS)
    .eq("term", term)
    .eq("active", true)
    .order("last_name", { ascending: true })
    .limit(1000);
  if (error) throw error;
  return (data ?? []).map((r): MpListItem => {
    const mp = rowToMp(r);
    return { mpId: mp.mpId, firstLastName: mp.firstLastName, clubRef: mp.clubRef, photoUrl: mp.photoUrl, districtNum: mp.districtNum };
  });
}

export async function getMp(mpId: number, term = DEFAULT_TERM): Promise<MpRow | null> {
  const sb = supabase();
  const { data, error } = await sb
    .from("mps")
    .select(SELECT_MP_COLS)
    .eq("term", term)
    .eq("mp_id", mpId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return rowToMp(data);
}

export async function getClubName(clubRef: string | null, term = DEFAULT_TERM): Promise<string | null> {
  if (!clubRef) return null;
  const sb = supabase();
  const { data, error } = await sb
    .from("clubs")
    .select("name")
    .eq("term", term)
    .eq("club_id", clubRef)
    .maybeSingle();
  if (error || !data) return clubRef;
  return (data.name as string) ?? clubRef;
}

export async function getMpStats(mpId: number, term = DEFAULT_TERM): Promise<MpStats> {
  const sb = supabase();

  const [attRes, discRes, actRes] = await Promise.all([
    sb.from("mp_attendance")
      .select("total_votes, attended, pct_attended")
      .eq("term", term)
      .eq("mp_id", mpId)
      .maybeSingle(),
    sb.from("mp_discipline_summary")
      .select("n_votes, n_aligned, pct_aligned")
      .eq("term", term)
      .eq("mp_id", mpId)
      .maybeSingle(),
    sb.from("mp_activity_summary")
      .select("n_statements, n_questions")
      .eq("term", term)
      .eq("mp_id", mpId)
      .maybeSingle(),
  ]);

  const att = attRes.data as { total_votes: number; attended: number; pct_attended: string | number | null } | null;
  const disc = discRes.data as { n_votes: number; n_aligned: number; pct_aligned: string | number | null } | null;
  const act = actRes.data as { n_statements: number; n_questions: number } | null;

  return {
    attendancePct: att?.pct_attended != null ? Number(att.pct_attended) : null,
    attendanceCount: att?.attended ?? 0,
    attendanceTotal: att?.total_votes ?? 0,
    loyaltyPct: disc?.pct_aligned != null ? Number(disc.pct_aligned) : null,
    loyaltyVotes: disc?.n_votes ?? null,
    questionCount: act?.n_questions ?? 0,
    statementCount: act?.n_statements ?? 0,
  };
}

export async function getMpThisWeek(mpId: number, term = DEFAULT_TERM, limit = 10): Promise<MpEvent[]> {
  const sb = supabase();

  const [stmts, qa] = await Promise.all([
    sb.from("proceeding_statements")
      .select("id, num, start_datetime, body_text, function, proceeding_day_id")
      .eq("term", term)
      .eq("mp_id", mpId)
      .order("start_datetime", { ascending: false, nullsFirst: false })
      .limit(limit),
    sb.from("question_authors")
      .select("question_id, questions:questions!inner(id, kind, num, title, sent_date, recipient_titles)")
      .eq("term", term)
      .eq("mp_id", mpId)
      .order("question_id", { ascending: false })
      .limit(limit),
  ]);

  type Stmt = { id: number; start_datetime: string | null; body_text: string | null; function: string | null };
  type QRow = { question_id: number; questions: { kind: string; num: string; title: string; sent_date: string | null; recipient_titles: string[] | null } };

  const stmtEvents: MpEvent[] = ((stmts.data as Stmt[]) ?? []).map((s) => ({
    kind: "statement",
    date: s.start_datetime,
    title: (s.body_text || "").split(/\s+/).slice(0, 14).join(" ") + (s.body_text && s.body_text.length > 80 ? "…" : ""),
    subtitle: s.function ?? "wystąpienie na posiedzeniu",
    statementId: s.id,
  }));

  const qEvents: MpEvent[] = ((qa.data as unknown as QRow[]) ?? []).map((qa) => ({
    kind: "question",
    date: qa.questions?.sent_date ?? null,
    title: qa.questions?.title ?? `${qa.questions?.kind} ${qa.questions?.num}`,
    subtitle: qa.questions?.recipient_titles?.[0] ?? qa.questions?.kind ?? "interpelacja",
  }));

  return [...stmtEvents, ...qEvents]
    .sort((a, b) => {
      const da = a.date ? Date.parse(a.date) : 0;
      const db = b.date ? Date.parse(b.date) : 0;
      return db - da;
    })
    .slice(0, limit);
}
