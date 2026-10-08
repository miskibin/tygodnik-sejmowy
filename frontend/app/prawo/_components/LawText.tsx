import type { LawBlock, LawLinks } from "@/lib/law-reader";
import { lawInline } from "@/lib/law-reader";
import type { LawUnit } from "@/lib/law-types";
import styles from "./reader.module.css";

export function LawText({ unit, blocks, links, ids }: { unit: LawUnit; blocks: LawBlock[]; links: LawLinks; ids: Set<string> }) {
  return <div className={styles.legalText}>{blocks.map(block => <p key={block.id} id={block.id} className={styles[block.kind]}>
    {block.marker && <a className={styles.marker} href={`#${encodeURIComponent(block.id)}`} aria-label={`Odnośnik do ${unit.label}, ${block.marker}`}>{block.marker}</a>}
    <span>{lawInline(block.text, unit, links, ids, block.scope).map((part, index) => part.href
      ? <a key={index} className={styles.reference} href={part.href} {...(part.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{part.text}</a>
      : part.text)}</span>
  </p>)}</div>;
}
