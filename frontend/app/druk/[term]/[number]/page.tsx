import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPrint, type ProcessStage } from "@/lib/db/prints";
import { documentCategoryLabel, opinionSourceLabel, opinionSourceShort, promiseStatusLabel, sponsorAuthorityLabel } from "@/lib/labels";
import { stageLabel } from "@/lib/stages";
import { Reader } from "./_components/Reader";
import { ClubBadge } from "@/components/clubs/ClubBadge";
import { isUnaffiliated } from "@/lib/clubs/filter";
import { PageBreadcrumb } from "@/components/chrome/PageBreadcrumb";
import { VotingRow } from "@/components/voting/VotingRow";
import { PrintCard } from "@/components/print/PrintCard";
import { HemicycleChart } from "@/components/tygodnik/HemicycleChart";
import { NotFoundPage } from "@/components/chrome/NotFoundPage";
import { computeBillOutcome, verdictChipLabel } from "@/lib/voting/bill_outcome";


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

// Compact Polish labels for voting roles in the related-votings list.
// "main" intentionally has NO entry — the upstream voting_print_links ETL
// tags procedural reject-motions with role="main" too (issue #25 follow-up:
// voting 1517 is role="main" on druk 10/2449 despite being a "wniosek o
// odrzucenie"). The chip label is derived per-row from motion_polarity so
// it can't claim "całość" for a procedural motion.
const ROLE_LABEL: Record<string, string> = {
  sprawozdanie: "sprawozd.",
  autopoprawka: "autopoprawka",
  poprawka: "poprawka",
  joint: "łączne",
  other: "inne",
};

// Polarity-aware chip label for the `role="main"` row (replaces the blanket
// "całość" that conflated final third-reading votes with procedural motions).
function mainRoleLabel(polarity: import("@/lib/promiseAlignment").MotionPolarity | null): string {
  if (polarity === "pass") return "całość";
  if (polarity === "reject") return "wniosek o odrzucenie";
  if (polarity === "amendment") return "poprawki";
  if (polarity === "minority") return "wniosek mniejsz.";
  if (polarity === "procedural") return "wniosek proc.";
  return "główne";
}

function StageRow({ s, isLast }: { s: ProcessStage; isLast: boolean }) {
  const label = stageLabel(s.stageType, s.stageName);
  const date = s.stageDate
    ? new Date(s.stageDate).toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit" })
    : "—";
  const done = !!s.stageDate && s.stageType !== "End";
  const marker = done ? "✓" : isLast ? "●" : "○";
  const markerColor = done ? "var(--success)" : isLast ? "var(--destructive)" : "var(--muted-foreground)";
  return (
    <div
      className="grid font-sans text-[13px] py-2.5 border-b border-dotted border-border"
      style={{ gridTemplateColumns: "40px 1fr 20px" }}
    >
      <span className="font-mono text-[11px] text-muted-foreground">{date}</span>
      <span style={{ color: done ? "var(--foreground)" : "var(--muted-foreground)" }}>
        {label}
        {s.decision ? <span className="ml-1 text-muted-foreground">· {s.decision}</span> : null}
      </span>
      <span className="font-semibold text-right" style={{ color: markerColor }}>{marker}</span>
    </div>
  );
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
  // Existing per-route not-found.tsx (EmptyState w/ external Sejm links)
  // handles the !data case via notFound().
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
  const { print, stages, mainVoting, votingByClub, mainVotingSeats, relatedVotings, subPrints, matchedPromises, outcome, attachments } = data;
  const totalFiles = attachments.length + subPrints.reduce((n, s) => n + s.attachments.length, 0);

  const topLevelStages = stages.filter((s) => s.depth === 0);
  const lastDoneIdx = (() => {
    for (let i = topLevelStages.length - 1; i >= 0; i--) {
      if (topLevelStages[i].stageDate) return i;
    }
    return -1;
  })();

  return (
    <div className="bg-background text-foreground font-serif pb-20">
      <div className="max-w-[1280px] mx-auto px-4 md:px-8 lg:px-14 pt-7 md:pt-9 pb-8 md:pb-10">
        <PageBreadcrumb
          items={[
            { label: "Druki" },
            { label: `Kadencja ${print.term}` },
            { label: print.shortTitle || print.title || `Druk ${print.number}` },
          ]}
          subtitle={
            `${documentCategoryLabel(print.documentCategory) ?? "druk sejmowy"} · nr ${print.number}` +
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
        <div className="font-sans text-[12px] text-secondary-foreground mb-7 flex flex-wrap gap-x-4 gap-y-1">
          <a
            href={`https://www.sejm.gov.pl/Sejm${print.term}.nsf/druk.xsp?nr=${encodeURIComponent(print.number)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-destructive"
          >
            ↗ Strona druku w Sejmie
          </a>
        </div>

        {totalFiles > 0 && (
          <section
            className="mb-7 border border-rule px-4 py-3 md:px-5 md:py-4"
            style={{ background: "var(--muted)" }}
          >
            <div className="mb-2.5">
              <div className="font-sans text-[10px] tracking-[0.16em] uppercase text-destructive">
                ✶ Pliki źródłowe
              </div>
            </div>
            <ul className="font-sans text-[12.5px] flex flex-wrap gap-x-4 gap-y-1.5">
              {attachments.map((fn) => (
                <li key={`main-${fn}`}>
                  <a
                    href={`/api/druk/${print.term}/${encodeURIComponent(print.number)}/file/${encodeURIComponent(fn)}`}
                    className="text-destructive underline decoration-dotted underline-offset-4 hover:decoration-solid"
                  >
                    ⬇ {fn}
                  </a>
                </li>
              ))}
              {subPrints.flatMap((sp) =>
                sp.attachments.map((fn) => (
                  <li key={`${sp.number}-${fn}`}>
                    <a
                      href={`/api/druk/${print.term}/${encodeURIComponent(sp.number)}/file/${encodeURIComponent(fn)}`}
                      className="text-secondary-foreground underline decoration-dotted underline-offset-4 hover:text-destructive"
                    >
                      ⬇ {fn}
                      <span className="text-muted-foreground ml-1">· {sp.number}</span>
                    </a>
                  </li>
                )),
              )}
            </ul>
          </section>
        )}

        <div className="grid gap-8 md:gap-14 grid-cols-1 lg:[grid-template-columns:1fr_280px]">
          <div className="min-w-0">
            <Reader print={print} />

            {subPrints.length > 0 && (
              <section className="mt-12">
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

            {relatedVotings.length > 0 && (
              <section className="mt-12">
                <div className="text-[10px] tracking-[0.16em] uppercase text-destructive mb-4 font-sans">
                  ✶ Głosowania w sprawie tego druku ({relatedVotings.length})
                </div>
                <ul className="font-sans text-[13px]">
                  {relatedVotings.map((v) => {
                    // Motion-level outcome (yes >= majority_votes) — drives
                    // bill-level chip via polarity. When majority_votes is
                    // missing fall back to yes>no (legacy heuristic).
                    const motionPassed = v.majorityVotes != null
                      ? v.yes >= v.majorityVotes
                      : v.yes > v.no;
                    const billOutcome = computeBillOutcome(v.motionPolarity, motionPassed);
                    const isFinal = v.role === "main";
                    // Compose title: "Pos. N · głos. N — title". The leading
                    // "Pos./głos." identifier remains valuable as an internal
                    // ref (Sejm sittings/votings are commonly cited by it).
                    const headline = v.title
                      ? `Pos. ${v.sitting} · głos. ${v.votingNumber} — ${v.title}`
                      : `Pos. ${v.sitting} · głos. ${v.votingNumber}`;
                    // Verdict chip semantics:
                    //   - "passed":        bill advanced — chip green
                    //   - "rejected":      bill rejected — chip red
                    //   - "continues":     reject-motion lost — chip green
                    //                      (bill survives), label "projekt dalej"
                    //   - "indeterminate": vote tells us nothing about bill
                    //                      status; render motion-level pass/fail.
                    const verdict = billOutcome === "indeterminate"
                      ? { label: motionPassed ? "wniosek przyj." : "wniosek odrzuc.", passed: motionPassed }
                      : { label: verdictChipLabel(billOutcome), passed: billOutcome === "passed" || billOutcome === "continues" };
                    return (
                      <VotingRow
                        key={v.votingId}
                        votingId={v.votingId}
                        date={v.date}
                        title={headline}
                        yes={v.yes}
                        no={v.no}
                        abstain={v.abstain}
                        badge={{ label: v.role === "main" ? mainRoleLabel(v.motionPolarity) : (ROLE_LABEL[v.role] ?? v.role) }}
                        verdict={verdict}
                        isFinal={isFinal}
                      />
                    );
                  })}
                </ul>
              </section>
            )}

            {matchedPromises.length > 0 && (
              <section className="mt-10">
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
          </div>

          <aside className="font-sans text-[13px] text-secondary-foreground">
            {outcome?.urgencyStatus === "URGENT" && (
              <div
                className="mb-5 px-3 py-2 border-l-2 font-sans text-[11px] leading-[1.5]"
                style={{ borderColor: "var(--destructive)", background: "var(--muted)" }}
                title="Konst. art. 123: tylko Rada Ministrów może nadać tryb pilny. Wyłączenia: podatki, prawo wyborcze, ustrój władz, kodeksy."
              >
                <div
                  className="font-mono text-[10px] tracking-[0.16em] uppercase mb-1"
                  style={{ color: "var(--destructive)", fontWeight: 600 }}
                >
                  ⚡ Tryb pilny
                </div>
                <div className="text-secondary-foreground">
                  Skrócone terminy: Senat 14 dni · Prezydent 7 dni · skraca standardową ścieżkę vacatio legis.
                </div>
              </div>
            )}
            {(print.sponsorAuthority || print.sponsorMps.length > 0 || print.opinionSource) && (
              <>
                <div className="text-[10px] tracking-[0.16em] uppercase text-destructive mb-2.5">
                  ✶ Wnioskodawca
                </div>
                {/* For meta sub-prints (opinia/OSR/etc) the ETL forces
                    sponsor_authority='inne' and writes the true issuer to
                    opinion_source — render the issuer instead of "Inne". */}
                {print.opinionSource && print.isMetaDocument ? (
                  <div className="font-serif text-[15px] text-foreground mb-2 leading-snug">
                    {opinionSourceLabel(print.opinionSource)}
                  </div>
                ) : print.sponsorAuthority ? (
                  <div className="font-serif text-[15px] text-foreground mb-2 leading-snug">
                    {sponsorAuthorityLabel(print.sponsorAuthority)}
                  </div>
                ) : null}
                {print.sponsorMps.length > 0 ? (
                  <div className="font-sans text-[12px] text-secondary-foreground leading-[1.5] mb-7">
                    {print.sponsorMps.length === 1 ? "Podpisano: " : `${print.sponsorMps.length} sygnatariuszy: `}
                    <span className="text-foreground">
                      {print.sponsorMps.slice(0, 6).join(", ")}
                      {print.sponsorMps.length > 6 ? ` i ${print.sponsorMps.length - 6} innych` : ""}
                    </span>
                  </div>
                ) : print.sponsorAuthority === "klub_poselski" && !print.isMetaDocument ? (
                  <div className="font-sans italic text-[12px] text-muted-foreground leading-[1.5] mb-7">
                    Lista sygnatariuszy nie została jeszcze wyodrębniona z PDF. Pełen wykaz dostępny na stronie druku w Sejmie.
                  </div>
                ) : null}
              </>
            )}
            <div className="text-[10px] tracking-[0.16em] uppercase text-destructive mb-3.5">
              ✶ Status
            </div>
            {topLevelStages.length === 0 ? (
              <p className="font-serif italic text-muted-foreground">
                Brak etapów procesu legislacyjnego dla tego druku.
              </p>
            ) : (
              topLevelStages.map((s, i) => (
                <StageRow key={`${s.ord}-${i}`} s={s} isLast={i === lastDoneIdx + 1} />
              ))
            )}

            {outcome?.passed && outcome.act && (
              <div
                className="mt-7 px-4 py-3.5 border-l-2"
                style={{ borderColor: "var(--success)", background: "var(--muted)" }}
              >
                <div className="font-sans text-[10px] tracking-[0.16em] uppercase text-success mb-1.5">
                  ✓ W Dzienniku Ustaw
                </div>
                <div className="font-serif text-[16px] text-foreground leading-snug mb-1">
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
            )}

            {outcome?.passed && !outcome.act && (outcome.documentType === "projekt ustawy" || outcome.documentType === "projekt uchwały") && (
              <div
                className="mt-7 px-4 py-3 border-l-2 font-sans text-[12px] text-secondary-foreground leading-[1.55]"
                style={{ borderColor: "var(--warning)", background: "var(--muted)" }}
              >
                <span className="font-medium text-foreground">Uchwalono</span> —
                {" "}oczekuje na publikację w {outcome.documentType === "projekt uchwały" ? "M.P." : "Dz.U."}
                {outcome.closureDate ? ` (${formatDate(outcome.closureDate)})` : ""}
              </div>
            )}

            {mainVoting && (
              <>
                <div className="mt-7 text-[10px] tracking-[0.16em] uppercase text-destructive mb-3.5">
                  ✶ {
                    // Issue #25 follow-up: role="main" is set by ETL on any
                    // voting linked to the print (incl. procedural reject-
                    // motions). Only label "Głosowanie końcowe" when the
                    // motion was actually the third-reading bill vote
                    // (polarity="pass"); otherwise describe what was voted on.
                    mainVoting.role === "main"
                      ? (mainVoting.motionPolarity === "pass"
                          ? "Głosowanie końcowe"
                          : `Głosowanie · ${mainRoleLabel(mainVoting.motionPolarity)}`)
                      : `Głosowanie · ${mainVoting.role}`
                  }
                </div>
                <div
                  className="font-serif font-medium leading-none tracking-[-0.02em]"
                  style={{ fontSize: 38, color: "var(--success)" }}
                >
                  {mainVoting.yes} ZA
                </div>
                <div className="font-serif text-[22px] mt-1" style={{ color: "var(--destructive)" }}>
                  {mainVoting.no} przeciw
                </div>
                <div className="font-sans text-xs text-muted-foreground mt-1">
                  {mainVoting.abstain} wstrzymanych · {mainVoting.notParticipating} nieobecnych
                  {mainVoting.votingNumber ? ` · głos. nr ${mainVoting.votingNumber}` : ""}
                </div>
                {/* Hemicycle moved here from the tygodnik feed where it was
                    duplicating the print card. Renders only when per-MP seat
                    data is loaded. */}
                {mainVotingSeats.length > 0 && (
                  <div className="mt-4 -mx-2">
                    <HemicycleChart
                      votes={mainVotingSeats as never}
                      ariaLabel={`Hemicykl: ${mainVoting.yes} za, ${mainVoting.no} przeciw, ${mainVoting.abstain} wstrzymane`}
                    />
                  </div>
                )}
                {mainVoting.title && (
                  <div className="font-serif italic text-secondary-foreground mt-3 text-sm leading-snug">
                    „{mainVoting.title}”
                  </div>
                )}
                {votingByClub.length > 0 && (
                  <div className="mt-4 border-t border-dotted border-border pt-3">
                    <div className="text-[10px] tracking-[0.16em] uppercase text-muted-foreground mb-2">
                      Wg klubu
                    </div>
                    <div className="font-mono text-[11px] leading-[1.55]">
                      {/* Niezrzeszeni excluded — single-MP "klub" rolled-up
                          rows are misleading. Shown in roster, not aggregate. */}
                      {votingByClub
                        .filter((c) => !isUnaffiliated(c.clubShort))
                        .map((c) => (
                          <div key={c.clubShort} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 py-1">
                            <ClubBadge klub={c.clubShort} tooltip={c.clubName} size="sm" withLabel />
                            <span />
                            <span className="text-muted-foreground tabular-nums">
                              <span style={{ color: "var(--success)" }}>{c.yes}</span>
                              {" / "}
                              <span style={{ color: "var(--destructive)" }}>{c.no}</span>
                              {" / "}
                              <span>{c.abstain}</span>
                            </span>
                          </div>
                        ))}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1.5 font-sans tracking-wide">
                      za / przeciw / wstrzym.
                    </div>
                  </div>
                )}
              </>
            )}

            <button className="block w-full text-center mt-7 px-4 py-3.5 border border-foreground text-foreground font-sans text-xs tracking-wide cursor-pointer">
              🔔 Powiadom mnie o zmianach
            </button>
          </aside>
        </div>
      </div>
    </div>
  );
}
