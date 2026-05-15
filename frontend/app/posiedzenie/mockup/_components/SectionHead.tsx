// Roman-numeral section markers used across the proceeding-points narrative.
// The italic serif numeral + serif h2 + optional sans subtitle echoes the
// styling already used inside ProceedingPoints.tsx and BriefList atoms.

import type { ReactNode } from "react";

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

export function SectionHead({
  num,
  title,
  sub,
  anchor,
  tone = "default",
}: {
  num: number;
  title: string;
  sub?: ReactNode;
  anchor?: string;
  /** "inverted" swaps colours for sections that sit on muted/secondary surfaces. */
  tone?: "default" | "muted" | "inverted";
}) {
  const numColor =
    tone === "inverted" ? "var(--highlight)" : "var(--destructive-deep)";
  const titleColor = tone === "inverted" ? "var(--background)" : "var(--foreground)";
  const subColor =
    tone === "inverted" ? "var(--border)" : "var(--muted-foreground)";
  const ruleColor =
    tone === "inverted" ? "var(--muted-foreground)" : "var(--rule)";

  return (
    <div
      id={anchor}
      className="flex items-baseline gap-5 pb-4 mb-7 border-b-2"
      style={{ borderColor: ruleColor, scrollMarginTop: 80 }}
    >
      <span
        className="font-serif italic font-medium shrink-0"
        style={{
          fontSize: 36,
          lineHeight: 1,
          color: numColor,
          minWidth: 32,
        }}
        aria-hidden
      >
        {ROMAN[num - 1] ?? num}
      </span>
      <h2
        className="font-serif font-medium m-0"
        style={{
          fontSize: 28,
          lineHeight: 1.05,
          letterSpacing: "-0.018em",
          color: titleColor,
        }}
      >
        {title}.
      </h2>
      {sub && (
        <span
          className="font-sans ml-auto text-right hidden md:block"
          style={{
            fontSize: 12.5,
            lineHeight: 1.4,
            color: subColor,
            maxWidth: 460,
          }}
        >
          {sub}
        </span>
      )}
    </div>
  );
}

export function Kicker({
  children,
  color = "var(--muted-foreground)",
  size = 10,
  letterSpacing = "0.16em",
  className,
}: {
  children: ReactNode;
  color?: string;
  size?: number;
  letterSpacing?: string;
  className?: string;
}) {
  return (
    <div
      className={`font-mono uppercase ${className ?? ""}`}
      style={{ fontSize: size, color, letterSpacing }}
    >
      {children}
    </div>
  );
}
