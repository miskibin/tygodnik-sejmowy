import Link from "next/link";
import { ClubBadge } from "@/components/clubs/ClubBadge";
import {
  PARTY_TO_KLUB,
  partyShort,
  statusColor,
  statusLabel,
  type PromiseRow,
} from "@/lib/db/promises";

// Dense ledger row. Keep ONE display of the promise text — when title and
// source_quote overlap (~96% in the wild) only the quote is shown. Rationale,
// confidence/sim and the redundant "więcej szczegółów →" CTA all moved to the
// detail page; the entire card is the link.

function detailHref(row: Pick<PromiseRow, "partyCode" | "slug" | "id">): string {
  if (row.partyCode && row.slug) {
    return `/obietnice/${encodeURIComponent(row.partyCode)}/${encodeURIComponent(row.slug)}`;
  }
  return `/obietnice/${row.id}`;
}

function normalize(s: string | null | undefined): string {
  return (s ?? "").toLocaleLowerCase("pl").replace(/\s+/g, " ").trim();
}

// Treat title and quote as the same text when one is a prefix of the other (or
// strictly equal after normalisation). Strips trailing punctuation typical for
// truncated headlines.
function titleEqualsQuote(title: string, quote: string | null): boolean {
  if (!quote) return false;
  const t = normalize(title).replace(/[.…]+$/, "");
  const q = normalize(quote).replace(/[.…]+$/, "");
  if (!t || !q) return false;
  if (t === q) return true;
  // Title is a prefix of the (often longer) quote, or vice versa.
  if (q.startsWith(t) || t.startsWith(q)) return true;
  return false;
}

export function PromiseCard({ row, idx }: { row: PromiseRow; idx: number }) {
  const klub = row.partyCode ? PARTY_TO_KLUB[row.partyCode] ?? null : null;
  const status = row.status;
  const color = statusColor(status);
  const href = detailHref(row);
  const showQuote = titleEqualsQuote(row.title, row.sourceQuote);
  const display = showQuote ? row.sourceQuote! : row.title;

  return (
    <Link
      href={href}
      className="block border-b border-border py-4 first:pt-2 hover:bg-muted transition-colors no-underline text-foreground"
      aria-labelledby={`promise-title-${row.id}`}
    >
      <article>
        <div className="flex items-baseline gap-2.5 mb-1.5 flex-wrap">
          <span className="font-mono text-[10px] text-muted-foreground tracking-wider tabular-nums">
            {String(idx + 1).padStart(3, "0")}
          </span>
          {klub && <ClubBadge klub={klub} variant="logo" size="md" />}
          <span className="font-sans text-[12px] font-medium text-foreground">
            {row.partyCode ? partyShort(row.partyCode) : "—"}
          </span>
          <span
            className="inline-flex items-center gap-1.5 font-sans text-[11px] font-medium uppercase tracking-[0.1em]"
            style={{ color }}
          >
            <span aria-hidden className="inline-block w-[8px] h-[8px] rounded-sm" style={{ background: color }} />
            {statusLabel(status)}
          </span>
          <span className="ml-auto font-mono text-[10px] text-muted-foreground">
            {row.sourceYear ?? "—"}
          </span>
        </div>

        <h3
          id={`promise-title-${row.id}`}
          className="font-serif font-medium m-0 leading-snug text-foreground"
          style={{ fontSize: "clamp(1.05rem, 2vw, 1.25rem)", textWrap: "balance" }}
        >
          {display}
        </h3>

        {row.matchCount > 0 && row.topMatchTerm && row.topMatchNumber && (
          <div className="mt-1.5 font-sans text-[12px] text-secondary-foreground">
            Druk {row.topMatchNumber}/{row.topMatchTerm}
            {row.topMatchPrintTitle ? ` — ${row.topMatchPrintTitle}` : ""}
            {row.matchCount > 1 && (
              <span className="text-muted-foreground font-mono text-[11px] ml-2">
                + {row.matchCount - 1}
              </span>
            )}
          </div>
        )}
      </article>
    </Link>
  );
}
