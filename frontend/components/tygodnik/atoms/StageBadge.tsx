import type { ReactNode } from "react";

// Small dark mono-uppercase badge — used for stage labels ("III CZYTANIE",
// "GŁOSOWANIE", "NOWY PROJEKT", ...). Shared between /posiedzenie and
// /tygodnik editorial layouts.

export function StageBadge({ children }: { children: ReactNode }) {
  return (
    <span
      className="font-mono uppercase"
      style={{
        fontSize: 9.5,
        color: "var(--background)",
        background: "var(--foreground)",
        padding: "3px 8px",
        letterSpacing: "0.14em",
      }}
    >
      {children}
    </span>
  );
}
