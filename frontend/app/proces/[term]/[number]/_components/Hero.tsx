import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { voteMeaning } from "@/lib/weekly-stories";
import { documentCategoryLabel, sponsorAuthorityLabel } from "@/lib/labels";
import type { PrintDetail, ProcessOutcome, LinkedVoting } from "@/lib/db/prints";
import styles from "./process.module.css";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });
}

function statusLabel(p: PrintDetail, outcome: ProcessOutcome | null): string | null {
  if (outcome?.act?.publishedAt) return outcome.act.eliId.startsWith("MP/") ? "Opublikowano w Monitorze Polskim" : "Opublikowano w Dz.U.";
  const labels: Record<string, string> = {
    Withdrawn: "Wycofany", Rejected: "Odrzucony", End: "Zakończono",
    PresidentSignature: "Podpisano przez Prezydenta", ToPresident: "Przekazano Prezydentowi",
    SenatePosition: "Stanowisko Senatu", SenateAmendments: "Rozpatrywanie poprawek Senatu",
    CommitteeWork: "W komisji", CommitteeReport: "W komisji", SejmReading: "W Sejmie", Voting: "W Sejmie",
  };
  return labels[p.currentStageType ?? ""] ?? (outcome?.passed ? "Uchwalono — brak potwierdzonej publikacji w danych" : null);
}

export function Hero({ print, outcome, mainVoting }: {
  print: PrintDetail; outcome: ProcessOutcome | null; mainVoting: LinkedVoting | null;
}) {
  const category = documentCategoryLabel(print.documentCategory) ?? "Druk sejmowy";
  const rawHeadline = print.shortTitle?.trim() || print.title?.trim() || `Druk ${print.number}`;
  const subject = print.documentCategory === "weto_prezydenta"
    ? rawHeadline.replace(/^(?:weto|veto) prezydenta\s*[:—–-]\s*/i, "") : rawHeadline;
  const headline = subject ? subject[0].toLocaleUpperCase("pl") + subject.slice(1) : rawHeadline;
  const sponsor = sponsorAuthorityLabel(print.sponsorAuthority);
  const status = statusLabel(print, outcome);
  const v = mainVoting;
  const decision = v ? voteMeaning({
    id: v.votingId, voting_number: v.votingNumber, title: v.title,
    date: v.date, topic: v.topic ?? null, description: v.description ?? null,
    short_title: null, yes: v.yes, no: v.no, abstain: v.abstain,
    majority_votes: v.majorityVotes, motion_polarity: v.motionPolarity, kind: v.kind,
  }) : null;
  const sejmUrl = `https://www.sejm.gov.pl/Sejm${print.term}.nsf/druk.xsp?nr=${encodeURIComponent(print.number)}`;

  return <header className={styles.hero}>
    <div className={styles.category}><span>{category}</span><span>Druk {print.number}</span></div>
    <div className={styles.heroRow}>
      <h1>{headline}</h1>
      <a className={styles.external} href={sejmUrl} target="_blank" rel="noopener noreferrer">Dokument w Sejmie<ExternalLink size={15} aria-hidden /></a>
    </div>
    {print.title?.trim() && print.title.trim() !== headline && <p className={styles.officialTitle}>{print.title}</p>}
    <div className={styles.meta}>
      {decision && v ? <Link className={styles.status} href={`/glosowanie/${v.votingId}`}>{decision.label}</Link> : status && <span className={styles.status}>{status}</span>}
      {decision && status && outcome?.act?.publishedAt && <span>{status}</span>}
      {print.documentDate && <time dateTime={print.documentDate}>Dokument z {formatDate(print.documentDate)}</time>}
      {v && <time dateTime={v.date}>Głosowanie: {formatDate(v.date)}</time>}
      {sponsor && <span>{sponsor}</span>}
      {print.parentNumber && <Link href={`/proces/${print.term}/${encodeURIComponent(print.parentNumber)}`}>Dotyczy druku {print.parentNumber}</Link>}
    </div>
  </header>;
}
