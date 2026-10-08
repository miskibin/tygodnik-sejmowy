import { supabase } from "@/lib/supabase";
import { isLegalBasis, lawUnitUrl, validDate, type LawUnit } from "@/lib/law-types";
import { expandLawContext } from "@/lib/db/law";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9]{64}$/.test(id)) return Response.json({ error: "Nieprawidłowy identyfikator." }, { status: 400 });
  let date: string;
  const version = new URL(request.url).searchParams.get("version");
  if (version && !/^[a-f0-9]{64}$/.test(version)) return Response.json({ error: "Nieprawidłowa wersja." }, { status: 400 });
  try { date = validDate(new URL(request.url).searchParams.get("date")); } catch { return Response.json({ error: "Nieprawidłowa data." }, { status: 400 }); }
  try {
  const { data, error } = await supabase().from("law_units_v").select("*").eq("id", id).maybeSingle();
  if (error) return Response.json({ error: "Baza prawa jest chwilowo niedostępna.", answerable: false }, { status: 503 });
  if (!data) return Response.json({ error: "Nie znaleziono przepisu.", answerable: false }, { status: 404 });
  const unit = data as LawUnit;
  if (version && version !== unit.version_id) return Response.json({ error: "Jednostka należy do innej wersji dokumentu.", answerable: false, reason: "version_mismatch" }, { status: 409 });
  const expanded = await expandLawContext([unit], date);
  return Response.json({ item: { ...unit, url: lawUnitUrl(unit) }, date, verified_for_date: isLegalBasis(unit, date),
    answerable: expanded.answerable, context_complete: expanded.context_complete,
    context_units: expanded.context_units, omitted_units: expanded.omitted_units,
    reason: expanded.answerable ? null : "applicability_and_context_require_verification" });
  } catch { return Response.json({ error: "Baza prawa jest chwilowo niedostępna.", answerable: false }, { status: 503 }); }
}
