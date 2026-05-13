import Link from "next/link";
import type { ReactNode } from "react";

// Shared title typography for tygodnik feed cards. Two sizes:
//   - "hero": first card (idx 0) of the print section
//   - "default": every other card (votings, ELI, interpellations, viral, prints 02+)
// Font scale is identical across types so the feed reads as one family.

export function CardTitle({
  size = "default",
  children,
  subtitle,
  href,
}: {
  size?: "hero" | "default";
  children: ReactNode;
  subtitle?: ReactNode;
  /** When set, the heading is wrapped in an in-app link (e.g. druk detail). */
  href?: string;
}) {
  const fontSize =
    size === "hero"
      ? "clamp(1.75rem, 4.5vw, 2.75rem)"
      : "clamp(1.5rem, 3.5vw, 2.125rem)";
  const titleBody = href ? (
    <Link
      href={href}
      className="text-inherit no-underline decoration-foreground/35 underline-offset-[0.18em] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
    >
      {children}
    </Link>
  ) : (
    children
  );
  return (
    <>
      <h2
        className="font-serif font-medium tracking-[-0.018em] m-0 mb-3 leading-[1.1] text-foreground"
        style={{ fontSize, textWrap: "balance" }}
      >
        {titleBody}
      </h2>
      {subtitle && (
        <div
          className="font-serif text-secondary-foreground mb-3"
          style={{ fontSize: size === "hero" ? 18 : 16, lineHeight: 1.6 }}
        >
          {subtitle}
        </div>
      )}
    </>
  );
}
