import "server-only";
import { supabase } from "@/lib/supabase";
import { isLegalBasis, lawUnitUrl, packUnits, validDate, type LawUnit } from "@/lib/law-types";

export type LawSearchOptions = { query: string; date: string; root?: string; article?: string; version?: string; limit?: number; semantic?: boolean };

export async function expandLawContext(units: LawUnit[], date: string) {
  const sb = supabase();
  const { data: links, error } = await sb.from("law_context_links").select("source_unit_id,target_unit_id,relation,reviewed_by,evidence_url").in("source_unit_id", units.map(u => u.id));
  if (error) throw error;
  const targetIds = [...new Set((links ?? []).map(l => l.target_unit_id))];
  const context = new Map<string, LawUnit>();
  if (targetIds.length) {
    const { data, error } = await sb.from("law_units_v").select("*").in("id", targetIds);
    if (error) throw error;
    for (const unit of (data ?? []) as LawUnit[]) context.set(unit.id, unit);
  }
  // Same-document references are candidates, not automatic proof of a legal
  // relationship. Cross-act definitions/exceptions need exact reviewed links.
  const references = new Map<string, Set<string>>();
  for (const unit of units) for (const ref of unit.references_json) {
    const article = /^art\.?\s*(\d+[a-z]*)/i.exec(ref)?.[1];
    if (article && article !== unit.article_number) {
      const numbers = references.get(unit.version_id) ?? new Set<string>();
      if (numbers.size < 30) numbers.add(article);
      references.set(unit.version_id, numbers);
    }
  }
  for (const [version, articles] of references) {
    const { data, error } = await sb.from("law_units_v").select("*").eq("version_id", version).in("article_number", [...articles]);
    if (error) throw error;
    for (const unit of (data ?? []) as LawUnit[]) context.set(unit.id, unit);
  }
  for (const unit of units) context.delete(unit.id);
  const packed = packUnits([...units, ...context.values()], 40000);
  const keptIds = new Set(packed.items.map(u => u.id));
  const items = units.filter(u => keptIds.has(u.id));
  const complete = items.length > 0 && items.every(u => u.context_verified && u.coverage_verified)
    && targetIds.every(id => keptIds.has(id)) && packed.omitted.length === 0;
  const contextUnits = packed.items.filter(u => !items.some(i => i.id === u.id)).map(unit => ({ ...unit,
    url: lawUnitUrl(unit), verified_for_date: isLegalBasis(unit, date),
    links: (links ?? []).filter(l => l.target_unit_id === unit.id),
    relation_reviewed: (links ?? []).some(l => l.target_unit_id === unit.id),
  }));
  return { items, context_units: contextUnits, context_complete: complete,
    answerable: complete && packed.items.every(u => isLegalBasis(u, date)), omitted_units: packed.omitted };
}

async function queryVector(query: string): Promise<{ index: string; vector: number[] } | null> {
  const { data, error } = await supabase().from("law_embedding_indexes").select("*").eq("active", true).maybeSingle();
  if (error) throw error;
  const base = process.env.OLLAMA_BASE_URL || process.env.OLLAMA_HOST;
  if (!data || !base) return null;
  const tags = await fetch(base.replace(/\/$/, "") + "/api/tags", { cache: "no-store", signal: AbortSignal.timeout(3000) });
  if (!tags.ok) throw new Error("Encoder unavailable");
  const models = (await tags.json()).models as { name: string; digest: string }[];
  if (!models.some(m => m.name === data.model && m.digest === data.model_digest)) throw new Error("Encoder digest mismatch");
  const response = await fetch(base.replace(/\/$/, "") + "/api/embed", {
    method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", signal: AbortSignal.timeout(8000),
    body: JSON.stringify({ model: data.model, input: data.query_prefix + query, truncate: false, options: data.encoder_options }),
  });
  if (!response.ok) throw new Error("Encoder unavailable");
  const vector = (await response.json()).embeddings?.[0];
  if (!Array.isArray(vector) || vector.length !== data.dimension || !vector.every(x => typeof x === "number" && Number.isFinite(x))) throw new Error("Encoder dimension mismatch");
  return { index: data.id, vector };
}

export async function getLawRoots() {
  const [roots, future] = await Promise.all([
    supabase().from("law_roots").select("*,acts(title,status,entry_into_force)").order("family"),
    supabase().from("acts").select("eli_id,title,entry_into_force").gt("entry_into_force", validDate()).order("entry_into_force").limit(30),
  ]);
  if (roots.error) throw roots.error;
  if (future.error) throw future.error;
  return { roots: roots.data ?? [], future: future.data ?? [] };
}

export async function getLawDocument(root: string, version?: string) {
  const sb = supabase();
  const { data: versions, error } = await sb.from("law_versions").select("*,law_version_checks(*)")
    .eq("root_eli_id", root).order("document_date", { ascending: false, nullsFirst: false }).order("captured_at", { ascending: false }).limit(50);
  if (error) throw error;
  const selected = version ? versions?.find(v => v.id === version) : versions?.[0];
  if (!selected) return null;
  const units: LawUnit[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await sb.from("law_units_v").select("*").eq("version_id", selected.id).order("ordinal").range(offset, offset + 499);
    if (error) throw error;
    units.push(...(data ?? []) as LawUnit[]);
    if ((data?.length ?? 0) < 500) break;
  }
  const { data: acts, error: linksError } = await sb.from("acts").select("id,title").eq("eli_id", root).single();
  if (linksError) throw linksError;
  const { data: processes, error: processError } = await sb.rpc("law_process_links", { p_root: root });
  if (processError) throw processError;
  return { root, title: acts.title as string, versions: versions ?? [], selected, units, processes: processes ?? [] };
}

export async function searchLaw(options: LawSearchOptions) {
  const sb = supabase();
  const warnings: string[] = [];
  let encoded: Awaited<ReturnType<typeof queryVector>> = null;
  if (options.semantic !== false && !(options.root && options.article)) {
    try { encoded = await queryVector(options.query); }
    catch { warnings.push("semantic_unavailable"); }
    if (!encoded && !warnings.length) warnings.push("semantic_not_configured");
  }
  const { data, error } = await sb.rpc("law_search", {
    p_query: options.query, p_date: options.date, p_root: options.root ?? null,
    p_article: options.article ?? null, p_version: options.version ?? null, p_limit: 40,
    p_index: encoded?.index ?? null, p_vector: encoded ? JSON.stringify(encoded.vector) : null,
  });
  if (error) throw error;
  const ranked = (data ?? []) as { unit_id: string; version_id: string; retrieval: string }[];
  if (!ranked.length) return { items: [], date: options.date, retrieval: encoded ? "hybrid" : "lexical", warnings, answerable: false, reason: "no_results", context_complete: false };
  const { data: rows, error: hydrateError } = await sb.from("law_units_v").select("*").in("id", ranked.map(r => r.unit_id));
  if (hydrateError) throw hydrateError;
  const byId = new Map((rows as LawUnit[]).map(u => [u.id, u]));
  let ordered = ranked.map(r => byId.get(r.unit_id)).filter((u): u is LawUnit => !!u);
  let reranked = false;
  const reranker = process.env.LAW_RERANK_URL;
  if (reranker) {
    try {
      const response = await fetch(reranker, { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", signal: AbortSignal.timeout(10000),
        body: JSON.stringify({ query: options.query, documents: ordered.map(u => u.body) }) });
      if (!response.ok) throw new Error("Reranker unavailable");
      const scores = (await response.json()).scores;
      if (!Array.isArray(scores) || scores.length !== ordered.length || !scores.every(s => typeof s === "number" && Number.isFinite(s))) throw new Error("Reranker response mismatch");
      ordered = ordered.map((unit, i) => ({ unit, score: scores[i] })).sort((a, b) => b.score - a.score).map(r => r.unit);
      reranked = true;
    } catch { warnings.push("reranker_unavailable"); }
  }
  const selected = ordered.slice(0, Math.min(options.limit ?? 5, 8));
  // Whole articles retain intra-article exceptions. Cross-act references require
  // an explicit context audit; merely retrieving neighboring text cannot prove it.
  const expanded = await expandLawContext(selected, options.date);
  const items = expanded.items.map(unit => ({ ...unit, url: lawUnitUrl(unit), verified_for_date: isLegalBasis(unit, options.date) }));
  if (expanded.omitted_units.length) warnings.push("whole_units_omitted_for_budget");
  return { items, date: options.date, retrieval: encoded ? "hybrid" : "lexical", reranked, warnings,
    ranking: ordered.slice(0, 10).map(u => ({ unit_id: u.id, version_id: u.version_id })),
    answerable: expanded.answerable, reason: expanded.answerable ? null : items.every(u => u.verified_for_date) ? "context_not_verified" : "version_not_verified",
    context_units: expanded.context_units, context_complete: expanded.context_complete, omitted_units: expanded.omitted_units };
}
