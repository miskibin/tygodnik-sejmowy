import type { RelatedStatement } from "@/lib/db/statements";
import { StatementCard } from "./StatementCard";

export function RelatedSpeeches({ items }: { items: RelatedStatement[] }) {
  if (items.length === 0) return null;
  return (
    <section className="max-w-[820px] mx-auto my-12">
      <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-muted-foreground mb-4">
        Inne wypowiedzi tego posła
      </div>
      <ul className="space-y-3">
        {items.map((it) => (
          <StatementCard
            key={it.id}
            variant="related"
            id={it.id}
            mpId={null}
            speakerName={it.speakerName}
            date={it.date}
            proceedingNumber={it.proceedingNumber}
            tone={it.tone}
            viralQuote={it.viralQuote}
            summaryOneLine={it.summaryOneLine}
          />
        ))}
      </ul>
    </section>
  );
}
