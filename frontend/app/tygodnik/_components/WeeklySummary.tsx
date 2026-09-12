import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { remarkCitations } from "@/components/tygodnik/CitationLink";
import styles from "./weekly.module.css";

export function WeeklySummary({ text, term }: { text: string; term: number }) {
  return <div className={styles.markdown}><ReactMarkdown
    remarkPlugins={[remarkGfm, [remarkCitations, { term }]]}
    skipHtml
    components={{
      img: () => null,
      h1: ({ children }) => <h3>{children}</h3>,
      h2: ({ children }) => <h3>{children}</h3>,
      table: ({ children }) => <div className={styles.tableScroll}><table>{children}</table></div>,
    }}
  >{text}</ReactMarkdown></div>;
}
