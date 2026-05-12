import { NextResponse } from "next/server";
import { ftsSearch } from "@/lib/db/fts-search";
import type { FtsScope } from "@/lib/db/fts-types";

const VALID_SCOPES: ReadonlySet<string> = new Set([
  "all", "print", "promise", "statement", "voting", "committee", "mp",
]);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const scopeRaw = url.searchParams.get("scope") || "all";
  const limitRaw = Number(url.searchParams.get("limit") || "20");

  if (q.length < 2) return NextResponse.json({ hits: [] });

  const scope: FtsScope = (VALID_SCOPES.has(scopeRaw) ? scopeRaw : "all") as FtsScope;
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 20, 1), 100);

  try {
    const hits = await ftsSearch(q, scope, limit);
    return NextResponse.json(
      { hits },
      { headers: { "Cache-Control": "private, max-age=30" } },
    );
  } catch (e) {
    console.error("[/api/search] ftsSearch failed", e);
    return NextResponse.json({ hits: [], error: "search-failed" }, { status: 500 });
  }
}
