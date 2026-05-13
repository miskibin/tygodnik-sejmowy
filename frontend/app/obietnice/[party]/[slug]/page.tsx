import Link from "next/link";
import { notFound } from "next/navigation";
import { ClubBadge } from "@/components/clubs/ClubBadge";
import { MarkdownText } from "@/components/text/MarkdownText";
import { PageBreadcrumb } from "@/components/chrome/PageBreadcrumb";
import { ProcessStageBar } from "@/components/tygodnik/atoms/ProcessStageBar";
import {
  PARTY_TO_KLUB,
  getPromiseDetail,
  getPromiseDetailById,
  partyLabel,
  partyShort,
} from "@/lib/db/promises";
import type { PromiseEvidence } from "@/lib/db/promises";

const SPONSOR_AUTHORITY_LABEL: Record<string, string> = {
  rzad: "Rząd",
  prezydent: "Prezydent",
  klub_poselski: "Posłowie",
  senat: "Senat",
  komisja: "Komisja sejmowa",
  prezydium: "Prezydium Sejmu",
  obywatele: "Obywatele",
  inne: "Inne źródło",
};

function sponsorLine(e: PromiseEvidence): string | null {
  const auth = e.sponsorAuthority ? SPONSOR_AUTHORITY_LABEL[e.sponsorAuthority] ?? e.sponsorAuthority : null;
  if (e.sponsorAuthority === "klub_poselski" && e.sponsorMps.length > 0) {
    const head = e.sponsorMps.slice(0, 2).join(", ");
    const more = e.sponsorMps.length > 2 ? ` +${e.sponsorMps.length - 2}` : "";
    return `Posłowie: ${head}${more}`;
  }
  return auth;
}

function EvidenceCard({ e, variant }: { e: PromiseEvidence; variant: "confirmed" | "candidate" }) {
  const titleSize = variant === "confirmed" ? 18 : 16;
  const rationaleSize = variant === "confirmed" ? 14.5 : 13.5;
  const rationaleStyle = variant === "confirmed" ? "normal" : "italic";
  const sponsor = sponsorLine(e);
  const v = e.mainVoting;
  return (
    <li
      className={
        variant === "confirmed"
          ? "border-l-2 border-foreground pl-4"
          : "border-l-2 border-dotted border-border pl-4"
      }
    >
      <Link
        href={`/proces/${e.printTerm}/${encodeURIComponent(e.printNumber)}`}
        className="font-serif text-foreground hover:text-destructive no-underline leading-snug block"
        style={{ fontSize: titleSize }}
      >
        {e.printShortTitle ?? e.printTitle ?? `Druk ${e.printNumber}/${e.printTerm}`}
      </Link>

      {(sponsor || e.currentStageType || e.processPassed) && (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 font-sans text-[11.5px]">
          {sponsor && (
            <span className="inline-flex items-baseline gap-1.5">
              <span className="font-mono text-[9.5px] tracking-[0.14em] uppercase text-muted-foreground">
                Wniósł:
              </span>
              <span className="text-foreground">{sponsor}</span>
            </span>
          )}
          {(e.currentStageType || e.processPassed) && (
            <span className="inline-flex items-baseline gap-1.5">
              <span className="font-mono text-[9.5px] tracking-[0.14em] uppercase text-muted-foreground">
                Status:
              </span>
              <span className="text-foreground">
                {e.processPassed === true
                  ? "uchwalony"
                  : e.currentStageType === "Withdrawn"
                    ? "wycofany"
                    : e.currentStageType === "Rejected"
                      ? "odrzucony"
                      : e.currentStageType === "End"
                        ? "proces zakończony"
                        : stageShortLabel(e.currentStageType)}
              </span>
            </span>
          )}
        </div>
      )}

      <div className="mt-2">
        <ProcessStageBar
          currentStageType={e.currentStageType}
          processPassed={e.processPassed}
        />
      </div>

      {v && (
        <div className="mb-3 inline-flex items-baseline gap-2 flex-wrap font-sans text-[12px]">
          <span className="font-mono text-[9.5px] tracking-[0.14em] uppercase text-muted-foreground">
            Głosowanie:
          </span>
          <Link
            href={`/glosowanie/${v.votingId}`}
            className="text-foreground hover:text-destructive no-underline"
          >
            za {v.yes} · przeciw {v.no}
          </Link>
          <span
            className="font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm"
            style={{
              color:
                v.result === "passed"
                  ? "var(--success)"
                  : v.result === "failed"
                    ? "var(--destructive)"
                    : "var(--muted-foreground)",
              border: `1px solid ${
                v.result === "passed"
                  ? "var(--success)55"
                  : v.result === "failed"
                    ? "var(--destructive)55"
                    : "var(--muted-foreground)55"
              }`,
            }}
          >
            {v.result === "passed" ? "PRZESZŁO" : v.result === "failed" ? "NIE PRZESZŁO" : "OCZEKUJE"}
          </span>
          {v.date && (
            <span className="font-mono text-[10.5px] text-muted-foreground">
              {new Date(v.date).toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric" })}
            </span>
          )}
        </div>
      )}

      {e.rationale && (
        <p
          className="m-0 mt-1 font-serif text-secondary-foreground"
          style={{ fontSize: rationaleSize, lineHeight: 1.6, fontStyle: rationaleStyle }}
        >
          <MarkdownText text={e.rationale} />
        </p>
      )}

      <div className="font-mono text-[11px] text-muted-foreground mt-2 flex flex-wrap gap-x-3">
        <span>Druk {e.printNumber}/{e.printTerm}</span>
        {e.printTopic && (
          <span className="text-secondary-foreground">
            {TOPIC_LABEL[e.printTopic] ?? e.printTopic}
          </span>
        )}
        {e.similarity != null && <span>sim {e.similarity.toFixed(2)}</span>}
      </div>
    </li>
  );
}

// Short label for the inline "Status: ..." chip (the ProcessStageBar handles
// the visual track separately).
function stageShortLabel(stageType: string | null): string {
  if (!stageType) return "trafił do Sejmu";
  const m: Record<string, string> = {
    Start: "wpłynął",
    Opinion: "opinia",
    GovermentPosition: "stanowisko rządu",
    GovernmentPosition: "stanowisko rządu",
    ExpertOpinion: "opinia ekspertów",
    Referral: "skierowano do I czytania",
    ReadingReferral: "skierowano do I czytania",
    Reading: "I czytanie",
    CommitteeWork: "prace w komisji",
    CommitteeReport: "sprawozdanie komisji",
    SejmReading: "II czytanie",
    Voting: "głosowanie w Sejmie",
    SenatePosition: "stanowisko Senatu",
    SenateAmendments: "poprawki Senatu",
    ToPresident: "do Prezydenta",
    PresidentSignature: "podpisał Prezydent",
    PresidentVeto: "weto Prezydenta",
    ConstitutionalTribunal: "Trybunał Konstytucyjny",
    Promulgation: "publikacja w Dz.U.",
  };
  return m[stageType] ?? stageType;
}

export const revalidate = 300;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pl-PL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function hostFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const lastTwo = n % 100;
  const last = n % 10;
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return few;
  return many;
}

function normalize(s: string | null | undefined): string {
  return (s ?? "").toLocaleLowerCase("pl").replace(/\s+/g, " ").trim();
}

function quoteAddsContext(title: string, quote: string | null): boolean {
  if (!quote) return false;
  const t = normalize(title).replace(/[.…]+$/, "");
  const q = normalize(quote).replace(/[.…]+$/, "");
  if (!t || !q) return false;
  if (t === q) return false;
  if (q.startsWith(t) || t.startsWith(q)) return false;
  return true;
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

  let detail = await getPromiseDetail(party, slug);
  if (!detail && /^\d+$/.test(slug)) {
    detail = await getPromiseDetailById(parseInt(slug, 10));
  }
  if (!detail) notFound();

  const klub = detail.partyCode ? PARTY_TO_KLUB[detail.partyCode] ?? null : null;
  const confirmedEvidence = detail.evidence.filter((e) => e.matchStatus === "confirmed");
  const candidateEvidence = detail.evidence.filter((e) => e.matchStatus === "candidate");
  const showQuoteAsContext = quoteAddsContext(detail.title, detail.sourceQuote);
  const host = hostFromUrl(detail.sourceUrl);

  // Build the "co rusza w Sejmie" pill that replaces the dead status enum.
  const activityParts: Array<{ label: string; tone: "strong" | "weak" | "muted" }> = [];
  if (confirmedEvidence.length > 0) {
    activityParts.push({
      label: `${confirmedEvidence.length} ${plural(confirmedEvidence.length, "druk", "druki", "druków")}`,
      tone: "strong",
    });
  }
  if (candidateEvidence.length > 0) {
    activityParts.push({
      label: `${candidateEvidence.length} ${plural(candidateEvidence.length, "możliwy", "możliwe", "możliwych")}`,
      tone: "weak",
    });
  }
  if (detail.votings.length > 0) {
    activityParts.push({
      label: `${detail.votings.length} ${plural(detail.votings.length, "głosowanie", "głosowania", "głosowań")}`,
      tone: "strong",
    });
  }

  return (
    <div className="bg-background text-foreground font-serif pb-24">
      <div className="max-w-[1100px] mx-auto px-4 md:px-8 lg:px-14 pt-6 md:pt-9">
        <PageBreadcrumb
          items={[
            { label: "Obietnice", href: "/obietnice" },
            ...(detail.partyCode
              ? [
                  {
                    label: partyShort(detail.partyCode),
                    href: `/obietnice?parties=${encodeURIComponent(detail.partyCode)}`,
                  },
                ]
              : []),
            { label: detail.title },
          ]}
        />

        <header className="border-b-2 border-rule pb-7 mb-7">
          <div className="flex items-center gap-3 mb-5 flex-wrap">
            {klub && <ClubBadge klub={klub} variant="logo" size="lg" />}
            <span className="font-sans text-[13px] font-medium text-foreground">
              {detail.partyCode ? partyLabel(detail.partyCode) : ""}
            </span>
            {detail.sourceYear && (
              <span className="font-mono text-[11px] text-muted-foreground">
                obietnica z {detail.sourceYear}
              </span>
            )}
          </div>

          <h1
            className="font-serif font-medium m-0 leading-tight"
            style={{
              fontSize: "clamp(1.75rem, 4vw, 2.75rem)",
              textWrap: "balance",
            }}
          >
            {detail.title}
          </h1>

          {showQuoteAsContext && detail.sourceQuote && (
            <blockquote
              className="m-0 mt-5 font-serif italic text-secondary-foreground"
              style={{
                fontSize: "clamp(1rem, 1.6vw, 1.15rem)",
                lineHeight: 1.5,
                borderLeft: "3px solid var(--border)",
                paddingLeft: 16,
                textWrap: "pretty",
              }}
            >
              {detail.sourceQuote}
            </blockquote>
          )}

          <div className="mt-6 flex items-center gap-x-4 gap-y-2 flex-wrap font-sans text-[13px]">
            {activityParts.length > 0 ? (
              <span className="inline-flex items-center gap-2">
                <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
                  Ruch w Sejmie:
                </span>
                {activityParts.map((p, i) => (
                  <span
                    key={i}
                    style={{
                      color:
                        p.tone === "strong"
                          ? "var(--foreground)"
                          : p.tone === "weak"
                            ? "var(--secondary-foreground)"
                            : "var(--muted-foreground)",
                      fontWeight: p.tone === "strong" ? 500 : 400,
                    }}
                  >
                    {i > 0 && <span className="text-border mr-2">·</span>}
                    {p.label}
                  </span>
                ))}
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 font-sans text-[12px] italic text-muted-foreground">
                <span className="font-mono text-[10px] tracking-[0.14em] uppercase not-italic">
                  Ruch w Sejmie:
                </span>
                bez ruchu w Sejmie (na razie żaden druk nie został powiązany)
              </span>
            )}
            {host && detail.sourceUrl && (
              <a
                href={detail.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="ml-auto font-mono text-[11px] text-destructive underline decoration-dotted underline-offset-4"
              >
                źródło: {host} ↗
              </a>
            )}
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-10">
          <main>
            {confirmedEvidence.length > 0 && (
              <section className="mb-10" aria-labelledby="evidence-heading">
                <h2
                  id="evidence-heading"
                  className="font-mono text-[10px] tracking-[0.16em] uppercase text-muted-foreground mb-3"
                >
                  Powiązane druki ({confirmedEvidence.length})
                </h2>
                <ul className="list-none p-0 m-0 space-y-6">
                  {confirmedEvidence.map((e) => (
                    <EvidenceCard key={`${e.printTerm}-${e.printNumber}-c`} e={e} variant="confirmed" />
                  ))}
                </ul>
              </section>
            )}

            {candidateEvidence.length > 0 && (
              <section className="mb-10" aria-labelledby="candidate-evidence-heading">
                <h2
                  id="candidate-evidence-heading"
                  className="font-mono text-[10px] tracking-[0.16em] uppercase text-muted-foreground mb-1"
                >
                  Możliwe powiązania ({candidateEvidence.length})
                </h2>
                <p className="font-sans text-[11px] text-muted-foreground mb-3 leading-relaxed max-w-prose">
                  Druki dotykają tematu obietnicy, ale dopasowanie nie jest pewne. Traktuj jako wskazówkę, nie dowód.
                </p>
                <ul className="list-none p-0 m-0 space-y-5 opacity-85">
                  {candidateEvidence.map((e) => (
                    <EvidenceCard key={`${e.printTerm}-${e.printNumber}-d`} e={e} variant="candidate" />
                  ))}
                </ul>
              </section>
            )}

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
                        className="grid grid-cols-[90px_1fr_auto] gap-3 items-baseline border-b border-border pb-3"
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
              <section
                className="mb-10 px-5 py-6 border-l-2"
                style={{ borderColor: "var(--border)", background: "var(--muted)" }}
              >
                <p
                  className="m-0 font-serif text-secondary-foreground"
                  style={{ fontSize: 15.5, lineHeight: 1.6 }}
                >
                  Nie znaleźliśmy druków sejmowych dopasowanych do tej obietnicy. Może to znaczyć, że
                  partia nie podjęła jeszcze działań legislacyjnych — albo że dopasowanie semantyczne
                  ich nie znalazło. Wrócimy do tego, gdy bazę uzupełnimy.
                </p>
              </section>
            )}
          </main>

          <aside className="lg:border-l lg:border-rule lg:pl-8 space-y-8">
            {detail.related.length > 0 && (
              <div>
                <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-muted-foreground mb-3">
                  Inne obietnice {detail.partyCode ? partyShort(detail.partyCode) : ""}
                </div>
                <ul className="list-none p-0 m-0 space-y-3">
                  {detail.related.slice(0, 5).map((r) => {
                    const href =
                      r.partyCode && r.slug
                        ? `/obietnice/${encodeURIComponent(r.partyCode)}/${encodeURIComponent(r.slug)}`
                        : `/obietnice/${r.id}`;
                    return (
                      <li key={r.id} className="border-b border-dotted border-border pb-3 last:border-0">
                        <Link
                          href={href}
                          className="font-serif text-foreground hover:text-destructive no-underline leading-snug block"
                          style={{ fontSize: 14 }}
                        >
                          {r.title}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                {detail.partyCode && (
                  <Link
                    href={`/obietnice?parties=${encodeURIComponent(detail.partyCode)}`}
                    className="block mt-4 font-sans text-[12px] text-destructive underline decoration-dotted underline-offset-4"
                  >
                    Wszystkie obietnice {partyShort(detail.partyCode)} →
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
