import Link from "next/link";
import { notFound } from "next/navigation";
import { Quote, ListChecks, Clock, FileText } from "lucide-react";
import { getStatementDetail, getRelatedStatements, type StatementDetail } from "@/lib/db/statements";
import { StatementHero } from "@/components/statement/StatementHero";
import { ViralQuote } from "@/components/statement/ViralQuote";
import { AnnotatedTranscript } from "@/components/statement/AnnotatedTranscript";
import { RelatedSpeeches } from "@/components/statement/RelatedSpeeches";
import { SectionLabel } from "@/components/statement/SectionLabel";
import { StatementContextStrip } from "@/components/statement/StatementContextStrip";
import { NotFoundPage } from "@/components/chrome/NotFoundPage";
import { PageBreadcrumb } from "@/components/chrome/PageBreadcrumb";


export default async function StatementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: raw } = await params;
  const id = Number(raw);
  if (!Number.isFinite(id) || id <= 0) notFound();

  // Fail closed: any DB / network error surfaces as branded 404 rather than
  // a Next.js error page. The user-reported breakage on /mowa/84534 was a
  // statement-row that exists but has body_text=NULL — old code routed that
  // to notFound(). Now: render hero + "treść niedostępna" placeholder.
  let s: StatementDetail | null = null;
  try {
    s = await getStatementDetail(id);
  } catch (err) {
    console.error("[/mowa/[id]] getStatementDetail failed", { id, err });
    return (
      <NotFoundPage
        entity="Wypowiedź"
        gender="f"
        id={id}
        message="Nie udało się załadować wypowiedzi. Spróbuj odświeżyć stronę lub wrócić do listy."
        backLink={{ href: "/mowa", label: "Wróć do listy wypowiedzi →" }}
      />
    );
  }
  if (!s) notFound();

  const hasBody = !!s.bodyText && s.bodyText.trim().length > 0;

  // Related-speeches is best-effort. If it throws (rare — same supabase
  // connection as the detail fetch), render the page without it.
  let related: Awaited<ReturnType<typeof getRelatedStatements>> = [];
  try {
    related = await getRelatedStatements(s.mpId, s.topicTags, s.id, 3);
  } catch (err) {
    console.error("[/mowa/[id]] getRelatedStatements failed", { id, err });
  }

  const minutesEst = hasBody ? Math.max(1, Math.round(s.bodyText.trim().split(/\s+/).length / 200)) : null;

  // Magazine 2-column layout. xl+ (1280px+) splits below the hero/quote into:
  //   left  (1fr)   → Pełna wypowiedź transcript with inline highlights +
  //                   stage-direction chips in its own right margin
  //   right (320px, sticky) → Kontekst posiedzenia · Kluczowe tezy · druki
  // Below xl the sidebar collapses underneath, restoring the single-column
  // reading order used on tablet/mobile. xl (not lg) is chosen because the
  // transcript itself has an internal md+ margin column for stage directions
  // — at lg the inner+outer columns would crowd the prose to ~460px wide.
  return (
    <main className="bg-background text-foreground min-h-screen pb-20">
      <div className="max-w-[1240px] mx-auto px-4 md:px-8 lg:px-14 pt-6">
        <PageBreadcrumb
          items={[
            { label: "Mowa sejmowa", href: "/mowa" },
            { label: s.speakerName || `Wypowiedź ${s.num}` },
          ]}
        />
      </div>

      <article className="max-w-[1240px] mx-auto px-4 md:px-8 lg:px-14">
        {/* Hero spans both columns — stays magazine-wide */}
        <div className="max-w-[820px] mx-auto">
          <StatementHero
            speakerName={s.speakerName}
            fn={s.function}
            klub={s.clubRef}
            district={s.mpDistrictNum}
            districtName={s.mpDistrictName}
            mpId={s.mpId}
            photoUrl={s.mpPhotoUrl}
            topicTags={s.topicTags}
            tone={s.tone}
            addressee={s.addressee}
            date={s.startDatetime ?? s.dayDate}
            proceedingNumber={s.proceedingNumber}
            dayIdx={s.dayIdx}
          />

          {s.viralQuote ? (
            <ViralQuote quote={s.viralQuote} reason={s.viralReason} tone={s.tone} />
          ) : (
            s.summaryOneLine && (
              <p className="my-10 max-w-[720px] mx-auto font-serif italic text-secondary-foreground leading-snug" style={{ fontSize: 22, textWrap: "pretty" }}>
                {s.summaryOneLine}
              </p>
            )
          )}

          {s.viralQuote && s.summaryOneLine && (
            <p className="font-serif text-secondary-foreground m-0 mb-2 leading-snug max-w-[680px] mx-auto" style={{ fontSize: 17, textWrap: "pretty" }}>
              {s.summaryOneLine}
            </p>
          )}
        </div>

        <div className="mt-8 xl:grid xl:grid-cols-[minmax(0,1fr)_320px] xl:gap-10 xl:gap-14">
          {/* MAIN COLUMN — transcript */}
          <div className="min-w-0">
            {hasBody ? (
              <>
                <SectionLabel
                  icon={Quote}
                  label="Pełna wypowiedź"
                  subtitle={
                    minutesEst
                      ? `${minutesEst} min czytania · podświetlone fragmenty wybrał model jako kluczowe`
                      : "Pełny tekst wypowiedzi ze stenogramu"
                  }
                />
                <AnnotatedTranscript
                  bodyText={s.bodyText}
                  transcriptUrl={s.transcriptUrl}
                  viralQuote={s.viralQuote}
                  keyClaims={s.keyClaims}
                />
              </>
            ) : (
              <section
                role="status"
                aria-label="Treść wypowiedzi nie jest jeszcze dostępna"
                className="my-12 px-5 py-6 border-l-2 border-destructive"
                style={{ background: "var(--muted)" }}
              >
                <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-destructive mb-2">
                  Treść niedostępna
                </div>
                <p
                  className="font-serif text-secondary-foreground m-0 leading-snug"
                  style={{ fontSize: 17 }}
                >
                  Pełna transkrypcja tej wypowiedzi nie została jeszcze pobrana ze
                  stenogramu Sejmu.
                  {s.transcriptUrl && (
                    <>
                      {" "}Możesz przeczytać ją bezpośrednio w{" "}
                      <a
                        href={s.transcriptUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-destructive underline decoration-dotted underline-offset-4 hover:decoration-solid"
                      >
                        PDF stenogramu
                      </a>
                      .
                    </>
                  )}
                </p>
              </section>
            )}
          </div>

          {/* SIDEBAR — context, claims, prints. Sticky on lg+ so it stays in
              view while the reader scrolls the long transcript. */}
          <aside className="mt-10 xl:mt-0 xl:sticky xl:top-6 xl:self-start xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto xl:pr-1">
            {s.contextStrip.length > 0 && (
              <>
                <SectionLabel
                  icon={Clock}
                  label="Kontekst posiedzenia"
                  subtitle="Kto mówił przed i po"
                />
                <StatementContextStrip items={s.contextStrip} />
              </>
            )}

            {s.keyClaims.length > 0 && (
              <>
                <SectionLabel
                  icon={ListChecks}
                  label="Kluczowe tezy"
                  subtitle="Wyciągnięte przez model językowy"
                />
                <ul className="my-3 pl-5 font-serif text-foreground" style={{ fontSize: 15, lineHeight: 1.55 }}>
                  {s.keyClaims.slice(0, 3).map((c, i) => (
                    <li key={i} className="mb-2 marker:text-destructive">{c}</li>
                  ))}
                </ul>
              </>
            )}

            {s.printRefs.length > 0 && (
              <>
                <SectionLabel
                  icon={FileText}
                  label="Powiązane druki"
                  subtitle="Dokumenty omawiane w wypowiedzi"
                />
                <div className="my-3 p-4 border-l-2 border-destructive" style={{ background: "var(--muted)" }}>
                  <ul className="font-serif" style={{ fontSize: 14, lineHeight: 1.5 }}>
                    {s.printRefs.map((p) => (
                      <li key={`${p.printTerm}-${p.printNumber}`} className="mb-1.5">
                        <Link
                          href={`/proces/${p.printTerm}/${encodeURIComponent(p.printNumber)}`}
                          className="text-foreground hover:text-destructive underline decoration-dotted underline-offset-4"
                        >
                          druk {p.printNumber}
                          {p.shortTitle && `: ${p.shortTitle}`}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </aside>
        </div>

        <div className="max-w-[820px] mx-auto">
          <RelatedSpeeches items={related} />

          <footer className="pt-6 mt-12 border-t border-border font-mono text-[10px] tracking-wide text-muted-foreground leading-relaxed">
            Źródło: stenogram posiedzenia Sejmu RP X kadencji.{" "}
            {s.transcriptUrl && (
              <a href={s.transcriptUrl} target="_blank" rel="noopener noreferrer" className="text-destructive underline decoration-dotted">
                Pełny stenogram (PDF)
              </a>
            )}
            {" · "}
            Wzbogacenie tekstu (cytat wiralowy, tematyka, ton) — model lokalny; każde pole edytowalne.
          </footer>
        </div>
      </article>
    </main>
  );
}
