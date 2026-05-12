import Link from "next/link";
import { ClubBadge } from "@/components/clubs/ClubBadge";
import {
  PARTY_TO_KLUB,
  partyShort,
  type PromiseHubRow,
} from "@/lib/db/promises";

function detailHref(row: Pick<PromiseHubRow, "partyCode" | "slug" | "id">): string {
  if (row.partyCode && row.slug) {
    return `/obietnice/${encodeURIComponent(row.partyCode)}/${encodeURIComponent(row.slug)}`;
  }
  return `/obietnice/${row.id}`;
}

function activitySummary(row: PromiseHubRow): { text: string; tone: "strong" | "weak" | "muted" } {
  if (row.confirmedCount > 0) {
    const parts = [`${row.confirmedCount} druk${plural(row.confirmedCount, "", "i", "ów")}`];
    if (row.candidateCount > 0) {
      parts.push(`${row.candidateCount} kandydat${plural(row.candidateCount, "", "ów", "ów")}`);
    }
    return { text: parts.join(" · "), tone: "strong" };
  }
  if (row.candidateCount > 0) {
    return {
      text: `${row.candidateCount} kandydat${plural(row.candidateCount, "", "ów", "ów")} (niepewne)`,
      tone: "weak",
    };
  }
  return { text: "bez ruchu w Sejmie", tone: "muted" };
}

function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const lastTwo = n % 100;
  const last = n % 10;
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return few;
  return many;
}

function hostFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function PromiseRow({ row, idx }: { row: PromiseHubRow; idx: number }) {
  const klub = row.partyCode ? PARTY_TO_KLUB[row.partyCode] ?? null : null;
  const href = detailHref(row);
  const activity = activitySummary(row);
  const host = hostFromUrl(row.sourceUrl);
  const isStale = activity.tone === "muted";

  return (
    <Link
      href={href}
      className="block border-b border-border py-3.5 first:pt-2 hover:bg-muted transition-colors no-underline text-foreground"
      style={{ opacity: isStale ? 0.65 : 1 }}
      aria-labelledby={`promise-title-${row.id}`}
    >
      <article className="flex items-start gap-3">
        <span className="font-mono text-[10px] text-muted-foreground tracking-wider tabular-nums pt-[3px] w-8 shrink-0">
          {String(idx + 1).padStart(3, "0")}
        </span>
        {klub ? (
          <span className="pt-[1px] shrink-0">
            <ClubBadge klub={klub} variant="logo" size="md" />
          </span>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="font-sans text-[11px] font-medium text-foreground">
              {row.partyCode ? partyShort(row.partyCode) : "—"}
            </span>
          </div>
          <h3
            id={`promise-title-${row.id}`}
            className="font-serif font-medium m-0 leading-snug text-foreground"
            style={{ fontSize: "clamp(0.98rem, 1.6vw, 1.15rem)", textWrap: "balance" }}
          >
            {row.title}
          </h3>
          <div className="mt-1.5 flex items-baseline flex-wrap gap-x-4 gap-y-0.5 font-sans text-[12px]">
            <span
              style={{
                color:
                  activity.tone === "strong"
                    ? "var(--foreground)"
                    : activity.tone === "weak"
                      ? "var(--secondary-foreground)"
                      : "var(--muted-foreground)",
                fontStyle: activity.tone === "muted" ? "italic" : "normal",
              }}
            >
              {activity.text}
            </span>
            {host && (
              <span className="font-mono text-[10px] text-muted-foreground tracking-wide">
                źródło: {host}
              </span>
            )}
          </div>
        </div>
      </article>
    </Link>
  );
}
