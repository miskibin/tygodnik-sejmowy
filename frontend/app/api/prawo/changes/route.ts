import { supabase } from "@/lib/supabase";
import { validDate, validEli } from "@/lib/law-types";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const root = params.get("eli") ?? "";
  if (!validEli(root)) return Response.json({ error: "Nieprawidłowy identyfikator ELI." }, { status: 400 });
  let date: string;
  try { date = validDate(params.get("date")); } catch { return Response.json({ error: "Nieprawidłowa data." }, { status: 400 }); }
  const offset = Number(params.get("offset") ?? 0);
  const limit = Number(params.get("limit") ?? 20);
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 40) return Response.json({ error: "Nieprawidłowy zakres strony." }, { status: 400 });
  try {
    const [scope, dependencies, versions] = await Promise.all([
      supabase().from("law_roots").select("*").eq("eli_id", root).maybeSingle(),
      supabase().from("law_dependencies").select("category,dependency_eli_id,metadata_sha256", { count: "exact" }).eq("root_eli_id", root).order("category").order("dependency_eli_id").range(offset, offset + limit - 1),
      supabase().from("law_versions").select("id,document_eli_id,document_date,source_url,law_version_checks(*)").eq("root_eli_id", root).order("document_date", { ascending: false, nullsFirst: false }).limit(50),
    ]);
    if (scope.error || dependencies.error || versions.error) throw new Error("Law audit unavailable");
    if (!scope.data) return Response.json({ error: "Akt poza zweryfikowanym zakresem bazy.", answerable: false, date }, { status: 404 });
    const ids = [...new Set((dependencies.data ?? []).map(d => d.dependency_eli_id))];
    const acts: { eli_id: string; title: string; entry_into_force: string | null; promulgation_date: string | null }[] = [];
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await supabase().from("acts").select("eli_id,title,entry_into_force,promulgation_date").in("eli_id", ids.slice(i, i + 100));
      if (error) throw error;
      acts.push(...(data ?? []));
    }
    const byId = new Map(acts.map(a => [a.eli_id, a]));
    return Response.json({ root, date, coverage: scope.data.coverage, checked_at: scope.data.checked_at,
      versions: versions.data, total_dependencies: dependencies.count, offset, limit,
      next_offset: offset + limit < (dependencies.count ?? 0) ? offset + limit : null,
      dependencies: (dependencies.data ?? []).map(d => ({ ...d, act: byId.get(d.dependency_eli_id) ?? null,
        source_url: `https://api.sejm.gov.pl/eli/acts/${d.dependency_eli_id}` })),
      answerable: false, reason: "metadata_is_not_amended_wording" });
  } catch { return Response.json({ error: "Baza prawa jest chwilowo niedostępna.", answerable: false }, { status: 503 }); }
}
