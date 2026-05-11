import { NextResponse } from "next/server";
import { getMpQuestionsRows } from "@/lib/db/posel-tabs";
import { MP_QUESTIONS_STATEMENTS_TAB_LIMIT } from "@/lib/posel-tab-page-size";

const TERM = 10;
const MAX_LIMIT = 100;

export async function GET(req: Request, ctx: { params: Promise<{ mpId: string }> }) {
  const { mpId: raw } = await ctx.params;
  const mpId = Number(raw);
  if (!Number.isFinite(mpId) || mpId <= 0) {
    return NextResponse.json({ error: "invalid mpId" }, { status: 400 });
  }
  const url = new URL(req.url);
  const offset = Number(url.searchParams.get("offset") ?? "0");
  const limit = Number(url.searchParams.get("limit") ?? String(MP_QUESTIONS_STATEMENTS_TAB_LIMIT));
  if (!Number.isFinite(offset) || offset < 0 || !Number.isFinite(limit) || limit < 1 || limit > MAX_LIMIT) {
    return NextResponse.json({ error: "invalid offset or limit" }, { status: 400 });
  }
  try {
    const rows = await getMpQuestionsRows(mpId, TERM, offset, limit);
    return NextResponse.json(rows);
  } catch (e) {
    console.error("[api/posel/questions]", { mpId, offset, limit, e });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
