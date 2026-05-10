import { NextResponse } from "next/server";
import { getMpsByDistrict } from "@/lib/db/mps";

// MP roster per district changes rarely (term-bound); short CDN TTL + long SWR.
const CACHE_OK =
  "public, s-maxage=3600, stale-while-revalidate=86400, max-age=600";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = url.searchParams.get("num");
  const num = Number(raw);
  if (!Number.isInteger(num) || num < 1 || num > 41) {
    return NextResponse.json({ mps: [], error: "invalid district num" }, { status: 200 });
  }
  try {
    const mps = await getMpsByDistrict(num);
    return NextResponse.json({ mps }, { headers: { "Cache-Control": CACHE_OK } });
  } catch (e) {
    return NextResponse.json({ mps: [], error: (e as Error).message }, { status: 500 });
  }
}
