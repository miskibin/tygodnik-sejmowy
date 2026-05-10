import type { ReactNode } from "react";

// Shared title typography for tygodnik feed cards. Two sizes:
//   - "hero": first card (idx 0) of the print section
//   - "default": every other card (votings, ELI, interpellations, viral, prints 02+)
// Font scale is identical across types so the feed reads as one family.

export function CardTitle({
  size = "default",
  children,
  subtitle,
}: {
  size?: "hero" | "default";
  children: ReactNode;
  subtitle?: ReactNode;
}) {
  const fontSize =
    size === "hero"
      ? "clamp(1.75rem, 4.5vw, 2.75rem)"
      : "clamp(1.5rem, 3.5vw, 2.125rem)";
  return (
    <>
      <h2
        className="font-serif font-medium tracking-[-0.018em] m-0 mb-3 leading-[1.1] text-foreground"
        style={{ fontSize, textWrap: "balance" }}
      >
        {children}
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
