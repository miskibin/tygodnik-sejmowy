import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { stageLabel } from "@/lib/stages";
import type { PrintDetail, ProcessStage, LinkedVoting } from "@/lib/db/prints";
import styles from "./process.module.css";

export function KnownEvents({ print, stages, votings }: { print: PrintDetail; stages: ProcessStage[]; votings: LinkedVoting[] }) {
  const dated = stages.filter(s => s.depth === 0 && s.stageDate);
  const events = dated.length > 0 ? dated.map(stage => ({
    key: `stage-${stage.ord}`, date: stage.stageDate!, label: stageLabel(stage.stageType, stage.stageName), href: "#historia",
  })) : [
    ...(print.documentDate ? [{ key: "document", date: print.documentDate, label: `Data dokumentu · druk ${print.number}`, href: "#dokumenty" }] : []),
    ...votings.map(vote => ({ key: `vote-${vote.votingId}`, date: vote.date, label: vote.topic || vote.title || `Głosowanie nr ${vote.votingNumber}`, href: `/glosowanie/${vote.votingId}` })),
  ];
  events.sort((a, b) => a.date.localeCompare(b.date));
  const shown = events.length > 4 ? [events[0], ...events.slice(-3)] : events;
  return <section className={styles.events}>
    <h2>Znane zdarzenia</h2>
    {shown.length > 0 && <ol>{shown.map(event => <li key={event.key}><time dateTime={event.date}>{new Date(event.date).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" })}</time><Link href={event.href}>{event.label}</Link></li>)}</ol>}
    {dated.length === 0 && <p className={styles.note}>Pełna historia etapów tego dokumentu nie jest dostępna w danych Sejmu.</p>}
    {dated.length > 0 && <Link href="#historia" className={styles.historyLink}>Pełna historia sprawy<ArrowRight size={15} aria-hidden /></Link>}
  </section>;
}
