import Link from "next/link";
import { stageLabel } from "@/lib/stages";
import { recordedStages, stageVoting, warsawDay } from "@/lib/process-evidence";
import { voteMeaning } from "@/lib/weekly-stories";
import type { LinkedVoting, ProcessStage } from "@/lib/db/prints";
import styles from "./process.module.css";

export function Timeline({ stages, votings, projectFutureLawPath }: {
  stages: ProcessStage[];
  votings: LinkedVoting[];
  projectFutureLawPath: boolean;
}) {
  const today = warsawDay();
  const recorded = recordedStages(stages, today);
  const last = recorded.at(-1);
  const top = [...stages].filter(s => s.depth === 0).sort((a, b) => a.ord - b.ord);
  return <section className={styles.timeline} aria-labelledby="process-history-heading">
    <div className={styles.sectionHead}>
      <h2 id="process-history-heading">Przebieg sprawy</h2>
      {projectFutureLawPath && <Link href="/jak-powstaje-ustawa">Jak powstaje ustawa</Link>}
    </div>
    {top.length === 0 ? <p className="text-sm text-muted-foreground">Brak historii etapów w dostępnych danych Sejmu.</p> : <ol>
      {top.map(stage => {
        const scheduled = !!stage.stageDate && stage.stageDate.slice(0, 10) > today;
        const label = stageLabel(stage.stageType, stage.stageName);
        const vote = stageVoting(stage, votings);
        const meaning = vote ? voteMeaning({ id: vote.votingId, voting_number: vote.votingNumber, title: vote.title,
          topic: vote.topic ?? null, description: vote.description ?? null, short_title: null, date: vote.date,
          yes: vote.yes, no: vote.no, abstain: vote.abstain, majority_votes: vote.majorityVotes, motion_polarity: vote.motionPolarity, kind: vote.kind }) : null;
        return <li key={stage.ord} data-latest={stage === last || undefined}>
          <div className={styles.stageDate}>{stage.stageDate ? <time dateTime={stage.stageDate}>{new Date(stage.stageDate).toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Warsaw" })}</time> : "Brak daty"}</div>
          <div>
            <h3>{label}</h3>
            {scheduled && <p className={styles.stageNote}>Zaplanowano — etap jeszcze nie nastąpił.</p>}
            {!scheduled && stage === last && <p className={styles.stageNote}>Ostatni odnotowany etap</p>}
            {stage.decision && <p className={styles.stageDecision}>{stage.decision}</p>}
            {stage.stageName && stage.stageName !== label && <p className={styles.stageDecision}>{stage.stageName}</p>}
            {vote && meaning && <Link className={styles.stageVote} href={`/glosowanie/${vote.votingId}`}>Głosowanie {vote.sitting}/{vote.votingNumber}: {meaning.label}</Link>}
          </div>
        </li>;
      })}
    </ol>}
  </section>;
}
