"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { SittingInfo } from "@/lib/events-types";
import type { WeeklyEdition } from "@/lib/db/weekly-stories";
import { principalVote, voteMeaning, type WeeklyStory } from "@/lib/weekly-stories";
import { matchesWeeklyFilters, type WeeklyFilters } from "@/lib/weekly-filters";
import { StoryPhoto } from "./StoryPhoto";
import { WeeklySummary } from "./WeeklySummary";
import { VoteBreakdown } from "./VoteBreakdown";
import styles from "./weekly.module.css";

function dateRange(first: string, last: string) {
  if (!first) return "";
  const a = new Date(first), b = new Date(last || first);
  const end = b.toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });
  if (!last || first === last) return end;
  return `${a.toLocaleDateString("pl-PL", { day: "numeric", ...(a.getMonth() !== b.getMonth() ? { month: "long" } : {}) })}–${end}`;
}

function Story({ story, term }: { story: WeeklyStory; term: number }) {
  const main = principalVote(story.votes);
  const result = main ? voteMeaning(main) : null;
  const href = story.prints[0] ? `/proces/${term}/${story.prints[0].number}` : main ? `/glosowanie/${main.id}` : story.quote ? `/mowa/${story.quote.id}` : null;
  const amendments = story.votes.filter(v => /poprawk/i.test(v.topic || v.description || "") && v.motion_polarity !== "pass");
  const amendmentsOnly = story.phase === "Poprawki Senatu" && amendments.length > 1;
  const acceptedAmendments = amendments.filter(v => voteMeaning(v).label === "Poprawka przyjęta").length;
  const senateResult = acceptedAmendments === amendments.length ? "Sejm przyjął wszystkie głosowane poprawki Senatu" : acceptedAmendments === 0 ? "Sejm odrzucił wszystkie głosowane poprawki Senatu" : "Sejm przyjął część poprawek Senatu";
  const hasProjects = story.prints.some(p => p.isProject);

  return (
    <article className={styles.story} id={`sprawa-${story.id}`} aria-labelledby={`tytul-${story.id}`}>
      <div className={styles.storyMeta}>
        {(story.phase !== "Debata i głosowania" || !main) && !story.title.toLocaleLowerCase("pl").includes(story.phase.toLocaleLowerCase("pl")) && <span>{story.phase}</span>}
        {main?.date && <time dateTime={main.date}>{new Date(main.date).toLocaleDateString("pl-PL", { day: "numeric", month: "long" })}</time>}
      </div>
      <h2 id={`tytul-${story.id}`} className={styles.storyTitle}>{href ? <Link href={href}>{story.title}</Link> : story.title}</h2>
      <div className={styles.storyBody}>
        {main && result && (
          <div className={styles.result}>
            <p><strong>{amendmentsOnly ? senateResult : result.label}</strong></p>
            {!amendmentsOnly && story.phase === "Poprawki Senatu" && <p className={styles.procedure}>{result.question}</p>}
            {amendmentsOnly && <p className={styles.procedure}>Przyjęte poprawki: {acceptedAmendments} z {amendments.length} głosowanych.</p>}
            {!amendmentsOnly && result.label.startsWith("Wniosek") && !/odrzucenie projektu/.test(result.label) && <p className={styles.procedure}>{result.question}</p>}
          </div>
        )}
        <div className={styles.storyIntro}>
          {story.image && <StoryPhoto key={story.image.url} image={story.image} />}
          <div className={styles.storyIntroText}>
        {story.projectSummaries && story.projectSummaries.length > 0 ? (
          story.projectSummaries.map(p => <div key={p.number} className={styles.summary}>
            <Link href={`/proces/${term}/${p.number}`} className={styles.summaryLabel}>Projekt {p.number}: </Link>
            <WeeklySummary term={term} text={p.text} />
          </div>)
        ) : story.summary && <div className={styles.summary}>
          {hasProjects && <span className={styles.summaryLabel}>Założenia projektu: </span>}
          <WeeklySummary term={term} text={story.summary} />
        </div>}
          </div>
        </div>
        {main && !amendmentsOnly && <figure className={styles.mainVote}>
          <figcaption>Głosowanie nr {main.voting_number} · {result?.question}</figcaption>
          <VoteBreakdown vote={main} />
        </figure>}
        <div className={styles.links}>
          {href && <Link href={href}>{story.prints.length ? "Przebieg sprawy i dokumenty" : main ? "Wynik i źródło głosowania" : "Pełna wypowiedź"} <span aria-hidden>→</span></Link>}
        </div>
        {story.votes.length > 0 && <details className={styles.voteDetails}>
          <summary>Głosowania ({story.votes.length})</summary>
          <ol>{story.votes.map(v => <li key={v.id}>
            <Link href={v.sourceUrl || `/glosowanie/${v.id}`}><span>Nr {v.voting_number} · {voteMeaning(v).question}</span><strong>{voteMeaning(v).label}</strong></Link>
            <VoteBreakdown vote={v} compact />
          </li>)}</ol>
        </details>}
        {story.quote && <details className={styles.debateDetails}>
          <summary>Fragment debaty</summary>
          <figure className={styles.quote}>
            <blockquote>„{story.quote.text.replace(/^[„“"]|[”"]$/g, "")}”</blockquote>
            <figcaption>
              {story.quote.mpId ? <Link href={`/posel/${story.quote.mpId}`}>{story.quote.speaker}</Link> : story.quote.speaker}
              <Link href={`/mowa/${story.quote.id}`}>Pełna wypowiedź <span aria-hidden>→</span></Link>
            </figcaption>
          </figure>
        </details>}
      </div>
    </article>
  );
}

export function BriefList({ edition, sitting, sittings, filters }: {
  edition: WeeklyEdition; sitting: SittingInfo; sittings: SittingInfo[]; filters: WeeklyFilters;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [visible, setVisible] = useState(8);
  const active = filters.topics.length > 0 || filters.personas.length > 0;
  const stories = edition.stories.filter(s => matchesWeeklyFilters(s, filters));
  return <main className={styles.edition}>
    <header className={styles.header}>
      <h1>Tygodnik</h1>
      <div className={styles.toolbar}>
        <div className={styles.editionDate}>
          <p>{dateRange(sitting.firstDate, sitting.lastDate)}</p>
          <span>Posiedzenie {sitting.sittingNum} · Sprawy: {edition.stories.length} · Głosowania: {edition.voteCount}</span>
        </div>
        <label className={styles.archive}>
          <span className="sr-only">Wybierz posiedzenie</span>
          <select value={sitting.sittingNum} onChange={e => router.push(`/tygodnik/p/${e.target.value}`)}>
            {sittings.map(s => <option key={s.sittingNum} value={s.sittingNum}>Posiedzenie {s.sittingNum}{s.firstDate ? ` · ${new Date(s.firstDate).toLocaleDateString("pl-PL")}` : ""}</option>)}
          </select>
        </label>
      </div>
    </header>
    {active && <div className={styles.filterStatus}>
      <span>Wybrane tematy: {stories.length} z {edition.stories.length} spraw</span>
      <Link href={pathname}>Pokaż całe wydanie</Link>
    </div>}
    {stories.slice(0, visible).map(story => <Story key={story.id} story={story} term={sitting.term} />)}
    {stories.length === 0 && <div className={styles.empty}>
      <h2>{active ? "Brak spraw dla wybranych tematów" : edition.planned ? "Posiedzenie jeszcze się nie odbyło" : "Omówienie tego posiedzenia nie jest dostępne"}</h2>
      {!active && <Link href={`/posiedzenie/${sitting.sittingNum}`}>Informacje o posiedzeniu →</Link>}
    </div>}
    {stories.length > visible && <button className={styles.more} onClick={() => setVisible(n => n + 8)}>Pokaż kolejne sprawy <span>Pozostało: {stories.length - visible} <span aria-hidden>↓</span></span></button>}
    <footer className={styles.editionFooter}>
      <p>Źródła: druki, stenogramy i wyniki głosowań Sejmu RP.</p>
      <nav aria-label="Opcje tygodnika"><Link href="/preferencje">Preferencje</Link><a href="/rss.xml">RSS</a></nav>
    </footer>
  </main>;
}
