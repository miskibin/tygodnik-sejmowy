import Link from "next/link";
import type { Rebel } from "@/lib/db/voting";
import { MPAvatar } from "@/components/tygodnik/MPAvatar";

const VOTE_LABEL: Record<"YES" | "NO" | "ABSTAIN", "ZA" | "PRZECIW" | "WSTRZ."> = {
  YES: "ZA",
  NO: "PRZECIW",
  ABSTAIN: "WSTRZ.",
};

function actualBg(actual: "YES" | "NO" | "ABSTAIN"): string {
  if (actual === "YES") return "var(--success)";
  if (actual === "NO") return "var(--destructive)";
  return "var(--warning)";
}

export function RebelCard({ rebel, term }: { rebel: Rebel; term: number }) {
  const expectedLabel = VOTE_LABEL[rebel.expected];
  const actualLabel = VOTE_LABEL[rebel.actual];
  const subtitle =
    rebel.district_num != null
      ? `${rebel.club_label} · okręg ${rebel.district_num}${rebel.district_name ? ` (${rebel.district_name})` : ""}`
      : rebel.club_label;

  return (
    <article
      className="relative"
      style={{
        background: "var(--background)",
        padding: "22px 24px",
        border: "1px solid var(--border)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className="flex items-center gap-2 font-medium"
          style={{
            fontSize: 11,
            color: "var(--muted-foreground)",
            marginBottom: 10,
          }}
        >
          <span>
            <span style={{ color: "var(--destructive)" }}>● </span>
            inaczej niż większość klubu
          </span>
        </div>
        {rebel.photo_url && (
          <MPAvatar
            name={rebel.name}
            photoUrl={rebel.photo_url}
            size={32}
            withClubBadge={false}
          />
        )}
      </div>

      <h3
        className=""
        style={{
          fontSize: 22,
          fontWeight: 500,
          margin: "0 0 8px",
          lineHeight: 1.15,
        }}
      >
        <Link
          href={`/posel/${term}/${rebel.mp_id}`}
          className="hover:underline"
          style={{ color: "var(--foreground)", textDecoration: "none" }}
        >
          {rebel.name}
        </Link>
      </h3>

      <div
        className="font-sans"
        style={{
          fontSize: 12,
          color: "var(--muted-foreground)",
          marginBottom: 14,
        }}
      >
        {subtitle}
      </div>

      <div
        className="flex items-center font-mono"
        style={{ gap: 8, fontSize: 11 }}
      >
        <span
          style={{
            padding: "3px 8px",
            background: "var(--muted)",
            color: "var(--muted-foreground)",
            textDecoration: "line-through",
          }}
        >
          większość klubu: {expectedLabel}
        </span>
        <span style={{ color: "var(--destructive)" }}>→</span>
        <span
          style={{
            padding: "3px 8px",
            background: actualBg(rebel.actual),
            color: "var(--background)",
            fontWeight: 600,
          }}
        >
          głos: {actualLabel}
        </span>
      </div>

    </article>
  );
}
