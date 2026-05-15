// Shared semantic colour resolution for the sitting view.
// All values are CSS-var references — no hex codes leak into JSX. Mirrors
// the convention in components/statement/ToneBadge.tsx (tone palette) and
// components/tygodnik/atoms/VoteResultBar.tsx (verdict colours).

import type { Tone, Vote } from "./types";

// Tones use the same six-value palette as ToneBadge — see
// components/statement/ToneBadge.tsx. Two values still resolve to hex
// rather than var() because the design system has no dedicated token for
// "navy analytical" or "amber appeal" yet.
export const TONE_INK: Record<Tone, string> = {
  konfrontacyjny: "var(--destructive)",
  techniczny: "#1e3a8a",
  argumentowy: "var(--success)",
  emocjonalny: "#a16207",
  apel: "#a16207",
  neutralny: "var(--muted-foreground)",
};

export const TONE_LABEL: Record<Tone, string> = {
  konfrontacyjny: "konfrontacyjny",
  techniczny: "techniczny",
  argumentowy: "argumentowy",
  emocjonalny: "emocjonalny",
  apel: "apel",
  neutralny: "neutralny",
};

// Verdict colour for decision cards + VoteMini. Mirrors the logic in
// components/tygodnik/atoms/VoteResultBar.tsx (computeBillOutcome): the
// final colour depends on the motion's polarity, not just whether
// "PRZYJĘTA" or "ODRZUCONA" appears in the verdict text.
export function verdictInk(
  result: Vote["result"],
  motionPolarity?: Vote["motionPolarity"],
): string {
  if (motionPolarity === "procedural") return "var(--warning)";
  if (motionPolarity === "reject" || motionPolarity === "minority") {
    if (result.includes("PRZYJ")) return "var(--destructive)";
    if (result.includes("ODRZUC")) return "var(--success)";
  }
  if (result.includes("PRZYJ")) return "var(--success)";
  if (result.includes("ODRZUC")) return "var(--destructive)";
  return "var(--warning)";
}
