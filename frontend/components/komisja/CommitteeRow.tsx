import Link from "next/link";
import type { CommitteeListItem, CommitteeActivity, ActivityTier } from "@/lib/db/committees";
import { activityTier } from "@/lib/db/committees";
import { ActivityDot } from "./ActivityDot";
import { formatRelativePl, pluralPl } from "@/lib/format/relative-pl";

export type CommitteeRowProps = {
  c: CommitteeListItem;
  activity: CommitteeActivity | null;
};

function activityLabel(a: CommitteeActivity | null): string {
  if (!a || a.last30dCount === 0) return "—";
  const n = a.last30dCount;
  return `${n} ${pluralPl(n, ["posiedz.", "posiedz.", "posiedz."])} / 30 dni`;
}

function activityClass(tier: ActivityTier): string {
  if (tier === "hot") return "text-destructive";
  if (tier === "active") return "text-foreground";
  return "text-muted-foreground";
}

export function CommitteeRow({ c, activity }: CommitteeRowProps) {
  const tier = activity ? activityTier(activity) : "quiet";
  const last = activity?.lastSittingDate ? formatRelativePl(activity.lastSittingDate) : null;

  return (
    <Link
      href={`/komisja/${c.id}`}
      className="block border border-border hover:border-destructive bg-background transition-colors px-4 py-3"
    >
      <div className="grid items-baseline gap-x-3 gap-y-1 grid-cols-[14px_60px_1fr_auto] md:grid-cols-[14px_60px_1fr_150px_120px]">
        <div className="flex items-center justify-center pt-[3px]">
          <ActivityDot tier={tier} />
        </div>
        <div className="font-mono text-[11px] tracking-wide text-destructive uppercase">{c.code}</div>
        <div className="font-serif text-[15px] leading-snug min-w-0 break-words">{c.name}</div>
        <div
          className={`font-mono text-[11px] text-right md:text-left tabular-nums ${activityClass(tier)}`}
          aria-label="Posiedzenia w ostatnich 30 dniach"
        >
          <span className="md:hidden">{last ?? activityLabel(activity)}</span>
          <span className="hidden md:inline">{activityLabel(activity)}</span>
        </div>
        <div className="hidden md:block font-sans text-[11px] text-muted-foreground text-right tabular-nums">
          {last ?? "—"}
        </div>
      </div>
    </Link>
  );
}
