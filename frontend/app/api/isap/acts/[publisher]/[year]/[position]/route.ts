import { NextResponse } from "next/server";
import {
  buildActApiUrl,
  buildIsapAddress,
  buildIsapDocDetailsUrl,
  buildIsapDocDetailsUrlFromAddress,
  buildIsapPdfUrlFromAddress,
  parseActRef,
} from "@/lib/isap";

type ApiActText = {
  fileName?: string;
  type?: string;
};

type ApiActDetail = {
  address?: string;
  textPDF?: boolean;
  texts?: ApiActText[];
};

function pickPdfText(texts: ApiActText[] | undefined): ApiActText | null {
  const candidates = (texts ?? []).filter((text) =>
    typeof text.fileName === "string" && /\.pdf$/i.test(text.fileName),
  );
  if (candidates.length === 0) return null;
  const rank = (type: string | undefined): number => {
    switch (type) {
      case "O": return 0;
      case "I": return 1;
      case "T": return 2;
      default: return 3;
    }
  };
  candidates.sort((a, b) => rank(a.type) - rank(b.type));
  return candidates[0];
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ publisher: string; year: string; position: string }> },
) {
  const { publisher, year, position } = await params;
  const ref = parseActRef(`${publisher}/${year}/${position}`);
  if (!ref) return new NextResponse("bad act id", { status: 400 });

  try {
    const upstream = await fetch(buildActApiUrl(ref), { next: { revalidate: 3600 } });
    if (!upstream.ok) {
      return NextResponse.redirect(buildIsapDocDetailsUrl(ref), 307);
    }

    const detail = await upstream.json() as ApiActDetail;
    const address = detail.address || buildIsapAddress(ref);
    const pdf = pickPdfText(detail.texts);

    if (detail.textPDF !== false && pdf?.fileName) {
      return NextResponse.redirect(buildIsapPdfUrlFromAddress(address, pdf.fileName), 307);
    }

    return NextResponse.redirect(buildIsapDocDetailsUrlFromAddress(address), 307);
  } catch {
    return NextResponse.redirect(buildIsapDocDetailsUrl(ref), 307);
  }
}
