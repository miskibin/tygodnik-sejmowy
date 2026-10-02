"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, ArrowRight, FileText, Search, X } from "lucide-react";
import type { SittingInfo } from "@/lib/events-types";
import type { WeeklyEdition } from "@/lib/db/weekly-stories";
import { principalVote, voteMeaning, type WeeklyStory } from "@/lib/weekly-stories";
import { TOPICS, type TopicId } from "@/lib/topics";
import { matchesWeeklyFilters, type WeeklyFilters } from "@/lib/weekly-filters";
import { VoteSummary } from "@/components/editorial/VoteSummary";
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

  return <article className={styles.story} id={`sprawa-${story.id}`} aria-labelledby={`tytul-${story.id}`}>
    <div className={styles.storyContent}>
      <div className={styles.storyMeta}>
        {main?.date && <time dateTime={main.date}>{new Date(main.date).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" })}</time>}
        {story.topics[0] && <span className={styles.topic}>{TOPICS[story.topics[0]].label}</span>}
        {story.prints[0] && <span>Druk {story.prints[0].number}</span>}
        {(story.phase !== "Debata i głosowania" || !main) && !story.title.toLocaleLowerCase("pl").includes(story.phase.toLocaleLowerCase("pl")) && <span>{story.phase}</span>}
      </div>
      <h2 id={`tytul-${story.id}`} className={styles.storyTitle}>{href ? <Link href={href}>{story.title}</Link> : story.title}</h2>
      {main && result && <div className={styles.result}>
        <p><i aria-hidden /><strong>{amendmentsOnly ? senateResult : result.label}</strong></p>
        {!amendmentsOnly && story.phase === "Poprawki Senatu" && <p className={styles.procedure}>{result.question}</p>}
        {amendmentsOnly && <p className={styles.procedure}>Przyjęte poprawki: {acceptedAmendments} z {amendments.length} głosowanych.</p>}
      </div>}
      <div className={styles.storyBody}>
        {story.projectSummaries && story.projectSummaries.length > 0 ? story.projectSummaries.map(p => <div key={p.number} className={styles.summary}>
          <Link href={`/proces/${term}/${p.number}`} className={styles.summaryLabel}>Projekt {p.number}: </Link>
          <WeeklySummary term={term} text={p.text} />
        </div>) : story.summary && <div className={styles.summary}>
          {hasProjects && <span className={styles.summaryLabel}>Założenia projektu: </span>}
          <WeeklySummary term={term} text={story.summary} />
        </div>}
      </div>
      <div className={styles.actions}>
        {href && <Link className={styles.primaryLink} href={href}>{story.prints.length ? "Przebieg sprawy" : main ? "Wynik głosowania" : "Pełna wypowiedź"}<ArrowRight size={17} aria-hidden /></Link>}
        {story.summary && <span className={styles.sourceNote}>Streszczenie AI · źródło: Sejm</span>}
      </div>
      <div className={styles.disclosures}>
        {story.image && <details className={styles.debateDetails}>
          <summary>Ilustracja</summary>
          <StoryPhoto key={story.image.url} image={story.image} />
        </details>}
        {story.votes.length > 0 && <details className={styles.voteDetails}>
          <summary>Głosowania <span>{story.votes.length}</span></summary>
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
    </div>
    {(main && !amendmentsOnly || story.prints.length > 0) && <aside className={styles.storyAside} aria-label={`Wynik i dokumenty: ${story.title}`}>
      {main && !amendmentsOnly && <VoteSummary vote={main} />}
      {story.prints.length > 0 && <section className={styles.documents}>
        <h3>Dokumenty tej sprawy<FileText size={16} aria-hidden /></h3>
        <ul>{story.prints.map(print => <li key={print.number}>
          <Link href={`/proces/${term}/${print.number}#dokumenty`}><FileText size={19} aria-hidden /><span>{print.title}<small>Druk {print.number}</small></span><ArrowRight size={15} aria-hidden /></Link>
        </li>)}</ul>
      </section>}
    </aside>}
  </article>;
}

export function BriefList({ edition, sitting, sittings, filters }: {
  edition: WeeklyEdition; sitting: SittingInfo; sittings: SittingInfo[]; filters: WeeklyFilters;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [visible, setVisible] = useState(8);
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState<TopicId | "">("");
  const [status, setStatus] = useState("");
  const active = filters.topics.length > 0 || filters.personas.length > 0;
  const scopedStories = edition.stories.filter(s => matchesWeeklyFilters(s, filters));
  const topics = [...new Set(scopedStories.flatMap(s => s.topics))];
  const statuses = [...new Set(scopedStories.flatMap(s => {
    const vote = principalVote(s.votes);
    return vote ? [voteMeaning(vote).label] : [];
  }))];
  const needle = query.trim().toLocaleLowerCase("pl");
  const stories = scopedStories.filter(s => (!topic || s.topics.includes(topic))
    && (!status || (() => { const vote = principalVote(s.votes); return vote && voteMeaning(vote).label === status; })())
    && (!needle || [s.title, s.summary, ...s.prints.map(p => `${p.number} ${p.title}`), ...(s.projectSummaries ?? []).map(p => p.text)].join(" ").toLocaleLowerCase("pl").includes(needle)));
  const locallyFiltered = !!(needle || topic || status);
  const ordered = [...sittings].sort((a, b) => a.sittingNum - b.sittingNum);
  const index = ordered.findIndex(s => s.sittingNum === sitting.sittingNum);
  const previous = ordered[index - 1], next = index >= 0 ? ordered[index + 1] : undefined;
  const reset = () => { setQuery(""); setTopic(""); setStatus(""); setVisible(8); };

  return <main className={styles.edition}>
    <header className={styles.header}>
      <div><p className={styles.sitting}>Posiedzenie {sitting.sittingNum}</p><h1>Tygodnik</h1>
        <div className={styles.editionDate}><p>{dateRange(sitting.firstDate, sitting.lastDate)}</p><span>{edition.stories.length} spraw · {edition.voteCount} głosowań</span></div>
      </div>
      <nav className={styles.archive} aria-label="Wybór wydania">
        <button disabled={!previous} onClick={() => { if (previous) router.push(`/tygodnik/p/${previous.sittingNum}`); }} aria-label="Poprzednie posiedzenie"><ArrowLeft size={17} aria-hidden /></button>
        <label><span className="sr-only">Wybierz posiedzenie</span><select value={sitting.sittingNum} onChange={e => router.push(`/tygodnik/p/${e.target.value}`)}>
          {ordered.map(s => <option key={s.sittingNum} value={s.sittingNum}>{s.firstDate ? dateRange(s.firstDate, s.lastDate) : `Posiedzenie ${s.sittingNum}`}</option>)}
        </select></label>
        <button disabled={!next} onClick={() => { if (next) router.push(`/tygodnik/p/${next.sittingNum}`); }} aria-label="Następne posiedzenie"><ArrowRight size={17} aria-hidden /></button>
      </nav>
    </header>
    <div className={styles.filters}>
      <button className={styles.allStories} onClick={reset}>Wszystkie sprawy <span>{scopedStories.length}</span></button>
      {topics.length > 0 && <label><span className="sr-only">Filtruj według tematu</span><select value={topic} onChange={e => { setTopic(e.target.value as TopicId | ""); setVisible(8); }}><option value="">Temat</option>{topics.map(t => <option key={t} value={t}>{TOPICS[t].label}</option>)}</select></label>}
      {statuses.length > 1 && <label><span className="sr-only">Filtruj według wyniku</span><select value={status} onChange={e => { setStatus(e.target.value); setVisible(8); }}><option value="">Wynik</option>{statuses.map(s => <option key={s} value={s}>{s}</option>)}</select></label>}
      <label className={styles.search}><Search size={15} aria-hidden /><span className="sr-only">Szukaj w tym posiedzeniu</span><input type="search" placeholder="Szukaj w tym posiedzeniu" value={query} onChange={e => { setQuery(e.target.value); setVisible(8); }} /></label>
    </div>
    {(active || locallyFiltered) && <div className={styles.filterStatus} role="status">
      <span>Wybrane sprawy: {stories.length} z {edition.stories.length}</span>
      {locallyFiltered && <button onClick={reset}>Wyczyść filtry<X size={13} aria-hidden /></button>}
      {active && <Link href={pathname}>Pokaż całe wydanie</Link>}
    </div>}
    {stories.slice(0, visible).map(story => <Story key={story.id} story={story} term={sitting.term} />)}
    {stories.length === 0 && <div className={styles.empty}>
      <h2>{active || locallyFiltered ? "Brak spraw dla wybranych filtrów" : edition.planned ? "Posiedzenie jeszcze się nie odbyło" : "Omówienie tego posiedzenia nie jest dostępne"}</h2>
      {!active && !locallyFiltered && <Link href={`/posiedzenie/${sitting.sittingNum}`}>Informacje o posiedzeniu →</Link>}
    </div>}
    {stories.length > visible && <button className={styles.more} onClick={() => setVisible(n => n + 8)}>Pokaż kolejne sprawy <span>Pozostało: {stories.length - visible} <span aria-hidden>↓</span></span></button>}
    <footer className={styles.editionFooter}><p>Źródła: druki, stenogramy i wyniki głosowań Sejmu RP.</p><nav aria-label="Opcje tygodnika"><Link href="/preferencje">Preferencje</Link><a href="/rss.xml">RSS</a></nav></footer>
  </main>;
}
