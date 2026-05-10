import { NextResponse } from "next/server";
import { getMpsByDistrict } from "@/lib/db/mps";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = url.searchParams.get("num");
  const num = Number(raw);
  if (!Number.isInteger(num) || num < 1 || num > 41) {
    return NextResponse.json({ mps: [], error: "invalid district num" }, { status: 200 });
  }
  try {
    const mps = await getMpsByDistrict(num);
    return NextResponse.json({ mps });
  } catch (e) {
    return NextResponse.json({ mps: [], error: (e as Error).message }, { status: 500 });
  }
}
