import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { getPrint } from "@/lib/db/prints";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ term: string; number: string }> },
) {
  const { term: rawTerm, number } = await params;
  const term = Number(rawTerm);
  if (!Number.isFinite(term)) return new NextResponse("bad term", { status: 400 });

  const data = await getPrint(term, number);
  if (!data) return new NextResponse("not found", { status: 404 });

  type Job = { printNumber: string; filename: string; folder: string };
  const jobs: Job[] = [];
  for (const fn of data.attachments) {
    jobs.push({ printNumber: data.print.number, filename: fn, folder: data.print.number });
  }
  for (const sp of data.subPrints) {
    for (const fn of sp.attachments) {
      jobs.push({ printNumber: sp.number, filename: fn, folder: sp.number });
    }
  }
  if (jobs.length === 0) return new NextResponse("no attachments", { status: 404 });

  const zip = new JSZip();
  await Promise.all(
    jobs.map(async (j) => {
      const url = `https://api.sejm.gov.pl/sejm/term${term}/prints/${encodeURIComponent(j.printNumber)}/${encodeURIComponent(j.filename)}`;
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) return;
      const buf = Buffer.from(await r.arrayBuffer());
      zip.file(`${j.folder}/${j.filename}`, buf);
    }),
  );

  const blob = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const zipName = `druk-${term}-${number}.zip`;
  return new NextResponse(new Uint8Array(blob), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipName}"`,
      "Content-Length": String(blob.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
