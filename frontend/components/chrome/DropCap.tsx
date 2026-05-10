import type { ReactNode } from "react";

export function DropCap({
  children,
  color = "var(--destructive)",
}: {
  children: ReactNode;
  color?: string;
}) {
  return (
    <span
      className="float-left font-serif font-medium italic"
      style={{
        fontSize: 88,
        lineHeight: 0.86,
        color,
        paddingRight: 12,
        paddingTop: 6,
      }}
    >
      {children}
    </span>
  );
}
