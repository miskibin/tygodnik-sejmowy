import "server-only";
import { supabase } from "@/lib/supabase";
import { isLegalBasis, lawUnitUrl, packUnits, validDate, type LawUnit } from "@/lib/law-types";
import { mentionedActs, knownLawNames, type LawLinks } from "@/lib/law-reader";

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

export async function getLawRoots(page = 1, title = "") {
  let listing = supabase().from("law_roots").select("*,acts!inner(title,status,entry_into_force)", { count: "exact" });
  if (title) listing = listing.ilike("acts.title", `%${title.replace(/[%_]/g, "")}%`);
  const [roots, future] = await Promise.all([
    listing.order("eli_id").range((page - 1) * 20, page * 20 - 1),
    supabase().from("acts").select("eli_id,title,entry_into_force").gt("entry_into_force", validDate()).order("entry_into_force").limit(30),
  ]);
  if (roots.error) throw roots.error;
  if (future.error) throw future.error;
  return { roots: roots.data ?? [], total: roots.count ?? 0, future: future.data ?? [] };
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

export async function getLawLinks(units: LawUnit[]): Promise<LawLinks> {
  const sb = supabase();
  const mentions = [...new Set(units.flatMap(u => mentionedActs(u.body)))];
  const wanted = [...new Set([...mentions, ...knownLawNames.filter(a => units.some(u => a.pattern.test(u.body))).map(a => a.root)])];
  type VersionLink = { id: string; root_eli_id: string; document_eli_id: string; document_date: string | null; captured_at: string };
  const versions: VersionLink[] = [];
  // Load only cited acts. A document must not scan the entire statutory catalog.
  for (let start = 0; start < wanted.length; start += 100) {
    const batch = wanted.slice(start, start + 100).join(",");
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await sb.from("law_versions").select("id,root_eli_id,document_eli_id,document_date,captured_at")
        .or(`root_eli_id.in.(${batch}),document_eli_id.in.(${batch})`)
        .order("document_date", { ascending: false, nullsFirst: false }).order("captured_at", { ascending: false }).order("id")
        .range(offset, offset + 499);
      if (error) throw error;
      versions.push(...(data ?? []) as VersionLink[]);
      if ((data?.length ?? 0) < 500) break;
    }
  }
  versions.sort((a, b) => (b.document_date ?? "").localeCompare(a.document_date ?? "") || b.captured_at.localeCompare(a.captured_at));
  const latest = new Map<string, VersionLink>();
  for (const version of versions) if (!latest.has(version.root_eli_id)) latest.set(version.root_eli_id, version);
  // Same-act references keep the selected document, including historical views.
  const selected = units[0];
  if (selected) latest.set(selected.root_eli_id, { id: selected.version_id, root_eli_id: selected.root_eli_id,
    document_eli_id: selected.document_eli_id, document_date: selected.document_date, captured_at: selected.captured_at });
  const acts = await Promise.all([...latest.values()].map(async version => {
    const articles: Record<string, string> = {};
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await sb.from("law_units").select("article_number,anchor").eq("version_id", version.id).order("ordinal").range(offset, offset + 499);
      if (error) throw error;
      for (const unit of data ?? []) if (unit.article_number && !articles[unit.article_number]) articles[unit.article_number] = unit.anchor;
      if ((data?.length ?? 0) < 500) break;
    }
    return { root: version.root_eli_id, version: version.id, documents: [version.document_eli_id], articles };
  }));
  const metadata: string[] = [];
  for (let offset = 0; offset < mentions.length; offset += 100) {
    const { data, error } = await sb.from("acts").select("eli_id").in("eli_id", mentions.slice(offset, offset + 100));
    if (error) throw error;
    metadata.push(...(data ?? []).map(a => a.eli_id));
  }
  return { acts, metadata };
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
