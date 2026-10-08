import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { processStatus } from "@/lib/process-evidence";
import { documentCategoryLabel, sponsorAuthorityLabel } from "@/lib/labels";
import type { PrintDetail, ProcessOutcome, LinkedVoting, ProcessStage } from "@/lib/db/prints";
import styles from "./process.module.css";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pl-PL", { timeZone: "Europe/Warsaw", day: "numeric", month: "long", year: "numeric" });
}

export function Hero({ print, outcome, mainVoting, stages }: {
  print: PrintDetail; outcome: ProcessOutcome | null; mainVoting: LinkedVoting | null; stages: ProcessStage[];
}) {
  const category = documentCategoryLabel(print.documentCategory) ?? "Druk sejmowy";
  const rawHeadline = print.shortTitle?.trim() || print.title?.trim() || `Druk ${print.number}`;
  const subject = print.documentCategory === "weto_prezydenta"
    ? rawHeadline.replace(/^(?:weto|veto) prezydenta\s*[:—–-]\s*/i, "") : rawHeadline;
  const headline = subject ? subject[0].toLocaleUpperCase("pl") + subject.slice(1) : rawHeadline;
  const sponsor = sponsorAuthorityLabel(print.sponsorAuthority);
  const status = processStatus(print, outcome, stages);
  const v = mainVoting;
  const sejmUrl = `https://www.sejm.gov.pl/Sejm${print.term}.nsf/druk.xsp?nr=${encodeURIComponent(print.number)}`;

  return <header className={styles.hero}>
    <div className={styles.category}><span>{category}</span><span>Druk {print.number}</span></div>
    <div className={styles.heroRow}>
      <h1>{headline}</h1>
      <a className={styles.external} href={sejmUrl} target="_blank" rel="noopener noreferrer">Dokument w Sejmie<ExternalLink size={15} aria-hidden /></a>
    </div>
    {print.title?.trim() && print.title.trim() !== headline && <p className={styles.officialTitle}>{print.title}</p>}
    <div className={styles.meta}>
      {status && <span className={styles.status}>Ostatni odnotowany status: {status}</span>}
      {print.documentDate && <time dateTime={print.documentDate}>Dokument z {formatDate(print.documentDate)}</time>}
      {v && <time dateTime={v.date}>Ostatnie głosowanie: {formatDate(v.date)}</time>}
      {sponsor && <span>{sponsor}</span>}
      {print.parentNumber && <Link href={`/proces/${print.term}/${encodeURIComponent(print.parentNumber)}`}>Dotyczy druku {print.parentNumber}</Link>}
    </div>
  </header>;
}
