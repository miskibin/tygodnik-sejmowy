import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPrint } from "@/lib/db/prints";
import { documentCategoryLabel, opinionSourceLabel, opinionSourceShort, promiseStatusLabel } from "@/lib/labels";
import { PrintCard } from "@/components/print/PrintCard";
import { NotFoundPage } from "@/components/chrome/NotFoundPage";
import { PageBreadcrumb } from "@/components/chrome/PageBreadcrumb";
import { Hero } from "./_components/Hero";
import { Timeline } from "./_components/Timeline";
import { Streszczenie } from "./_components/Streszczenie";
import { Votings } from "./_components/Votings";
import { Komisje } from "./_components/Komisje";
import { Zrodla } from "./_components/Zrodla";


export async function generateMetadata({
  params,
}: { params: Promise<{ term: string; number: string }> }): Promise<Metadata> {
  const { term: tRaw, number } = await params;
  const term = Number(tRaw);
  if (!Number.isFinite(term)) return {};
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
  const path = `/druk/${term}/${number}`;
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

  // Fail closed on DB errors → branded 404 instead of Next default page.
  let data: Awaited<ReturnType<typeof getPrint>> = null;
  try {
    data = await getPrint(term, number);
  } catch (err) {
    console.error("[/druk/[term]/[number]] getPrint failed", { term, number, err });
    return (
      <NotFoundPage
        entity="Druk"
        gender="m"
        id={`${term}/${number}`}
        message="Nie udało się załadować druku. Spróbuj odświeżyć stronę lub sprawdź jego stronę w Sejmie."
      />
    );
  }
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
  } = data;

  const processStillOpen = !outcome?.passed && !print.currentStageType?.match(/^(End|Withdrawn|Rejected)$/);

  return (
    <div className="bg-background text-foreground font-serif pb-20">
      <div className="max-w-[1280px] mx-auto px-4 md:px-8 lg:px-14 pt-7 md:pt-9">
        <PageBreadcrumb
          items={[
            { label: "Druki" },
            { label: `Kadencja ${print.term}` },
            { label: print.shortTitle || print.title || `Druk ${print.number}` },
          ]}
          subtitle={
            `${documentCategoryLabel(print.documentCategory) ?? "druk sejmowy"}` +
            (print.changeDate ? ` · ${formatDate(print.changeDate)}` : "")
          }
        />
        {(print.isMetaDocument || print.isProcedural) && (
          <div
            className="font-sans text-[12px] text-secondary-foreground mb-5 max-w-[760px] leading-[1.55] px-3 py-2 border-l-2"
            style={{ borderColor: "var(--warning)", background: "var(--muted)" }}
          >
            <span className="font-medium text-foreground">
              {print.isProcedural ? "Dokument proceduralny" : "Dokument towarzyszący"}
            </span>{" "}
            — {print.isProcedural
              ? "techniczny krok w procesie legislacyjnym, nie zmienia prawa bezpośrednio."
              : "ten druk nie zmienia prawa bezpośrednio."}
            {print.parentNumber && (
              <>
                {" "}Dotyczy{" "}
                <a
                  href={`/druk/${print.term}/${encodeURIComponent(print.parentNumber)}`}
                  className="text-destructive underline decoration-dotted underline-offset-4"
                >
                  druku nr {print.parentNumber}
                </a>
                .
              </>
            )}
          </div>
        )}

        <Hero print={print} outcome={outcome} />
      </div>

      <Timeline stages={stages} votings={relatedVotings} processStillOpen={!!processStillOpen} />

      <div className="max-w-[1280px] mx-auto px-4 md:px-8 lg:px-14">
        <Streszczenie print={print} />
        <Votings
          votings={relatedVotings}
          mainVotingId={mainVoting?.votingId ?? null}
          votingByClub={votingByClub}
          processStillOpen={!!processStillOpen}
        />
        <Komisje stages={stages} committeeSittings={committeeSittings} />

        {/* Dz.U. publication banner — kept from old layout, repositioned here. */}
        {outcome?.passed && outcome.act && (
          <section className="py-10 border-b border-border">
            <div
              className="px-4 py-3.5 border-l-2 max-w-[820px]"
              style={{ borderColor: "var(--success)", background: "var(--muted)" }}
            >
              <div className="font-sans text-[10px] tracking-[0.16em] uppercase text-success mb-1.5">
                ✓ W Dzienniku Ustaw
              </div>
              <div className="font-serif text-[18px] text-foreground leading-snug mb-1">
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
                  className="font-sans text-[12px] text-destructive underline decoration-dotted underline-offset-4 hover:decoration-solid"
                >
                  ↗ Zobacz tekst ustawy w ISAP
                </a>
              )}
            </div>
          </section>
        )}

        {subPrints.length > 0 && (
          <section className="py-10 border-b border-border">
            <div className="text-[10px] tracking-[0.16em] uppercase text-destructive mb-4 font-sans">
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
            <div className="text-[10px] tracking-[0.16em] uppercase text-destructive mb-4 font-sans">
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
                    <div className="flex items-baseline gap-3 mb-1 text-[10px] tracking-[0.16em] uppercase">
                      {m.partyCode && (
                        <span className="text-warning">{m.partyCode}</span>
                      )}
                      {status && (
                        <span className="text-muted-foreground font-mono tracking-normal">
                          · {status}
                        </span>
                      )}
                    </div>
                    <div className="font-serif text-[15px] leading-snug text-foreground">
                      {m.title}
                    </div>
                    {m.rationale && (
                      <div className="font-serif italic text-[12.5px] text-muted-foreground mt-1 leading-snug">
                        {m.rationale}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <Zrodla
          term={print.term}
          number={print.number}
          attachments={attachments}
          subPrints={subPrints}
        />
      </div>
    </div>
  );
}
