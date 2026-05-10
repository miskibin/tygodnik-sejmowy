import Link from "next/link";

export type ContextItem = {
  id: number;
  num: number;
  speakerName: string | null;
  function: string | null;
  startDatetime: string | null;
  preview: string | null; // viral_quote ?? summary_one_line ?? null
  isCurrent: boolean;
};

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

function truncate(s: string, max = 90): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

// Vertical 5-row strip showing the surrounding statements in the same
// proceeding day (prev2, prev1, THIS, next1, next2). Renders fewer rows at
// the start/end of a day. Each non-current row links to its own /mowa page.
export function StatementContextStrip({ items }: { items: ContextItem[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <ol className="m-0 p-0 list-none">
        {items.map((it) => {
          const time = formatTime(it.startDatetime);
          const preview = it.preview ? truncate(it.preview) : it.function ?? null;
          const speaker = it.speakerName ?? "—";
          const isCurrent = it.isCurrent;

          const inner = (
            <div
              className={
                "grid grid-cols-[60px_1fr] gap-3 py-2.5 px-3 " +
                (isCurrent
                  ? "border-l-2 border-destructive bg-muted"
                  : "border-l-2 border-transparent hover:bg-muted")
              }
            >
              <div className="font-mono text-[11px] tracking-wide text-muted-foreground pt-0.5">
                {time}
              </div>
              <div className="min-w-0">
                <div
                  className={
                    "font-sans text-[13px] truncate " +
                    (isCurrent
                      ? "font-semibold text-foreground"
                      : "text-secondary-foreground")
                  }
                >
                  {speaker}
                  {isCurrent && (
                    <span className="ml-2 font-mono text-[9px] tracking-[0.18em] uppercase text-destructive">
                      ta wypowiedź
                    </span>
                  )}
                </div>
                {preview && (
                  <div className="font-serif italic text-[12px] text-muted-foreground leading-snug mt-0.5 truncate">
                    {preview}
                  </div>
                )}
              </div>
            </div>
          );

          return (
            <li key={it.id} className="m-0">
              {isCurrent ? (
                inner
              ) : (
                <Link
                  href={`/mowa/${it.id}`}
                  className="block no-underline text-inherit"
                  aria-label={`Wypowiedź ${it.num}: ${speaker}`}
                >
                  {inner}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
