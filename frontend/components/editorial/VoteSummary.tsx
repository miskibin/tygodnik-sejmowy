import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { voteMeaning, type StoryVote } from "@/lib/weekly-stories";
import styles from "./editorial.module.css";

/** The label and threshold describe this motion, never inferred approval of a bill. */
export function VoteSummary({ vote, notParticipating, decision = false }: {
  vote: StoryVote; notParticipating?: number; decision?: boolean;
}) {
  const meaning = voteMeaning(vote);
  const total = vote.yes + vote.no + vote.abstain + (notParticipating ?? 0);
  const veto = meaning.question === "Głosowanie nad ponownym uchwaleniem ustawy";
  const threshold = veto && vote.majority_votes != null && total > 0
    && vote.majority_votes > 0 && vote.majority_votes <= total ? vote.majority_votes : null;
  const parts = [
    { key: "yes", count: vote.yes, label: "Za" },
    { key: "no", count: vote.no, label: "Przeciw" },
    { key: "abstain", count: vote.abstain, label: "Wstrz." },
    ...(notParticipating != null ? [{ key: "absent", count: notParticipating, label: "Nie głos." }] : []),
  ];
  const candidateVote = vote.kind === "ON_LIST";

  return <section className={styles.voteCard} aria-label={`Głosowanie nr ${vote.voting_number}`}>
    <div className={styles.cardMeta}>
      <span>{decision ? `Rozstrzygnięcie · ${new Date(vote.date).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" })}` : "Wynik głosowania"}</span>
      {!decision && <span>Nr {vote.voting_number}</span>}
    </div>
    {decision && <h2 className={styles.decision}>{meaning.label}</h2>}
    {candidateVote ? <>
      {!decision && <p className={styles.question}>{meaning.label}</p>}
      {vote.options?.map(option => <p key={option.name} className={styles.candidate}><span>{option.name}</span><strong>{option.votes}</strong></p>)}
    </> : <>
      {decision && threshold ? <p className={styles.majority}><strong>{vote.yes}</strong><span>/ {threshold} wymaganych głosów za</span></p> :
        <dl className={styles.counts} style={{ gridTemplateColumns: `repeat(${parts.length}, minmax(0, 1fr))` }}>
          {parts.map(part => <div key={part.key}><dd>{part.count}</dd><dt><i data-vote={part.key} aria-hidden />{part.label}</dt></div>)}
        </dl>}
      {total > 0 && <div className={styles.track} role="img" aria-label={parts.map(part => `${part.count} ${part.label}`).join(", ") + (threshold ? `. Próg: ${threshold}` : "")}>
        {parts.filter(part => part.count > 0).map(part => <span key={part.key} data-vote={part.key} style={{ width: `${part.count / total * 100}%` }} />)}
        {threshold && <i className={styles.threshold} style={{ left: `${threshold / total * 100}%` }} />}
      </div>}
      {total > 0 && <div className={styles.scale} aria-hidden><span>0</span><span>{total} {notParticipating == null ? "głosów oddanych" : "posłów"}</span></div>}
      {!decision && <p className={styles.question}>{meaning.question}</p>}
      {threshold && <p className={styles.thresholdNote}>Do odrzucenia weta potrzeba było <strong>{threshold} głosów za</strong>.{vote.yes < threshold ? ` Zabrakło ${threshold - vote.yes}.` : " Próg został osiągnięty."}</p>}
    </>}
    <Link className={styles.cardLink} href={vote.sourceUrl || `/glosowanie/${vote.id}`}>
      {decision ? "Przejdź do pełnego wyniku" : "Zobacz głosy klubów i posłów"}<ArrowRight size={17} aria-hidden />
    </Link>
  </section>;
}
