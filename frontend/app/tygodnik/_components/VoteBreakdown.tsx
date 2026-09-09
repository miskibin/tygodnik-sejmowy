import type { StoryVote } from "@/lib/weekly-stories";
import styles from "./weekly.module.css";

/** Counts describe the motion being voted on, not approval of the bill. */
export function VoteBreakdown({ vote, compact = false }: { vote: StoryVote; compact?: boolean }) {
  if (vote.kind === "ON_LIST") {
    const options = vote.options ?? [];
    const scale = Math.max(...options.map(o => o.votes), 1);
    return <div className={styles.candidateChart}>{options.map(o => <div key={o.name}>
      <div className={styles.candidateLabel}><span>{o.name}</span><strong>{o.votes} głosów</strong></div>
      <div className={styles.candidateTrack} aria-hidden><span style={{ width: `${o.votes / scale * 100}%` }} /></div>
    </div>)}</div>;
  }
  const total = vote.yes + vote.no + vote.abstain;
  if (!total) return null;
  const segments = [
    { key: "yes", count: vote.yes, label: "za" },
    { key: "no", count: vote.no, label: "przeciw" },
    { key: "abstain", count: vote.abstain, label: "wstrz." },
  ];
  const threshold = !compact && vote.majority_votes != null && vote.majority_votes <= total
    && /wniosk.*Prezydenta.*ponowne rozpatrzenie/i.test(vote.title) ? vote.majority_votes : null;
  return <div className={styles.voteChart} data-compact={compact}>
    <div className={styles.voteTrack} role="img" aria-label={`${vote.yes} za, ${vote.no} przeciw, ${vote.abstain} wstrzymujących się${threshold ? `. Wymagana większość: ${threshold}` : ""}`}>
      {segments.filter(s => s.count > 0).map(s => <span key={s.key} data-vote={s.key} style={{ width: `${s.count / total * 100}%` }} />)}
      {threshold && <i className={styles.threshold} style={{ left: `${threshold / total * 100}%` }} />}
    </div>
    <div className={styles.voteLegend} aria-hidden>{segments.map(s => <span key={s.key}><i data-vote={s.key} /><strong>{s.count}</strong> {s.label}</span>)}</div>
    {threshold && <p className={styles.thresholdLabel}>Do odrzucenia weta potrzeba było {threshold} głosów za</p>}
  </div>;
}
