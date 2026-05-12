import type { AgendaItem } from "@/lib/db/committees";

export function AgendaList({ items, max = 10 }: { items: AgendaItem[]; max?: number }) {
  if (items.length === 0) return null;
  const visible = items.slice(0, max);
  const hidden = items.slice(max);
  const ordered = items.every((i) => i.depth === 0);

  const renderItems = (its: AgendaItem[]) =>
    its.map((it, idx) => (
      <li
        key={idx}
        className="font-serif text-[14.5px] leading-relaxed text-secondary-foreground"
        style={{ marginLeft: it.depth > 0 ? it.depth * 16 : 0 }}
      >
        {it.text}
      </li>
    ));

  return (
    <div className="max-w-[820px]">
      {ordered ? (
        <ol className="list-decimal list-outside pl-6 space-y-1.5 marker:text-muted-foreground marker:font-mono marker:text-[12px]">
          {renderItems(visible)}
        </ol>
      ) : (
        <ul className="list-disc list-outside pl-6 space-y-1.5 marker:text-muted-foreground">
          {renderItems(visible)}
        </ul>
      )}
      {hidden.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer font-sans text-[11px] tracking-[0.08em] uppercase text-muted-foreground hover:text-destructive">
            + {hidden.length} {hidden.length === 1 ? "punkt" : "pozostałych punktów"}
          </summary>
          <div className="mt-2">
            {ordered ? (
              <ol
                className="list-decimal list-outside pl-6 space-y-1.5 marker:text-muted-foreground marker:font-mono marker:text-[12px]"
                start={visible.length + 1}
              >
                {renderItems(hidden)}
              </ol>
            ) : (
              <ul className="list-disc list-outside pl-6 space-y-1.5 marker:text-muted-foreground">
                {renderItems(hidden)}
              </ul>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
