import type { ReactNode } from "react";

// PageHeading — single source of truth for page-hero <h1> typography.
//
// Two sizes cover ~90% of pages. "lg" is the default standard hero used
// across index/list/detail pages (matching the most common existing
// clamp range). "xl" is for atlas/feature pages with bigger display type.
//
// Pages with intentionally-distinct typography should NOT migrate:
//   - app/page.tsx (landing) — bespoke entry-point hero
//   - app/mowa/[id]/page.tsx — magazine-style StatementHero
//   - app/manifest/page.tsx — editorial display headline w/ <br /> breaks
//   - app/budzet/page.tsx — editorial display headline w/ <br /> breaks
//   - app/atlas/page.tsx — multi-line display headline w/ <br /> breaks
//   - app/obietnice/page.tsx — display title with inline <em>vs</em>
// These are bespoke editorial spreads, not standard headers.

export type PageHeadingSize = "lg" | "xl";

export type PageHeadingProps = {
  /** Small caps eyebrow above heading (e.g. "POSŁOWIE", "GŁOSOWANIE 615"). */
  kicker?: ReactNode;
  /** Heading text — may include inline <em>/<span> for accent words. */
  children: ReactNode;
  /** "lg" (default) — standard hero. "xl" — atlas/feature pages. */
  size?: PageHeadingSize;
  /** Optional small caption row below heading (date range, counts, etc). */
  caption?: ReactNode;
  className?: string;
};

const SIZE_TOKENS: Record<
  PageHeadingSize,
  { fontSize: string; lineHeight: number; letterSpacing: string }
> = {
  lg: { fontSize: "clamp(2rem, 5vw, 3.25rem)", lineHeight: 1.05, letterSpacing: "-0.025em" },
  xl: { fontSize: "clamp(2.5rem, 6vw, 4rem)", lineHeight: 0.94, letterSpacing: "-0.03em" },
};

export function PageHeading({
  kicker,
  children,
  size = "lg",
  caption,
  className,
}: PageHeadingProps) {
  const tokens = SIZE_TOKENS[size];
  return (
    <div className={className}>
      {kicker && (
        <div className="font-sans text-[11px] tracking-[0.16em] uppercase text-destructive mb-2">
          {kicker}
        </div>
      )}
      <h1
        className="font-serif font-medium m-0"
        style={{
          fontSize: tokens.fontSize,
          lineHeight: tokens.lineHeight,
          letterSpacing: tokens.letterSpacing,
        }}
      >
        {children}
      </h1>
      {caption && (
        <div className="font-mono text-[11px] text-muted-foreground tracking-wide mt-2">
          {caption}
        </div>
      )}
    </div>
  );
}
