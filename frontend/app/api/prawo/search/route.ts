import { searchLaw } from "@/lib/db/law";
import { validDate, validEli } from "@/lib/law-types";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = params.get("q")?.trim() ?? "";
  const root = params.get("eli") || undefined;
  const article = params.get("article") || undefined;
  const version = params.get("version") || undefined;
  if (query.length < 2 || query.length > 400 || (root && !validEli(root)) || (article && !/^[0-9a-z¹²³⁴⁵⁶⁷⁸⁹⁰]{1,20}$/.test(article)) || (version && !/^[a-f0-9]{64}$/.test(version))) return Response.json({ error: "Nieprawidłowe parametry wyszukiwania." }, { status: 400 });
  let date: string;
  try { date = validDate(params.get("date")); } catch { return Response.json({ error: "Nieprawidłowa data." }, { status: 400 }); }
  try { return Response.json(await searchLaw({ query, date, root, article, version, semantic: params.get("mode") !== "text" })); }
  catch { return Response.json({ error: "Baza prawa jest chwilowo niedostępna.", answerable: false }, { status: 503 }); }
}
