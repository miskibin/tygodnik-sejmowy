import "server-only";

import { supabase } from "@/lib/supabase";
import { embedQuery, toVecLiteral, DEFAULT_EMBED_MODEL } from "@/lib/embed";

export type SearchScope = "all" | "print" | "promise" | "statement";

export type PrintHit = {
  kind: "print";
  id: number;
  term: number;
  number: string;
  shortTitle: string;
  title: string;
  impactPunch: string | null;
  changeDate: string | null;
  distance: number;
  href: string;
};

export type PromiseHit = {
  kind: "promise";
  id: number;
  partyCode: string | null;
  title: string;
  sourceYear: number | null;
  status: string | null;
  distance: number;
  href: string | null;
};

export type StatementHit = {
  kind: "statement";
  id: number;
  term: number;
  speakerName: string | null;
  function: string | null;
  date: string | null;
  excerpt: string;
  distance: number;
  href: string | null;
};

export type SearchHit = PrintHit | PromiseHit | StatementHit;

const ENTITY_BY_SCOPE: Record<Exclude<SearchScope, "all">, string> = {
  print: "print",
  promise: "promise",
  statement: "proceeding_statement",
};

async function topK(entity: string, vec: number[], k: number, model: string) {
  const sb = supabase();
  const { data, error } = await sb.rpc("embeddings_top_k", {
    p_entity_type: entity,
    p_model: model,
    p_query: toVecLiteral(vec),
    p_k: k,
  });
  if (error) throw error;
  return (data ?? []) as { entity_id: string; distance: number }[];
}

export async function vectorSearch(
  query: string,
  scope: SearchScope = "all",
  topPerType = 8,
): Promise<SearchHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const model = DEFAULT_EMBED_MODEL;
  const vec = await embedQuery(trimmed, { model });

  const types: ("print" | "promise" | "statement")[] =
    scope === "all" ? ["print", "promise", "statement"] : [scope];

  const sb = supabase();
  const buckets = await Promise.all(
    types.map((t) => topK(ENTITY_BY_SCOPE[t], vec, topPerType, model).then((rows) => ({ t, rows }))),
  );

  // Print entity_id is the print *number* (text, e.g. "2074", "2054-A"). Promise
  // and statement entity_ids are integer-string PKs.
  const printNumbers: string[] = [];
  const promiseIds: number[] = [];
  const statementIds: number[] = [];
  for (const { t, rows } of buckets) {
    for (const r of rows) {
      if (t === "print") {
        printNumbers.push(r.entity_id);
      } else {
        const id = Number(r.entity_id);
        if (!Number.isFinite(id)) continue;
        if (t === "promise") promiseIds.push(id);
        else statementIds.push(id);
      }
    }
  }

  const distById = new Map<string, number>();
  for (const { t, rows } of buckets) {
    for (const r of rows) distById.set(`${t}:${r.entity_id}`, r.distance);
  }

  const [printsRes, promisesRes, stmtsRes] = await Promise.all([
    printNumbers.length
      ? sb
          .from("prints")
          .select("id, term, number, short_title, title, impact_punch, change_date, is_meta_document, is_procedural")
          .in("number", printNumbers)
          // Meta sub-prints (opinia/OSR/autopoprawka) clutter top-of-search
          // when the parent bill IS in the result set. is_meta_document=true
          // also covers sponsor_authority='inne' issuer overrides.
          .eq("is_meta_document", false)
      : Promise.resolve({ data: [], error: null } as const),
    promiseIds.length
      ? sb.from("promises").select("id, party_code, title, source_year, status").in("id", promiseIds)
      : Promise.resolve({ data: [], error: null } as const),
    statementIds.length
      ? sb
          .from("proceeding_statements")
          .select(
            "id, term, num, speaker_name, function, body_text, start_datetime, " +
              "proceeding_day:proceeding_days!inner(date, proceeding:proceedings!inner(number, dates))",
          )
          .in("id", statementIds)
      : Promise.resolve({ data: [], error: null } as const),
  ]);

  if (printsRes.error) throw printsRes.error;
  if (promisesRes.error) throw promisesRes.error;
  if (stmtsRes.error) throw stmtsRes.error;

  const hits: SearchHit[] = [];

  for (const r of (printsRes.data ?? []) as Record<string, unknown>[]) {
    const id = r.id as number;
    const number = r.number as string;
    const dist = distById.get(`print:${number}`) ?? 1;
    hits.push({
      kind: "print",
      id,
      term: r.term as number,
      number,
      shortTitle: (r.short_title as string) ?? "",
      title: (r.title as string) ?? "",
      impactPunch: (r.impact_punch as string) ?? null,
      changeDate: (r.change_date as string) ?? null,
      distance: dist,
      href: `/proces/${r.term}/${number}`,
    });
  }

  for (const r of (promisesRes.data ?? []) as Record<string, unknown>[]) {
    const id = r.id as number;
    const dist = distById.get(`promise:${id}`) ?? 1;
    hits.push({
      kind: "promise",
      id,
      partyCode: (r.party_code as string) ?? null,
      title: (r.title as string) ?? "",
      sourceYear: (r.source_year as number | null) ?? null,
      status: (r.status as string) ?? null,
      distance: dist,
      href: null,
    });
  }

  // Cast through unknown — the !inner JOIN shape confuses supabase-js's
  // generic inference into GenericStringError[].
  for (const r of (stmtsRes.data ?? []) as unknown as Record<string, unknown>[]) {
    const id = r.id as number;
    const dist = distById.get(`statement:${id}`) ?? 1;
    const body = ((r.body_text as string) ?? "").replace(/\s+/g, " ").trim();
    // Sejm API stenogram URL uses the YYYY-MM-DD date in the day slot
    // (NOT a 1-based dayIdx — that returns 404). Point at the full-day
    // stenogram PDF since the link is labelled "Pełny stenogram".
    const day = (r.proceeding_day as Record<string, unknown> | null) ?? null;
    const proc = (day?.proceeding as Record<string, unknown> | null) ?? null;
    const sitting = proc?.number as number | undefined;
    const dayDate = day?.date as string | undefined;
    let href: string | null = null;
    if (sitting && dayDate) {
      href = `https://api.sejm.gov.pl/sejm/term${r.term}/proceedings/${sitting}/${dayDate}/transcripts/pdf`;
    }
    hits.push({
      kind: "statement",
      id,
      term: r.term as number,
      speakerName: (r.speaker_name as string) ?? null,
      function: (r.function as string) ?? null,
      date: (r.start_datetime as string) ?? null,
      excerpt: body.length > 600 ? body.slice(0, 600) + "…" : body,
      distance: dist,
      href,
    });
  }

  hits.sort((a, b) => a.distance - b.distance);
  return hits.slice(0, 20);
}
