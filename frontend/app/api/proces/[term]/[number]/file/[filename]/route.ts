import { NextRequest, NextResponse } from "next/server";

const ALLOWED_EXT = /\.(pdf|docx|doc|rtf|odt|txt)$/i;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ term: string; number: string; filename: string }> },
) {
  const { term: rawTerm, number, filename } = await params;
  const term = Number(rawTerm);
  if (!Number.isFinite(term)) return new NextResponse("bad term", { status: 400 });
  if (filename.includes("/") || filename.includes("..") || !ALLOWED_EXT.test(filename)) {
    return new NextResponse("bad filename", { status: 400 });
  }

  const upstream = `https://api.sejm.gov.pl/sejm/term${term}/prints/${encodeURIComponent(number)}/${encodeURIComponent(filename)}`;
  const r = await fetch(upstream, { cache: "no-store" });
  if (!r.ok || !r.body) {
    return new NextResponse(`upstream ${r.status}`, { status: r.status === 404 ? 404 : 502 });
  }
  const ct = r.headers.get("content-type") ?? "application/octet-stream";
  const len = r.headers.get("content-length");
  const headers: Record<string, string> = {
    "Content-Type": ct,
    "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
    "Cache-Control": "public, max-age=3600",
  };
  if (len) headers["Content-Length"] = len;
  return new NextResponse(r.body, { headers });
}
