import { MarkdownText } from "@/components/text/MarkdownText";
import { affectedGroupLabel, severityLabel } from "@/lib/labels";
import type { PrintDetail } from "@/lib/db/prints";
import styles from "./process.module.css";

export function Summary({ print }: { print: PrintDetail }) {
  const body = (print.summaryPlain ?? print.summary ?? "").trim();
  const veto = print.documentCategory === "weto_prezydenta";
  return <section className={styles.summary}>
    <h2>{veto ? "Co zakwestionował prezydent?" : "Co zawiera dokument?"}</h2>
    {body ? <div className={styles.body}><MarkdownText text={body} allowLists inline={false} /></div> : <p className={styles.body}>Streszczenie nie jest jeszcze dostępne.</p>}
    {!print.isProcedural && print.citizenAction && <div className={styles.action}><h3>Co możesz zrobić</h3><p>{print.citizenAction}</p></div>}
    {!print.isProcedural && print.affectedGroups.length > 0 && <section className={styles.affected}>
      <h3>Kogo dotyczy projekt</h3>
      {print.impactPunch && <p className={styles.body}>{print.impactPunch}</p>}
      <ul>{print.affectedGroups.map((group, index) => <li key={`${group.tag}-${index}`}>
        <span>{affectedGroupLabel(group.tag)}</span><small>{severityLabel(group.severity)}{group.estPopulation != null && ` · ~${(group.estPopulation / 1_000_000).toFixed(1)} mln`}</small>
      </li>)}</ul>
    </section>}
    {body && <p className={styles.note}>Streszczenie AI treści dokumentu.{veto ? " Opisuje stanowisko prezydenta." : ""} Aktualny stan prac przedstawiają głosowania i historia sprawy.</p>}
  </section>;
}
