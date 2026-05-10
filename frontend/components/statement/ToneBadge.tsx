// Tone-of-voice cue. Color tint maps to enricher tone enum so the same
// quote feels different at a glance: red oxblood = clash, blue = analytical,
// green = constructive, amber = appeal, gray = neutral. Editorial tones map
// to shadcn semantic vars so they retune in dark mode; categorical tones
// (techniczny blue, emocjonalny amber) keep hardcoded hex.

const TONE_COLORS: Record<string, { ink: string; label: string }> = {
  konfrontacyjny: { ink: "var(--destructive)",       label: "konfrontacyjny" },
  techniczny:     { ink: "#1e3a8a",                  label: "techniczny" },
  argumentowy:    { ink: "var(--success)",           label: "argumentowy" },
  emocjonalny:    { ink: "#a16207",                  label: "emocjonalny" },
  apel:           { ink: "#a16207",                  label: "apel" },
  neutralny:      { ink: "var(--muted-foreground)",  label: "neutralny" },
};

export function ToneBadge({ tone }: { tone: string | null }) {
  if (!tone) return null;
  const meta = TONE_COLORS[tone] ?? TONE_COLORS.neutralny;
  const bg = `color-mix(in oklab, ${meta.ink} 14%, transparent)`;
  const border = `color-mix(in oklab, ${meta.ink} 35%, transparent)`;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm font-mono text-[10px] tracking-[0.14em] uppercase"
      style={{ background: bg, color: meta.ink, border: `1px solid ${border}` }}
      title={`Ton wypowiedzi: ${meta.label}`}
    >
      <span className="inline-block rounded-full" style={{ width: 5, height: 5, background: meta.ink }} aria-hidden />
      {meta.label}
    </span>
  );
}

// Same color palette exposed for the "mood ring" accent used in the hero.
export function toneInk(tone: string | null): string {
  if (!tone) return "var(--muted-foreground)";
  return TONE_COLORS[tone]?.ink ?? "var(--muted-foreground)";
}
