"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useProfile } from "@/lib/profile";
import { personasImplyAnyTopic } from "@/lib/topic-persona-map";
import type { SittingInfo } from "@/lib/events-types";
import type { WeeklyEdition } from "@/lib/db/weekly-stories";
import { principalVote, voteMeaning, type WeeklyStory } from "@/lib/weekly-stories";
import { CitationText } from "@/components/tygodnik/CitationLink";
import { FilterBar } from "./FilterBar";
import { VoteBreakdown } from "./VoteBreakdown";
import styles from "./weekly.module.css";

function dateRange(first: string, last: string) {
  const a = new Date(first), b = new Date(last || first);
  if (!first) return "";
  const end = b.toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });
  if (first === last) return end;
  return `${a.toLocaleDateString("pl-PL", { day: "numeric", ...(a.getMonth() !== b.getMonth() ? { month: "long" } : {}) })}–${end}`;
}

function Story({ story, term }: { story: WeeklyStory; term: number }) {
  const main = principalVote(story.votes);
  const result = main ? voteMeaning(main) : null;
  const href = story.prints[0] ? `/proces/${term}/${story.prints[0].number}` : main ? `/glosowanie/${main.id}` : story.quote ? `/mowa/${story.quote.id}` : null;
  const rejection = story.votes.find(v => v.motion_polarity === "reject" && v.id !== main?.id);
  const amendments = story.votes.filter(v => /poprawk/i.test(v.topic || v.description || "") && v.motion_polarity !== "pass");
  const amendmentsOnly = story.phase === "Poprawki Senatu" && amendments.length > 1;
  const acceptedAmendments = amendments.filter(v => voteMeaning(v).label === "Poprawka przyjęta").length;
  const senateResult = acceptedAmendments === amendments.length ? "Sejm przyjął wszystkie głosowane poprawki Senatu" : acceptedAmendments === 0 ? "Sejm odrzucił wszystkie głosowane poprawki Senatu" : "Sejm przyjął część poprawek Senatu";
  return (
    <article className={styles.story} id={`sprawa-${story.id}`}>
      <div className={styles.storyMeta}><span>Punkt {story.ord}</span><span className={styles.phase} data-phase={story.phase}>{story.phase}</span></div>
      <h2 className={styles.storyTitle}>{href ? <Link href={href}>{story.title}</Link> : story.title}</h2>
      <div className={story.quote ? styles.storyColumns : styles.storyBody}>
        <div>
          {story.summary && <p className={styles.summary}>{story.prints.some(p => p.isProject) && !story.phase.includes("Senatu") && <span className={styles.summaryLabel}>Założenia {story.prints.length > 1 ? "projektów" : "projektu"}: </span>}<CitationText term={term}>{story.summary}</CitationText></p>}
          {main && result && (
            <div className={styles.result}>
              <p><span className={styles.resultDot} data-tone={result.tone} /><strong>{amendmentsOnly ? senateResult : result.label}</strong></p>
              {!amendmentsOnly && story.phase === "Poprawki Senatu" && <p className={styles.procedure}>{result.question}</p>}
              {!amendmentsOnly && <VoteBreakdown vote={main} />}
              {amendmentsOnly && <div className={styles.amendmentsChart}>
                <div className={styles.amendmentDots}>{amendments.map(v => <Link key={v.id} href={`/glosowanie/${v.id}`} data-accepted={voteMeaning(v).label === "Poprawka przyjęta"} aria-label={`Głosowanie ${v.voting_number}: ${voteMeaning(v).question}. ${voteMeaning(v).label}`} title={`${voteMeaning(v).question} — ${voteMeaning(v).label}`} />)}</div>
                <p>Głosowania nad poprawkami: <strong>{acceptedAmendments} za przyjęciem</strong> · {amendments.length - acceptedAmendments} za odrzuceniem</p>
              </div>}
              {rejection && <p className={styles.procedure}>{voteMeaning(rejection).label}.</p>}
              {!amendmentsOnly && result.label.startsWith("Wniosek") && !/odrzucenie projektu/.test(result.label) && <p className={styles.procedure}>{result.question}</p>}
            </div>
          )}
          <div className={styles.links}>
            {story.prints.map(p => <Link key={p.number} href={`/proces/${term}/${p.number}`} title={`Druk ${p.number} · ${p.title}`}>{p.title} <span aria-hidden>↗</span></Link>)}
            {!story.prints.length && href && <Link href={href}>Przeczytaj więcej <span aria-hidden>↗</span></Link>}
            {story.votes.length > 0 && <details className={styles.voteDetails}>
              <summary>Głosowania ({story.votes.length})</summary>
              <ol>{story.votes.map(v => <li key={v.id}><Link href={v.sourceUrl || `/glosowanie/${v.id}`}><span>Nr {v.voting_number} · {voteMeaning(v).question}</span><strong>{voteMeaning(v).label}</strong></Link><VoteBreakdown vote={v} compact /></li>)}</ol>
            </details>}
          </div>
        </div>
        {story.quote && <figure className={styles.quote}>
          <blockquote>„{story.quote.text.replace(/^[„“"]|[”"]$/g, "")}”</blockquote>
          <figcaption>{story.quote.mpId ? <Link href={`/posel/${story.quote.mpId}`}>{story.quote.speaker}</Link> : story.quote.speaker}<Link href={`/mowa/${story.quote.id}`}>Z debaty w Sejmie <span aria-hidden>↗</span></Link></figcaption>
        </figure>}
      </div>
    </article>
  );
}

export function BriefList({ edition, sitting, sittings }: { edition: WeeklyEdition; sitting: SittingInfo; sittings: SittingInfo[]; isIndex?: boolean }) {
  const router = useRouter();
  const { topics, personas, hydrated, setTopics, setPersonas } = useProfile();
  const [visible, setVisible] = useState(8);
  const active = hydrated && (topics.length > 0 || personas.length > 0);
  const stories = edition.stories.filter(s => !active || (
    (!topics.length || s.topics.some(t => topics.includes(t))) &&
    (!personas.length || s.personas.some(p => personas.includes(p)) || personasImplyAnyTopic(personas, new Set(s.topics)))
  ));
  return <main className={styles.edition}>
    <header className={styles.header}>
      <p className={styles.eyebrow}>TYGODNIK SEJMOWY <span>/</span> POSIEDZENIE {sitting.sittingNum}</p>
      <h1>Co wydarzyło się w Sejmie</h1>
      <p className={styles.intro}>O co toczyła się debata. Co zdecydowali posłowie. Co to zmienia.</p>
    </header>
    <div className={styles.toolbar}>
      <div className={styles.editionDate}><strong>{dateRange(sitting.firstDate, sitting.lastDate)}</strong><span>{edition.stories.length} spraw · {edition.voteCount} głosowań</span></div>
      <div className={styles.tools}>
        <label className={styles.archive}><span className="sr-only">Wybierz posiedzenie</span><select aria-label="Wybierz posiedzenie" value={sitting.sittingNum} onChange={e => router.push(`/tygodnik/p/${e.target.value}`)}>{sittings.map(s => <option key={s.sittingNum} value={s.sittingNum}>Posiedzenie {s.sittingNum}{s.firstDate ? ` · ${new Date(s.firstDate).toLocaleDateString("pl-PL")}` : ""}</option>)}</select></label>
        <FilterBar />
      </div>
    </div>
    {active && <div className={styles.filterStatus}><span>Wybrane filtry: {stories.length} z {edition.stories.length} spraw</span><button onClick={() => {setTopics([]);setPersonas([]);}}>Pokaż wszystkie tematy ×</button></div>}
    {stories.slice(0, visible).map(story => <Story key={story.id} story={story} term={sitting.term} />)}
    {stories.length === 0 && <div className={styles.empty}><h2>{active ? "Nie ma spraw pasujących do tych filtrów" : edition.planned ? "To posiedzenie jest jeszcze przed nami" : "Omówienie tego posiedzenia nie jest jeszcze dostępne"}</h2><p>{active ? "Wyczyść filtry, żeby zobaczyć całe wydanie." : "Wróć do wcześniejszego wydania albo sprawdź informacje o posiedzeniu."}</p>{!active && <Link href={`/posiedzenie/${sitting.sittingNum}`}>Informacje o posiedzeniu →</Link>}</div>}
    {stories.length > visible && <button className={styles.more} onClick={() => setVisible(n => n + 8)}>Czytaj kolejne sprawy <span>Jeszcze {stories.length - visible} ↓</span></button>}
    <p className={styles.sourceNote}>Na podstawie druków, stenogramów i wyników głosowań Sejmu RP. Skróty pomagają się zorientować — dokumenty i pełne wypowiedzi znajdziesz przy każdej sprawie.</p>
  </main>;
}
