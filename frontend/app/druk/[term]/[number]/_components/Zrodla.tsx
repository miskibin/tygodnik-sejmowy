import type { SubPrint } from "@/lib/db/prints";

type Source = {
  href: string;
  label: string;
  kind: string | null;
};

export function Zrodla({
  term,
  number,
  attachments,
  subPrints,
}: {
  term: number;
  number: string;
  attachments: string[];
  subPrints: SubPrint[];
}) {
  const items: Source[] = [
    ...attachments.map<Source>((fn) => ({
      href: `/api/druk/${term}/${encodeURIComponent(number)}/file/${encodeURIComponent(fn)}`,
      label: fn,
      kind: null,
    })),
    ...subPrints.flatMap<Source>((sp) =>
      sp.attachments.map((fn) => ({
        href: `/api/druk/${term}/${encodeURIComponent(sp.number)}/file/${encodeURIComponent(fn)}`,
        label: fn,
        kind: sp.shortTitle || sp.number,
      })),
    ),
  ];
  if (items.length === 0) return null;

  return (
    <section className="pt-7 pb-9 border-t border-border">
      <div className="max-w-[1280px] mx-auto flex items-baseline gap-4 flex-wrap" style={{ rowGap: 10 }}>
        <span
          className="font-mono uppercase"
          style={{
            fontSize: 10,
            color: "var(--muted-foreground)",
            letterSpacing: "0.16em",
            flex: "0 0 auto",
          }}
        >
          pliki źródłowe
        </span>
        <div className="flex flex-wrap flex-1" style={{ gap: "6px 14px" }}>
          {items.map((it, i) => (
            <a
              key={i}
              href={it.href}
              className="font-mono no-underline pb-px text-secondary-foreground hover:text-destructive"
              style={{
                fontSize: 12,
                borderBottom: "1px solid var(--border)",
              }}
            >
              {it.label}
              {it.kind && (
                <span className="ml-1" style={{ color: "var(--muted-foreground)", borderBottom: "none" }}>
                  · {it.kind}
                </span>
              )}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
