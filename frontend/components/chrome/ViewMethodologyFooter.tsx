import type { ReactNode } from "react";

export type ViewMethodologyFooterColumn = {
  kicker: string;
  children: ReactNode;
};

export function ViewMethodologyFooter({
  columns,
  topRule = true,
  className,
}: {
  columns: ViewMethodologyFooterColumn[];
  topRule?: boolean;
  className?: string;
}) {
  const cols = columns.length;
  const gridCols =
    cols <= 2
      ? "sm:grid-cols-2"
      : cols === 3
        ? "sm:grid-cols-2 lg:grid-cols-3"
        : "sm:grid-cols-2 lg:grid-cols-4";

  return (
    <section
      className={`mt-12 sm:mt-16 pt-8 sm:pt-10 ${topRule ? "border-t border-border" : ""} ${className ?? ""}`.trim()}
    >
      <div className={`grid gap-7 sm:gap-8 grid-cols-1 ${gridCols} font-sans text-[12px] sm:text-[12.5px] leading-[1.55] text-muted-foreground`}>
        {columns.map((c, i) => (
          <div key={i} className="min-w-0">
            <div className="font-mono text-[9.5px] sm:text-[10px] tracking-[0.16em] uppercase text-destructive mb-2.5">
              {c.kicker}
            </div>
            <div className="text-pretty break-words">{c.children}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
