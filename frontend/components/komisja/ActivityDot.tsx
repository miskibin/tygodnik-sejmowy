import type { ActivityTier } from "@/lib/db/committees";

const STYLE: Record<ActivityTier, string> = {
  hot: "bg-destructive border-destructive",
  active: "bg-foreground border-foreground",
  recent: "bg-transparent border-foreground/60",
  quiet: "bg-transparent border-border",
};

const LABEL: Record<ActivityTier, string> = {
  hot: "Aktywna ostatnio",
  active: "Posiedzenie w ostatnim miesiącu",
  recent: "Posiedzenie w ostatnich 3 miesiącach",
  quiet: "Nieaktywna ostatnio",
};

export function ActivityDot({ tier }: { tier: ActivityTier }) {
  return (
    <span
      role="img"
      aria-label={LABEL[tier]}
      title={LABEL[tier]}
      className={`inline-block w-2 h-2 rounded-full border ${STYLE[tier]}`}
    />
  );
}
