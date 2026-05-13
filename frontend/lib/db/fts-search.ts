import "server-only";

import { supabase } from "@/lib/supabase";
import type { FtsHit, FtsScope, FtsKind } from "./fts-types";

type PrintKey = { term: number | null; number: string };

// Migration 0084 widened entity_id to "term:number"; older deploys still emit
// bare "number". Both shapes parse to a PrintKey — term=null falls back to
// "any term", consumer dedupes on (term, number) so cross-kadencja prints
// can no longer collide once 0084 ships.
function parsePrintEntityId(entityId: string): PrintKey | null {
  const colon = entityId.indexOf(":");
  if (colon < 0) {
    if (!entityId) return null;
    return { term: null, number: entityId };
  }
  if (colon < 1) return null;
  const term = Number(entityId.slice(0, colon));
  const number = entityId.slice(colon + 1);
  if (!Number.isFinite(term) || !number) return null;
  return { term, number };
}

export async function ftsSearch(
  query: string,
  scope: FtsScope = "all",
  limit = 20,
): Promise<FtsHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const sb = supabase();
  const { data: rpcRows, error: rpcErr } = await sb.rpc("polish_fts_search", {
    p_query: trimmed,
    p_scope: scope,
    p_limit: limit,
  });
  if (rpcErr) throw rpcErr;

  type Row = { kind: FtsKind; entity_id: string; rank: number; headline: string };
  const rows = (rpcRows ?? []) as Row[];
  if (rows.length === 0) return [];

  const printKeys: PrintKey[] = [];
  const promiseIds: number[] = [];
  const statementIds: number[] = [];
  const votingIds: number[] = [];
  const committeeIds: number[] = [];
  const mpRowIds: number[] = [];

  for (const r of rows) {
    if (r.kind === "print") {
      const k = parsePrintEntityId(r.entity_id);
      if (k) printKeys.push(k);
    } else if (r.kind === "promise") {
      const n = Number(r.entity_id);
      if (Number.isFinite(n)) promiseIds.push(n);
    } else if (r.kind === "statement") {
      const n = Number(r.entity_id);
      if (Number.isFinite(n)) statementIds.push(n);
    } else if (r.kind === "voting") {
      const n = Number(r.entity_id);
      if (Number.isFinite(n)) votingIds.push(n);
    } else if (r.kind === "committee") {
      const n = Number(r.entity_id);
      if (Number.isFinite(n)) committeeIds.push(n);
    } else if (r.kind === "mp") {
      const n = Number(r.entity_id);
      if (Number.isFinite(n)) mpRowIds.push(n);
    }
  }

  // Sejm print numbers repeat per kadencja. Group by term so each (term, number)
  // pair is fetched precisely; legacy bare-number entity_ids (pre-0084 RPC)
  // land in a `null`-term bucket and fall back to .in("number", …).
  const printsByTerm = new Map<number | null, string[]>();
  for (const k of printKeys) {
    const arr = printsByTerm.get(k.term) ?? [];
    arr.push(k.number);
    printsByTerm.set(k.term, arr);
  }
  const printsFilterParts: string[] = [];
  const printsLegacyNumbers: string[] = [];
  for (const [term, nums] of printsByTerm.entries()) {
    if (term === null) {
      printsLegacyNumbers.push(...nums);
    } else {
      const numList = nums.map((n) => `"${n.replace(/"/g, "")}"`).join(",");
      printsFilterParts.push(`and(term.eq.${term},number.in.(${numList}))`);
    }
  }
  if (printsLegacyNumbers.length) {
    const numList = printsLegacyNumbers.map((n) => `"${n.replace(/"/g, "")}"`).join(",");
    printsFilterParts.push(`number.in.(${numList})`);
  }
  const printsFilter = printsFilterParts.join(",");

  const [printsRes, promisesRes, stmtsRes, votingsRes, committeesRes, mpsRes] = await Promise.all([
    printKeys.length
      ? sb
          .from("prints")
          .select("term, number, short_title, title")
          .or(printsFilter)
          .eq("is_meta_document", false)
      : Promise.resolve({ data: [], error: null } as const),
    promiseIds.length
      ? sb.from("promises").select("id, party_code, title, source_year").in("id", promiseIds)
      : Promise.resolve({ data: [], error: null } as const),
    statementIds.length
      ? sb
          .from("proceeding_statements")
          .select(
            "id, term, speaker_name, function, " +
              "proceeding_day:proceeding_days!inner(date, proceeding:proceedings!inner(number))",
          )
          .in("id", statementIds)
      : Promise.resolve({ data: [], error: null } as const),
    votingIds.length
      ? sb.from("votings").select("id, title, topic, date").in("id", votingIds)
      : Promise.resolve({ data: [], error: null } as const),
    committeeIds.length
      ? sb.from("committees").select("id, name, code, type").in("id", committeeIds)
      : Promise.resolve({ data: [], error: null } as const),
    mpRowIds.length
      ? sb
          .from("mps")
          .select("id, mp_id, first_last_name, club_ref, district_num, active")
          .in("id", mpRowIds)
      : Promise.resolve({ data: [], error: null } as const),
  ]);

  if (printsRes.error) throw printsRes.error;
  if (promisesRes.error) throw promisesRes.error;
  if (stmtsRes.error) throw stmtsRes.error;
  if (votingsRes.error) throw votingsRes.error;
  if (committeesRes.error) throw committeesRes.error;
  if (mpsRes.error) throw mpsRes.error;

  // Composite key keeps cross-term prints distinct. Bare-number (legacy)
  // lookups also use the row's actual term to build a deterministic key,
  // and the loop below probes both forms when resolving each RPC row.
  const printsByKey = new Map<string, Record<string, unknown>>();
  for (const r of (printsRes.data ?? []) as Record<string, unknown>[]) {
    printsByKey.set(`${r.term}:${r.number}`, r);
  }
  function findPrint(entityId: string, key: PrintKey): Record<string, unknown> | undefined {
    if (key.term !== null) return printsByKey.get(`${key.term}:${key.number}`);
    for (const r of (printsRes.data ?? []) as Record<string, unknown>[]) {
      if (String(r.number) === key.number) return r;
    }
    return undefined;
  }
  const promisesById = new Map<number, Record<string, unknown>>();
  for (const r of (promisesRes.data ?? []) as Record<string, unknown>[]) {
    promisesById.set(r.id as number, r);
  }
  const stmtsById = new Map<number, Record<string, unknown>>();
  for (const r of (stmtsRes.data ?? []) as unknown as Record<string, unknown>[]) {
    stmtsById.set(r.id as number, r);
  }
  const votingsById = new Map<number, Record<string, unknown>>();
  for (const r of (votingsRes.data ?? []) as Record<string, unknown>[]) {
    votingsById.set(r.id as number, r);
  }
  const committeesById = new Map<number, Record<string, unknown>>();
  for (const r of (committeesRes.data ?? []) as Record<string, unknown>[]) {
    committeesById.set(r.id as number, r);
  }
  const mpsById = new Map<number, Record<string, unknown>>();
  for (const r of (mpsRes.data ?? []) as Record<string, unknown>[]) {
    mpsById.set(r.id as number, r);
  }

  const hits: FtsHit[] = [];

  for (const r of rows) {
    const headline = r.headline ?? "";
    if (r.kind === "print") {
      const key = parsePrintEntityId(r.entity_id);
      if (!key) continue;
      const p = findPrint(r.entity_id, key);
      if (!p) continue;
      const term = p.term as number;
      const number = String(p.number);
      hits.push({
        kind: "print",
        id: `${term}:${number}`,
        label: (p.short_title as string) || (p.title as string) || `Druk ${number}`,
        headline,
        href: `/proces/${term}/${number}`,
        meta: `Druk ${number}`,
      });
    } else if (r.kind === "promise") {
      const id = Number(r.entity_id);
      const p = promisesById.get(id);
      if (!p) continue;
      const party = (p.party_code as string | null) ?? null;
      const year = (p.source_year as number | null) ?? null;
      hits.push({
        kind: "promise",
        id: r.entity_id,
        label: (p.title as string) || "Obietnica",
        headline,
        href: null,
        meta: [party, year].filter(Boolean).join(" · ") || null,
      });
    } else if (r.kind === "statement") {
      const id = Number(r.entity_id);
      const s = stmtsById.get(id);
      if (!s) continue;
      const speaker = (s.speaker_name as string | null) ?? null;
      const fn = (s.function as string | null) ?? null;
      const day = (s.proceeding_day as Record<string, unknown> | null) ?? null;
      const proc = (day?.proceeding as Record<string, unknown> | null) ?? null;
      const sitting = proc?.number as number | undefined;
      const dayDate = day?.date as string | undefined;
      const term = s.term as number;
      const href =
        sitting && dayDate
          ? `https://api.sejm.gov.pl/sejm/term${term}/proceedings/${sitting}/${dayDate}/transcripts/pdf`
          : null;
      hits.push({
        kind: "statement",
        id: r.entity_id,
        label: speaker || "Wystąpienie",
        headline,
        href,
        meta: [fn, dayDate].filter(Boolean).join(" · ") || null,
      });
    } else if (r.kind === "voting") {
      const id = Number(r.entity_id);
      const v = votingsById.get(id);
      if (!v) continue;
      const date = v.date as string | null;
      hits.push({
        kind: "voting",
        id: r.entity_id,
        label: (v.title as string) || (v.topic as string) || "Głosowanie",
        headline,
        href: `/glosowanie/${id}`,
        meta: date
          ? new Date(date).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" })
          : null,
      });
    } else if (r.kind === "committee") {
      const id = Number(r.entity_id);
      const c = committeesById.get(id);
      if (!c) continue;
      hits.push({
        kind: "committee",
        id: r.entity_id,
        label: (c.name as string) || (c.code as string) || "Komisja",
        headline,
        href: `/komisja/${id}`,
        meta: (c.code as string) || null,
      });
    } else if (r.kind === "mp") {
      const id = Number(r.entity_id);
      const m = mpsById.get(id);
      if (!m) continue;
      const mpId = m.mp_id as number;
      const club = (m.club_ref as string | null) ?? null;
      const district = (m.district_num as number | null) ?? null;
      const active = !!m.active;
      hits.push({
        kind: "mp",
        id: r.entity_id,
        label: (m.first_last_name as string) || "Poseł",
        headline,
        href: `/posel/${mpId}`,
        meta: [
          club,
          district ? `okręg ${district}` : null,
          active ? null : "były poseł",
        ].filter(Boolean).join(" · ") || null,
      });
    }
  }

  return hits;
}
