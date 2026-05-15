// Shared semantic colour resolution for the proceeding-points mockup.
// All values are CSS-var references — no hex codes leak into JSX. This
// mirrors the convention in components/statement/ToneBadge.tsx (where the
// tone palette lives) and components/tygodnik/atoms/VoteResultBar.tsx
// (verdict colours).

import type { Tone, Vote } from "./data";

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
//
// - "reject"/"minority" motions invert: a passed reject motion = bill
//   killed = destructive; a rejected reject motion = bill survives = success.
// - "procedural" motions are not bill-level decisions (e.g. odwołanie
//   marszałka). Render warm/neutral instead of red/green.
// - "pass"/"amendment" and missing polarity fall back to the verdict text.
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
