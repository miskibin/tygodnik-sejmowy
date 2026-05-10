import type { AffectedGroup } from "@/lib/db/prints";
import { affectedGroupLabel, formatPopulation, severityColor, severityDots, severityLabel } from "@/lib/labels";

// Pill list showing who-is-affected + severity dots + estimated population.
// Extracted from ItemView so other event types (eli_inforce in particular)
// can render the same chrome when their enrichment carries groups.

export function AffectedGroups({ groups }: { groups: AffectedGroup[] }) {
  if (groups.length === 0) return null;
  return (
    <div className="my-4 font-sans text-xs">
      <div className="text-[10px] tracking-[0.16em] uppercase text-muted-foreground mb-2">
        Dla kogo
      </div>
      <div className="flex flex-wrap gap-2">
        {groups.map((g) => {
          const color = severityColor(g.severity);
          const pop = formatPopulation(g.estPopulation);
          return (
            <span
              key={g.tag}
              className="border rounded-full inline-flex items-center gap-1.5"
              style={{
                padding: "3px 10px",
                borderColor: g.severity === "high" ? color : "var(--border)",
                color: g.severity === "low" ? "var(--secondary-foreground)" : color,
              }}
              title={severityLabel(g.severity) + (pop ? ` · ~${pop} osób` : "")}
            >
              <span className="font-mono text-[9px] tracking-tight" style={{ color }}>
                {severityDots(g.severity)}
              </span>
              {affectedGroupLabel(g.tag)}
              {pop && (
                <span className="font-mono text-[10px] text-muted-foreground ml-0.5">
                  · {pop}
                </span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}
