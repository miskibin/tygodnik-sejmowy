import Link from "next/link";
import { notFound } from "next/navigation";
import { ClubBadge } from "@/components/clubs/ClubBadge";
import { MarkdownText } from "@/components/text/MarkdownText";
import {
  PARTY_TO_KLUB,
  getPromiseDetail,
  getPromiseDetailById,
  partyLabel,
  partyShort,
  statusColor,
  statusLabel,
} from "@/lib/db/promises";

export const dynamic = "force-dynamic";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pl-PL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const TOPIC_LABEL: Record<string, string> = {
  mieszkania: "Mieszkania",
  zdrowie: "Zdrowie",
  energetyka: "Energetyka",
  obrona: "Obrona",
  rolnictwo: "Rolnictwo",
  edukacja: "Edukacja",
  sprawiedliwosc: "Sprawiedliwość",
  podatki: "Podatki",
  inne: "Inne",
};

export default async function PromiseDetailPage({
  params,
}: {
  params: Promise<{ party: string; slug: string }>;
}) {
  const { party, slug } = await params;

  // Allow numeric fallback: /obietnice/[party]/[id-as-number].
  let detail = await getPromiseDetail(party, slug);
  if (!detail && /^\d+$/.test(slug)) {
    detail = await getPromiseDetailById(parseInt(slug, 10));
  }
  if (!detail) notFound();

  const klub = detail.partyCode ? PARTY_TO_KLUB[detail.partyCode] ?? null : null;
  const color = statusColor(detail.status);

  return (
    <div className="bg-background text-foreground font-serif pb-24">
      <div className="max-w-[1100px] mx-auto px-4 md:px-8 lg:px-14 pt-6 md:pt-9">
        {/* Breadcrumb */}
        <nav
          aria-label="Ścieżka nawigacji"
          className="font-mono text-[10px] tracking-[0.16em] uppercase text-muted-foreground mb-5"
        >
          <Link href="/obietnice" className="hover:text-destructive">
            ← Rejestr obietnic
          </Link>
          {detail.partyCode && (
            <>
              <span className="mx-2 text-border">/</span>
              <Link
                href={`/obietnice?parties=${encodeURIComponent(detail.partyCode)}`}
                className="hover:text-destructive"
              >
                {partyShort(detail.partyCode)}
              </Link>
            </>
          )}
        </nav>

        {/* Hero — pull-quote first */}
        <header className="border-b-2 border-rule pb-7 mb-7">
          <div className="flex items-center gap-3 mb-5 flex-wrap">
            {klub && <ClubBadge klub={klub} variant="logo" size="lg" />}
            <span className="font-sans text-[13px] font-medium text-foreground">
              {detail.partyCode ? partyLabel(detail.partyCode) : ""}
            </span>
            <span
              className="ml-auto inline-flex items-center gap-2 font-sans text-[12px] font-medium uppercase tracking-[0.1em] px-3 py-1.5 rounded-sm"
              style={{ color, border: `1px solid ${color}55`, background: `${color}14` }}
            >
              <span aria-hidden className="inline-block w-[10px] h-[10px] rounded-sm" style={{ background: color }} />
              {statusLabel(detail.status)}
            </span>
          </div>

          {/* Show ONE primary text — quote when present, else title. Drop the
              second-rate "stub title" repetition that the citizen test flagged. */}
          {detail.sourceQuote ? (
            <blockquote
              className="m-0 mb-5 font-serif italic text-foreground"
              style={{
                fontSize: "clamp(1.5rem, 3.5vw, 2.5rem)",
                lineHeight: 1.2,
                borderLeft: "4px solid var(--destructive)",
                paddingLeft: 24,
                textWrap: "pretty",
              }}
            >
              <span aria-hidden className="text-destructive mr-2" style={{ fontSize: 36 }}>
                ❝
              </span>
              {detail.sourceQuote}
            </blockquote>
          ) : (
            <h1
              className="font-serif font-medium m-0 leading-tight"
              style={{ fontSize: "clamp(1.75rem, 4vw, 2.75rem)", textWrap: "balance" }}
            >
              {detail.title}
            </h1>
          )}

          <div className="mt-5 flex items-center gap-4 flex-wrap font-sans text-[12px]">
            {detail.sourceUrl && (
              <a
                href={detail.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="text-destructive underline decoration-dotted underline-offset-4"
              >
                źródło ↗
              </a>
            )}
            {detail.sourceYear && (
              <span className="font-mono text-[11px] text-muted-foreground">{detail.sourceYear}</span>
            )}
            {detail.confidence != null && (
              <span className="font-mono text-[11px] text-muted-foreground">
                uznanie {detail.confidence.toFixed(2)}
              </span>
            )}
          </div>
        </header>

        {/* Main + sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-10">
          <main>
            {/* Evidence list */}
            {detail.evidence.length > 0 && (
              <section className="mb-10" aria-labelledby="evidence-heading">
                <h2
                  id="evidence-heading"
                  className="font-mono text-[10px] tracking-[0.16em] uppercase text-muted-foreground mb-3"
                >
                  Powiązane druki ({detail.evidence.length})
                </h2>
                <ul className="list-none p-0 m-0 space-y-4">
                  {detail.evidence.map((e) => (
                    <li
                      key={`${e.printTerm}-${e.printNumber}`}
                      className="border-l-2 border-border pl-4"
                    >
                      <Link
                        href={`/druk/${e.printTerm}/${encodeURIComponent(e.printNumber)}`}
                        className="font-serif text-foreground hover:text-destructive no-underline"
                        style={{ fontSize: 18 }}
                      >
                        {e.printShortTitle ?? e.printTitle ?? `Druk ${e.printNumber}/${e.printTerm}`}
                      </Link>
                      <div className="font-mono text-[11px] text-muted-foreground mt-1">
                        Druk {e.printNumber}/{e.printTerm}
                        {e.printTopic && (
                          <>
                            {" · "}
                            <span className="text-secondary-foreground">{TOPIC_LABEL[e.printTopic] ?? e.printTopic}</span>
                          </>
                        )}
                        {e.similarity != null && <> · sim {e.similarity.toFixed(2)}</>}
                      </div>
                      {e.rationale && (
                        <p
                          className="m-0 mt-2 font-serif italic text-secondary-foreground"
                          style={{ fontSize: 14, lineHeight: 1.55 }}
                        >
                          <MarkdownText text={e.rationale} />
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Voting timeline */}
            {detail.votings.length > 0 && (
              <section aria-labelledby="voting-heading" className="mb-10">
                <h2
                  id="voting-heading"
                  className="font-mono text-[10px] tracking-[0.16em] uppercase text-muted-foreground mb-3"
                >
                  Oś głosowań ({detail.votings.length})
                </h2>
                <ol className="list-none p-0 m-0 space-y-3">
                  {detail.votings.map((v) => {
                    const resultLabel =
                      v.result === "passed"
                        ? "PRZESZŁO"
                        : v.result === "failed"
                          ? "NIE PRZESZŁO"
                          : "OCZEKUJE";
                    const resultColor =
                      v.result === "passed"
                        ? "var(--success)"
                        : v.result === "failed"
                          ? "var(--destructive)"
                          : "var(--muted-foreground)";
                    return (
                      <li
                        key={v.votingId}
                        className="grid grid-cols-[80px_1fr_auto] gap-3 items-baseline border-b border-border pb-3"
                      >
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {formatDate(v.date)}
                        </span>
                        <span className="font-serif text-foreground" style={{ fontSize: 15 }}>
                          {v.title ?? v.printShortTitle ?? `Głosowanie #${v.votingId}`}
                        </span>
                        <span
                          className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-sm"
                          style={{ color: resultColor, border: `1px solid ${resultColor}55` }}
                        >
                          {resultLabel}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </section>
            )}

            {detail.evidence.length === 0 && detail.votings.length === 0 && (
              <p className="font-serif italic text-muted-foreground py-8" style={{ fontSize: 16 }}>
                Brak potwierdzonych dopasowań do druków sejmowych. Status oparty na deklaracji
                własnej partii lub przeglądzie ręcznym.
              </p>
            )}
          </main>

          <aside className="lg:border-l lg:border-rule lg:pl-10">
            {detail.related.length > 0 && (
              <div className="mb-8">
                <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-muted-foreground mb-3">
                  Inne obietnice {detail.partyCode ? partyShort(detail.partyCode) : ""}
                </div>
                <ul className="list-none p-0 m-0 space-y-3">
                  {detail.related.slice(0, 3).map((r) => {
                    const c = statusColor(r.status);
                    const href =
                      r.partyCode && r.slug
                        ? `/obietnice/${encodeURIComponent(r.partyCode)}/${encodeURIComponent(r.slug)}`
                        : `/obietnice/${r.id}`;
                    return (
                      <li key={r.id} className="border-b border-dotted border-border pb-3">
                        <Link
                          href={href}
                          className="font-serif text-foreground hover:text-destructive no-underline leading-snug"
                          style={{ fontSize: 14 }}
                        >
                          {r.title}
                        </Link>
                        <div className="mt-1.5 inline-flex items-center gap-1.5 font-sans text-[10px]" style={{ color: c }}>
                          <span aria-hidden className="inline-block w-[6px] h-[6px] rounded-sm" style={{ background: c }} />
                          {statusLabel(r.status)}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {detail.partyCode && (
              <div>
                <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-muted-foreground mb-3">
                  Porównaj
                </div>
                <Link
                  href={`/obietnice?compare=${encodeURIComponent(detail.partyCode)},PiS`}
                  className="font-sans text-[12px] text-destructive underline decoration-dotted underline-offset-4 block"
                >
                  {partyShort(detail.partyCode)} vs PiS →
                </Link>
                {detail.partyCode !== "KO" && (
                  <Link
                    href={`/obietnice?compare=${encodeURIComponent(detail.partyCode)},KO`}
                    className="font-sans text-[12px] text-destructive underline decoration-dotted underline-offset-4 block mt-1.5"
                  >
                    {partyShort(detail.partyCode)} vs KO →
                  </Link>
                )}
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
