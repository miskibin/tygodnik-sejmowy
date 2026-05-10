import type { ReactNode } from "react";

// Yellow `--highlight` "dotyczy cię, jeśli …" callout block. Generalised
// from ItemView's inline impact_punch — same chrome now reusable by viral
// quotes (the quote itself becomes the "dotyczy" hook).

export function DotyczyCallout({
  kicker = "DOTYCZY CIĘ, JEŚLI",
  children,
  size = "default",
}: {
  kicker?: string | null;
  children: ReactNode;
  size?: "default" | "large";
}) {
  return (
    <div
      className="font-serif italic text-foreground my-5"
      style={{
        fontSize: size === "large" ? 21 : 19,
        lineHeight: 1.5,
        background: "var(--highlight)",
        padding: size === "large" ? "16px 24px" : "14px 22px",
        borderLeft: "3px solid var(--destructive)",
        textWrap: "pretty",
      }}
    >
      {kicker && (
        <div className="font-sans not-italic font-medium text-[10px] tracking-[0.18em] uppercase text-destructive mb-2">
          {kicker}
        </div>
      )}
      {children}
    </div>
  );
}
