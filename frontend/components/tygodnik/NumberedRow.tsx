import Link from "next/link";
import type { ReactNode } from "react";

// Shared chrome for tygodnik feed cards: a serif numbered index column +
// 2-col grid body. Re-implemented 5x across BriefList variants and
// VotingHemicycleCard before consolidation. Cards still own their body
// content; only the index column + outer grid live here.

export type NumberedRowProps = {
  idx: number;
  // Override default 2-digit numeric label (e.g. InterpellationCard renders
  // "30d" delay-days instead of an ordinal index).
  indexLabel?: ReactNode;
  indexSize?: number;
  indexColor?: string;
  // Small-caps label rendered above the meta block — ItemView's section
  // label (e.g. "DZIAŁALNOŚĆ GOSPODARCZA").
  kicker?: ReactNode;
  // Ad-hoc slot between the index and meta lines — persona pills (ItemView),
  // MPAvatar (ViralCard).
  asideExtra?: ReactNode;
  // Mono-typed sub-lines under the index — date, druk number, kadencja, etc.
  meta?: ReactNode;
  children: ReactNode;
  // When set the whole row becomes a single <Link>. Used by
  // VotingHemicycleCard.
  href?: string;
  className?: string;
  // Vertical padding preset. ItemView uses the larger preset, all other
  // tygodnik cards use the tighter one.
  pad?: "default" | "loose";
  /** When false, hide the large left ordinal (e.g. viral quote rows). */
  showOrdinal?: boolean;
};

const PAD = {
  default: "py-6 md:py-8",
  loose: "py-10 md:py-14",
} as const;

export function NumberedRow({
  idx,
  indexLabel,
  indexSize = 36,
  indexColor = "var(--secondary-foreground)",
  kicker,
  asideExtra,
  meta,
  children,
  href,
  className,
  pad = "default",
  showOrdinal = true,
}: NumberedRowProps) {
  const padClass = PAD[pad];
  const wrapperClass =
    `${padClass} border-b border-border ${className ?? ""}`.trim();
  const linkClass =
    `block ${padClass} border-b border-border transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-destructive ${className ?? ""}`.trim();

  const inner = (
    <div className="grid gap-4 md:gap-8 grid-cols-1 md:grid-cols-[140px_1fr] xl:grid-cols-[180px_1fr]">
      <aside className="min-w-0 font-sans text-[11px] text-muted-foreground tracking-wide flex md:block items-start gap-4">
        {showOrdinal && (
          <div
            className="font-serif italic font-medium shrink-0 mb-0 md:mb-2"
            style={{ fontSize: indexSize, lineHeight: 1, color: indexColor }}
          >
            {indexLabel ?? String(idx + 1).padStart(2, "0")}
          </div>
        )}
        <div className="flex-1 min-w-0 flex flex-col gap-2 md:gap-0 md:contents">
          {kicker && (
            <div className="text-[10px] tracking-[0.16em] uppercase md:mb-3.5 leading-snug">
              {kicker}
            </div>
          )}
          {asideExtra}
          {meta && (
            <div className="font-mono text-[10px] leading-[1.7] text-muted-foreground">
              {meta}
            </div>
          )}
        </div>
      </aside>
      <div className="min-w-0 max-w-[820px]">{children}</div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className={linkClass}>
        {inner}
      </Link>
    );
  }
  return <article className={wrapperClass}>{inner}</article>;
}
