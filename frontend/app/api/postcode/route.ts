import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// Postcode → district is stable for years; edge cache cuts Vercel + PostgREST churn.
const CACHE_OK =
  "public, s-maxage=86400, stale-while-revalidate=604800, max-age=3600";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = (url.searchParams.get("p") || "").trim();
  if (!/^\d{2}-\d{3}$/.test(raw)) {
    return NextResponse.json({ district: null, error: "invalid format" }, { status: 200 });
  }
  try {
    const sb = supabase();
    const { data, error } = await sb
      .from("district_postcodes")
      .select("district_num, term, districts:districts!inner(num,name,seat_city)")
      .eq("postcode", raw)
      .limit(1);
    if (error) throw error;
    const row = data?.[0] as unknown as { districts?: { num: number; name: string } } | undefined;
    if (!row?.districts) {
      return NextResponse.json({ district: null }, { headers: { "Cache-Control": CACHE_OK } });
    }
    return NextResponse.json(
      { district: { num: row.districts.num, name: row.districts.name } },
      { headers: { "Cache-Control": CACHE_OK } },
    );
  } catch (e) {
    return NextResponse.json({ district: null, error: (e as Error).message }, { status: 500 });
  }
}
