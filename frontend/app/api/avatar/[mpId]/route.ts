import { NextRequest, NextResponse } from "next/server";

// Same-origin proxy for MP avatar images. The Sejm API at api.sejm.gov.pl
// does NOT send Access-Control-Allow-Origin, so html-to-image's internal
// fetch (which calls toDataURL on the image) is CORS-blocked when capturing
// the Quote Share PNG card. Routing through our own origin sidesteps it
// AND adds 24h edge caching.

const TERM = 10;
const UPSTREAM_TIMEOUT_MS = 4500;

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ mpId: string }> },
) {
  const { mpId } = await ctx.params;
  const id = Number(mpId);
  if (!Number.isInteger(id) || id < 1 || id > 100_000) {
    return new NextResponse("Invalid mpId", { status: 400 });
  }

  const upstream = `https://api.sejm.gov.pl/sejm/term${TERM}/MP/${id}/photo`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const res = await fetch(upstream, {
      signal: controller.signal,
      // Edge / Node fetch cache: revalidate once per day. Photos rarely
      // change mid-term; if one does, manual purge or new tag deploy clears.
      next: { revalidate: 86400 },
    });
    if (!res.ok) {
      return new NextResponse("Not found", { status: 404 });
    }
    const buf = await res.arrayBuffer();
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": res.headers.get("Content-Type") || "image/jpeg",
        "Cache-Control": "public, max-age=86400, immutable",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET",
      },
    });
  } catch {
    return new NextResponse("Upstream error", { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
