// Color-keyed topic chips. Topic ids match lib/topics.ts vocabulary.

import { TOPICS } from "@/lib/topics";

export function TopicChips({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.slice(0, 4).map((t) => {
        const meta = (TOPICS as Record<string, { label: string; icon: string; color: string } | undefined>)[t];
        const color = meta?.color ?? "var(--muted-foreground)";
        return (
          <span
            key={t}
            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-sans text-[11px]"
            style={{
              background: "var(--muted)",
              border: `1px solid ${color}40`,
              color,
            }}
          >
            <span aria-hidden>{meta?.icon ?? "·"}</span>
            {meta?.label ?? t}
          </span>
        );
      })}
    </div>
  );
}

const ADDRESSEE_LABELS: Record<string, string> = {
  rzad: "do rządu",
  marszalek: "do marszałka",
  marszałek: "do marszałka",
  konkretna_osoba: "do konkretnej osoby",
  klub: "do klubu",
  opozycja: "do opozycji",
  koalicja: "do koalicji",
  obywatele: "do obywateli",
  media: "do mediów",
};

export function AddresseeChip({ addressee }: { addressee: string | null }) {
  if (!addressee) return null;
  const label = ADDRESSEE_LABELS[addressee] ?? `do: ${addressee}`;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-mono text-[10px] tracking-[0.14em] uppercase border border-border text-secondary-foreground"
      title={label}
    >
      <span className="text-destructive" aria-hidden>→</span>
      {label}
    </span>
  );
}
