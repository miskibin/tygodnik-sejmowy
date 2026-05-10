// "BOTTOM LINE 11 osób" / "W PORTFELU 12 mies." stat strip.
// Renders nothing if no slots resolve — never produces empty boxes.
// 1–3 slots; 1 slot is centered, 2+ form a horizontal grid.

export type KpiSlot = {
  kicker: string;     // "BOTTOM LINE", "W PORTFELU", "W KASIE"
  value: string;      // "11", "12", "2,6"
  unit: string;       // "osób", "mies.", "mln zł"
  sub?: string | null; // "członków komisji", "planowany czas"
};

export function KpiStrip({ slots }: { slots: KpiSlot[] }) {
  const filtered = slots.filter((s) => s && s.value && s.value.trim().length > 0);
  if (filtered.length === 0) return null;

  return (
    <div
      className="my-5 grid gap-x-6 gap-y-3"
      style={{
        gridTemplateColumns:
          filtered.length === 1
            ? "minmax(0, 1fr)"
            : `repeat(${filtered.length}, minmax(0, 1fr))`,
      }}
    >
      {filtered.map((s, i) => (
        <div key={i} className="min-w-0">
          <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1">
            {s.kicker}
          </div>
          <div className="flex items-baseline gap-1.5">
            <span
              className="font-serif font-medium text-foreground"
              style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)", lineHeight: 1 }}
            >
              {s.value}
            </span>
            <span className="font-sans text-[13px] text-secondary-foreground">
              {s.unit}
            </span>
          </div>
          {s.sub && (
            <div className="font-sans text-[11px] text-muted-foreground mt-1 leading-snug">
              {s.sub}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
