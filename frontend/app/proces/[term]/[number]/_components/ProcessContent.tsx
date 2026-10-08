import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import type { PrintWithStages } from "@/lib/db/prints";
import { shouldProjectLawTimeline } from "@/lib/process-timeline";
import { opinionSourceLabel, opinionSourceShort, promiseStatusLabel } from "@/lib/labels";
import { PrintCard } from "@/components/print/PrintCard";
import { VoteSummary } from "@/components/editorial/VoteSummary";
import { Hero } from "./Hero";
import { Summary } from "./Summary";
import { Timeline } from "./Timeline";
import { Votings } from "./Votings";
import { Committees } from "./Committees";
import { ProceedingPoints } from "./ProceedingPoints";
import { Sources } from "./Sources";
import styles from "./process.module.css";

export function ProcessContent({ data, citations }: { data: PrintWithStages; citations: ReactNode }) {
  const { print, stages, committeeSittings, mainVoting, votingByClub, relatedVotings, subPrints, matchedPromises, outcome, attachments, proceedingPoints } = data;
  const sourceProps = { term: print.term, number: print.number, attachments, subPrints };
  const vote = mainVoting ? {
    id: mainVoting.votingId, voting_number: mainVoting.votingNumber, title: mainVoting.title,
    topic: mainVoting.topic ?? null, description: mainVoting.description ?? null,
    short_title: null, date: mainVoting.date, yes: mainVoting.yes, no: mainVoting.no,
    abstain: mainVoting.abstain, majority_votes: mainVoting.majorityVotes,
    motion_polarity: mainVoting.motionPolarity, kind: mainVoting.kind,
  } : null;

  return <main className={styles.page}>
    <nav aria-label="Ścieżka strony" className={styles.breadcrumb}>
      <Link href="/tygodnik"><ArrowLeft size={13} aria-hidden />Tygodnik</Link><ChevronRight size={11} aria-hidden />
      {mainVoting && <><Link href={`/tygodnik/p/${mainVoting.sitting}`}>Posiedzenie {mainVoting.sitting}</Link><ChevronRight size={11} aria-hidden /></>}
      <span aria-current="page">Druk {print.number}</span>
      <Link className="ml-auto" href="/proces">Wszystkie dokumenty</Link>
    </nav>
    <Hero print={print} outcome={outcome} mainVoting={mainVoting} stages={stages} />
    <div className={styles.overview}>
      <div id="w-skrocie" className={styles.anchor}><Summary print={print} /></div>
      <div className={styles.decisionSlot}>{vote && mainVoting && <VoteSummary vote={vote} notParticipating={mainVoting.notParticipating} decision />}</div>
      <div className={styles.content}>
        <div id="historia" className={styles.anchor}>
          <Timeline stages={stages} votings={relatedVotings} projectFutureLawPath={shouldProjectLawTimeline(print.documentCategory)} />
        </div>
        <div id="glosowania" className={styles.anchor}>
          <Votings votings={relatedVotings} mainVotingId={mainVoting?.votingId ?? null} votingByClub={votingByClub} />
        </div>
        <div id="wypowiedzi" className={styles.anchor}>{citations}</div>
        <Committees stages={stages} committeeSittings={committeeSittings} />
        <ProceedingPoints points={proceedingPoints} />
          {outcome?.act && <section className="mt-8 border-t border-border pt-6">
            <h2 className="text-lg font-medium">{outcome.act.eliId.startsWith("MP/") ? "Publikacja w Monitorze Polskim" : "Publikacja w Dzienniku Ustaw"}</h2>
            <p className="mt-3 text-sm">{outcome.act.displayAddress}</p>
            {(outcome.act.status || outcome.act.publishedAt) && <p className="mt-2 text-xs text-muted-foreground">{outcome.act.status ? `Status: ${outcome.act.status}` : ""}{outcome.act.publishedAt ? ` · opublikowano ${new Date(outcome.act.publishedAt).toLocaleDateString("pl-PL", { timeZone: "Europe/Warsaw", day: "numeric", month: "long", year: "numeric" })}` : ""}</p>}
            {outcome.act.sourceUrl && <a href={outcome.act.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-xs underline underline-offset-4">Dokument źródłowy aktu ↗</a>}
            <Link href={`/prawo/${outcome.act.eliId}`} className="mt-3 block text-sm underline">Tekst i wersje w bazie prawa</Link>
          </section>}
          {matchedPromises.length > 0 && <section className="mt-8 border-t border-border pt-6">
            <h2 className="text-lg font-medium">Powiązane obietnice wyborcze</h2>
            <ul className="mt-4">{matchedPromises.map(promise => <li key={promise.promiseId} className="py-4 border-b border-border">
              <p className="mb-2 text-xs text-muted-foreground">{[promise.partyCode, promiseStatusLabel(promise.status)].filter(Boolean).join(" · ")}</p>
              <p className="text-sm">{promise.title}</p>{promise.rationale && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{promise.rationale}</p>}
            </li>)}</ul>
          </section>}
        {subPrints.length > 0 && <section className="py-8 border-b border-border">
          <h2 className="text-xl font-medium mb-4">Dokumenty towarzyszące</h2>
          <ul className="text-sm">{subPrints.map(s => <PrintCard key={s.number} variant="row" id={0} term={print.term} number={s.number} shortTitle={s.shortTitle} title={s.title} opinionSource={s.opinionSource} opinionSourceShort={opinionSourceShort(s.opinionSource)} opinionSourceLabel={opinionSourceLabel(s.opinionSource)} />)}</ul>
        </section>}
      </div>
      <aside aria-label="Źródła sprawy" className={styles.sidebar}>
        <nav aria-label="Spis treści sprawy" className={styles.contents}>
          <a href="#historia">Przebieg sprawy</a>
          {relatedVotings.length > 0 && <a href="#glosowania">Głosowania ({relatedVotings.length})</a>}
          <a href="#wypowiedzi">Wypowiedzi</a>
          <a href="#dokumenty">Dokumenty źródłowe</a>
        </nav>
        <div id="dokumenty" className={styles.anchor}><Sources {...sourceProps} /></div>
      </aside>
    </div>
  </main>;
}
