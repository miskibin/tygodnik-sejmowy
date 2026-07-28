// Section heading + kicker. Shared across the sitting view (/posiedzenie) and
// the weekly feed (/tygodnik).
//
// `num` is retained in the signature because every call site passes it, but it
// is no longer rendered — the Roman-numeral marker was part of the newspaper
// skin. Delete the prop once the call sites are cleaned up.

import type { ReactNode } from "react";

export function SectionHead({
  title,
  sub,
  anchor,
  tone = "default",
}: {
  num?: number;
  title: string;
  sub?: ReactNode;
  anchor?: string;
  tone?: "default" | "muted" | "inverted";
}) {
  const titleColor = tone === "inverted" ? "var(--background)" : "var(--foreground)";
  const subColor =
    tone === "inverted" ? "var(--border)" : "var(--muted-foreground)";
  const ruleColor =
    tone === "inverted" ? "var(--muted-foreground)" : "var(--border)";

  return (
    <div
      id={anchor}
      className="flex items-baseline gap-5 pb-3 mb-6 border-b"
      style={{ borderColor: ruleColor, scrollMarginTop: 80 }}
    >
      <h2
        className="font-semibold m-0"
        style={{
          fontSize: 20,
          lineHeight: 1.2,
          letterSpacing: "-0.015em",
          color: titleColor,
        }}
      >
        {title}
      </h2>
      {sub && (
        <span
          className="ml-auto text-right hidden md:block"
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

// `size` and `letterSpacing` are kept for call-site compatibility but ignored —
// the kicker is now a plain small label, not wide-tracked mono small-caps.
export function Kicker({
  children,
  color = "var(--muted-foreground)",
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
      className={`font-medium ${className ?? ""}`}
      style={{ fontSize: 11, color }}
    >
      {children}
    </div>
  );
}
