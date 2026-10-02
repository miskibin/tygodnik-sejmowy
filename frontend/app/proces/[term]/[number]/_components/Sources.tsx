import { FileText, ExternalLink } from "lucide-react";
import type { SubPrint } from "@/lib/db/prints";
import styles from "./process.module.css";

type Source = { href: string; label: string; kind: string };
export function Sources({ term, number, attachments, subPrints, compact = false }: {
  term: number; number: string; attachments: string[]; subPrints: SubPrint[]; compact?: boolean;
}) {
  const items: Source[] = [
    ...attachments.map(fn => ({ href: `/api/proces/${term}/${encodeURIComponent(number)}/file/${encodeURIComponent(fn)}`, label: fn, kind: `Druk ${number}` })),
    ...subPrints.flatMap(sp => sp.attachments.map(fn => ({ href: `/api/proces/${term}/${encodeURIComponent(sp.number)}/file/${encodeURIComponent(fn)}`, label: sp.shortTitle || sp.title || fn, kind: `Druk ${sp.number} · ${fn}` }))),
  ];
  if (items.length === 0) items.push({ href: `https://www.sejm.gov.pl/Sejm${term}.nsf/druk.xsp?nr=${encodeURIComponent(number)}`, label: "Dokument w Sejmie", kind: `Druk ${number}` });
  const shown = compact ? items.slice(0, 3) : items;
  return <section className={`${styles.sources} ${compact ? "" : styles.fullSources}`}>
    <h2>Dokumenty źródłowe</h2>
    <ul>{shown.map((item, index) => <li key={`${item.href}-${index}`}><a href={item.href} target="_blank" rel="noopener noreferrer">
      <FileText size={18} aria-hidden /><span>{item.label}<small>{item.kind}</small></span><ExternalLink size={13} aria-hidden />
    </a></li>)}</ul>
    {compact && items.length > shown.length && <a href="#dokumenty">Wszystkie dokumenty ({items.length})</a>}
  </section>;
}
