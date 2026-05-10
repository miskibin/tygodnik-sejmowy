// Mini horizontal timeline for ELI in-force cards: enacted → published →
// in-force, with today's marker. The "type-specific visual flourish" for
// eli_inforce events. Falls back to nothing if the act has no dates.

function fmtShort(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric" });
}

type Step = { key: string; label: string; date: string | null; emphasised?: boolean };

export function EliTimelineStrip({
  announcementDate,
  promulgationDate,
  legalStatusDate,
}: {
  announcementDate: string | null;
  promulgationDate: string | null;
  legalStatusDate: string | null;
}) {
  const steps: Step[] = [
    { key: "announce", label: "uchwalono", date: announcementDate },
    { key: "promulgate", label: "ogłoszono", date: promulgationDate },
    { key: "inforce", label: "w mocy", date: legalStatusDate, emphasised: true },
  ];
  const filled = steps.filter((s) => !!s.date).length;
  if (filled === 0) return null;

  return (
    <div className="my-4 max-w-[420px]">
      <div className="flex items-center gap-1 mb-1.5">
        {steps.map((step) => {
          const has = !!step.date;
          const bg = step.emphasised && has
            ? "var(--destructive)"
            : has
            ? "var(--secondary-foreground)"
            : "var(--border)";
          return (
            <div
              key={step.key}
              className="flex-1 h-[3px] rounded-full"
              style={{ background: bg }}
              aria-hidden
            />
          );
        })}
      </div>
      <div className="grid grid-cols-3 gap-1 font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground">
        {steps.map((step) => (
          <div key={step.key} className="min-w-0">
            <div className={step.emphasised ? "text-destructive font-semibold" : ""}>
              {step.label}
            </div>
            <div className="text-secondary-foreground normal-case tracking-normal">
              {fmtShort(step.date)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
