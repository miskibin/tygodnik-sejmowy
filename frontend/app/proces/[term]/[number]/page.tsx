import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPrint } from "@/lib/db/prints";
import { getProcessCitations } from "@/lib/db/statements";
import { shouldProjectLawTimeline } from "@/lib/process-timeline";
import { opinionSourceLabel, opinionSourceShort, promiseStatusLabel } from "@/lib/labels";
import { PrintCard } from "@/components/print/PrintCard";
import { Hero } from "./_components/Hero";
import { Timeline } from "./_components/Timeline";
import { Summary } from "./_components/Summary";
import { Citations } from "./_components/Citations";
import { Votings } from "./_components/Votings";
import { Committees } from "./_components/Committees";
import { ProceedingPoints } from "./_components/ProceedingPoints";
import { Sources } from "./_components/Sources";


// Dynamic rendering: getProcessCitations samples a random subset of
// viral quotes (Fisher-Yates) per request, and the "rotate on reload"
// experience depends on no cached HTML. Without this, ISR/static could
// freeze the sample. Build manifest confirmed this route stays "ƒ"
// (dynamic).
export const revalidate = 0;

export async function generateMetadata({
  params,
}: { params: Promise<{ term: string; number: string }> }): Promise<Metadata> {
  const { term: tRaw, number } = await params;
  const term = Number(tRaw);
  if (!Number.isSafeInteger(term) || term <= 0) return {};
  const data = await getPrint(term, number);
  if (!data) return {};
  const p = data.print;
  const baseTitle = p.shortTitle?.trim() || p.title?.trim() || `Druk ${term}/${number}`;
  // Drop Polish "ustawa o" boilerplate from title where possible — keeps
  // <title> scannable in SERPs (~60-char window).
  const title = `Druk ${term}/${number} — ${baseTitle}`.slice(0, 110);
  const desc =
    p.impactPunch?.trim() ||
    p.summaryPlain?.trim()?.slice(0, 240) ||
    `Pełny przebieg projektu ustawy ${term}/${number}: etapy procesu, głosowania, opinie, dopasowane obietnice wyborcze.`;
  const path = `/proces/${term}/${number}`;
  return {
    title,
    description: desc,
    alternates: { canonical: path },
    openGraph: {
      title,
      description: desc,
      url: path,
      type: "article",
      publishedTime: p.documentDate ?? undefined,
      modifiedTime: p.changeDate ?? undefined,
    },
    twitter: { card: "summary_large_image", title, description: desc },
  };
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });
}

export default async function DrukPage({
  params,
}: {
  params: Promise<{ term: string; number: string }>;
}) {
  const { term: rawTerm, number } = await params;
  const term = Number(rawTerm);
  if (!Number.isFinite(term)) notFound();

  const data = await getPrint(term, number);
  if (!data) notFound();
  const {
    print,
    stages,
    committeeSittings,
    mainVoting,
    votingByClub,
    relatedVotings,
    subPrints,
    matchedPromises,
    outcome,
    attachments,
    proceedingPoints,
  } = data;

  const processStillOpen = !outcome?.passed && !print.currentStageType?.match(/^(End|Withdrawn|Rejected)$/);

  return (
    <main className="bg-background text-foreground pb-20">
      <div className="max-w-[1280px] mx-auto px-4 md:px-8 lg:px-14 pt-7 md:pt-9">
        <nav aria-label="Powrót" className="flex gap-6 mb-7 text-[13px] text-muted-foreground">
          <Link href="/tygodnik" className="hover:underline">← Tygodnik</Link>
          <Link href="/proces" className="hover:underline">Wszystkie dokumenty</Link>
        </nav>
        <Hero print={print} outcome={outcome} mainVoting={mainVoting} />
      </div>

      <div className="max-w-[1280px] mx-auto px-4 md:px-8 lg:px-14">
        <Summary print={print} />
      </div>
      <Timeline
        stages={stages}
        votings={relatedVotings}
        processStillOpen={!!processStillOpen}
        projectFutureLawPath={shouldProjectLawTimeline(print.documentCategory)}
      />
      <div className="max-w-[1280px] mx-auto px-4 md:px-8 lg:px-14">
        <Votings
          votings={relatedVotings}
          mainVotingId={mainVoting?.votingId ?? null}
          votingByClub={votingByClub}
        />
        <Suspense fallback={<p role="status" className="py-6 text-sm text-muted-foreground">Wczytywanie wypowiedzi…</p>}>
          <ProcessCitations term={term} number={number} />
        </Suspense>
        <Committees stages={stages} committeeSittings={committeeSittings} />
        <ProceedingPoints points={proceedingPoints} />

        {/* Dz.U. publication banner — kept from old layout, repositioned here. */}
        {outcome?.passed && outcome.act && (
          <section className="py-10 border-b border-border">
            <div
              className="px-4 py-3.5 border-l-2 max-w-[820px]"
              style={{ borderColor: "var(--success)", background: "var(--muted)" }}
            >
              <div className="font-sans text-[11px] text-success mb-1.5 font-medium">
                ✓ W Dzienniku Ustaw
              </div>
              <div className="text-[18px] text-foreground leading-snug mb-1">
                {outcome.act.displayAddress}
              </div>
              {outcome.act.status && (
                <div className="font-sans text-[11px] text-muted-foreground mb-2">
                  status: <span className="text-secondary-foreground">{outcome.act.status}</span>
                  {outcome.act.publishedAt
                    ? ` · opubl. ${formatDate(outcome.act.publishedAt)}`
                    : ""}
                </div>
              )}
              {outcome.act.sourceUrl && (
                <a
                  href={outcome.act.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-sans text-[12px] text-foreground underline decoration-dotted underline-offset-4 hover:decoration-solid"
                >
                  ↗ Zobacz tekst ustawy w ISAP
                </a>
              )}
            </div>
          </section>
        )}

        {subPrints.length > 0 && (
          <section className="py-10 border-b border-border">
            <div className="text-[11px] text-muted-foreground mb-4 font-sans font-medium">
              ✶ Dokumenty towarzyszące ({subPrints.length})
            </div>
            <ul className="font-sans text-[13px]">
              {subPrints.map((s) => (
                <PrintCard
                  key={s.number}
                  variant="row"
                  id={0}
                  term={print.term}
                  number={s.number}
                  shortTitle={s.shortTitle}
                  title={s.title}
                  opinionSource={s.opinionSource}
                  opinionSourceShort={opinionSourceShort(s.opinionSource)}
                  opinionSourceLabel={opinionSourceLabel(s.opinionSource)}
                />
              ))}
            </ul>
          </section>
        )}

        {matchedPromises.length > 0 && (
          <section className="py-10 border-b border-border">
            <div className="text-[11px] text-muted-foreground mb-4 font-sans font-medium">
              ✶ Powiązane obietnice wyborcze ({matchedPromises.length})
            </div>
            <ul className="font-sans text-[13px]">
              {matchedPromises.map((m) => {
                const status = promiseStatusLabel(m.status);
                return (
                  <li
                    key={m.promiseId}
                    className="py-3.5 border-b border-dotted border-border"
                  >
                    <div className="flex items-baseline gap-3 mb-1 text-[11px] font-medium">
                      {m.partyCode && (
                        <span className="text-warning">{m.partyCode}</span>
                      )}
                      {status && (
                        <span className="text-muted-foreground font-mono tracking-normal">
                          · {status}
                        </span>
                      )}
                    </div>
                    <div className="text-[15px] leading-snug text-foreground">
                      {m.title}
                    </div>
                    {m.rationale && (
                      <div className="text-[12.5px] text-muted-foreground mt-1 leading-snug">
                        {m.rationale}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <Sources
          term={print.term}
          number={print.number}
          attachments={attachments}
          subPrints={subPrints}
        />
      </div>
    </main>
  );
}

async function ProcessCitations({ term, number }: { term: number; number: string }) {
  let items: Awaited<ReturnType<typeof getProcessCitations>>;
  try {
    items = await getProcessCitations(term, number);
  } catch (err) {
    console.error("Process citations unavailable", { term, number, err });
    return null;
  }
  return <Citations items={items} />;
}
