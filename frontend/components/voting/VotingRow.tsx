import Link from "next/link";

// Shared dotted-bottom-rule row primitive used by:
//   - /proces/[term]/[number] related-votings list
//   - /posel/[mpId] VotesList ("wszystko" + "wybrane" tabs)
// Layout: date col (mono) → title col (serif) → optional badges (stage/role)
// → numerics (yes/no/abstain) → optional MP-vote pill / verdict pill.
//
// Design decisions:
//   - Whole row is a Link to /glosowanie/{votingId} when href omitted; if a
//     custom href is needed (e.g. external sejm.gov.pl) callers can pass it.
//   - Vote-context rows (posel) get a colored left border keyed off mpVote;
//     "final stage" rows (druk main / posel Voting stage) get an oxblood
//     border + faint red wash to flag the consequential roll-call.
//   - Server component — no client JS. Filter / paginate logic stays in the
//     calling component.

export type VotingRowVote = "YES" | "NO" | "ABSTAIN" | "ABSENT" | "PRESENT";

const VOTE_COLOR: Record<VotingRowVote, string> = {
  YES: "var(--success)",
  NO: "var(--destructive)",
  ABSTAIN: "var(--warning)",
  ABSENT: "var(--muted-foreground)",
  PRESENT: "var(--muted-foreground)",
};

const VOTE_SHORT: Record<VotingRowVote, string> = {
  YES: "ZA",
  NO: "PRZ",
  ABSTAIN: "WSTRZ",
  ABSENT: "NIEOB",
  PRESENT: "OBEC",
};

export type VotingRowProps = {
  votingId: number;
  date: string | null;
  title: string;
  // Tooltip on the headline link (e.g. full process title when print short_title is shown).
  titleTooltip?: string;
  // Raw "Pkt. N..." caption from voting.title; rendered below the title in mono.
  agendaCaption?: string | null;
  yes: number;
  no: number;
  abstain: number;
  notParticipating?: number;
  // Optional context label (stage/role) — small uppercase pill before numerics.
  badge?: { label: string; tooltip?: string } | null;
  // Optional MP-vote pill (posel context).
  mpVote?: VotingRowVote | null;
  // Optional verdict pill (druk context: "przyjęte" / "odrzuc.").
  verdict?: { label: string; passed: boolean } | null;
  // Optional dissent flag (posel "wbrew klub.").
  dissent?: { tooltip?: string } | null;
  // True when this is the consequential final voting — oxblood left border + wash.
  isFinal?: boolean;
  // External href override (e.g. sejm.gov.pl). Defaults to /glosowanie/{votingId}.
  href?: string;
  // External link target hint — adds rel/target attrs when true.
  external?: boolean;
};

function formatShortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

export function VotingRow({
  votingId,
  date,
  title,
  titleTooltip,
  agendaCaption,
  yes,
  no,
  abstain,
  badge,
  mpVote,
  verdict,
  dissent,
  isFinal = false,
  href,
  external = false,
}: VotingRowProps) {
  // Left-edge color: mpVote color when provided, else oxblood for final rows.
  const leftBorder = mpVote
    ? VOTE_COLOR[mpVote]
    : isFinal
      ? "var(--destructive)"
      : "transparent";
  const wash = isFinal
    ? "color-mix(in srgb, var(--destructive) 4%, transparent)"
    : "transparent";

  const linkHref = href ?? `/glosowanie/${votingId}`;
  const linkExtras = external
    ? { target: "_blank" as const, rel: "noopener noreferrer" }
    : {};

  return (
    <li
      className="flex items-start gap-3 py-2.5 px-2 border-l-2"
      style={{
        borderLeftColor: leftBorder,
        borderBottom: "1px dotted var(--border)",
        background: wash,
      }}
    >
      <span className="font-mono text-[11px] text-muted-foreground tracking-wide w-[58px] shrink-0 pt-[2px]">
        {formatShortDate(date)}
      </span>

      <div className="min-w-0 flex-1">
        <Link
          href={linkHref}
          {...linkExtras}
          className="block font-serif text-[14px] leading-snug hover:text-destructive"
          style={{
            color: "var(--foreground)",
            fontWeight: isFinal ? 600 : 400,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
          title={titleTooltip ?? title}
        >
          {title}
        </Link>
        {agendaCaption && (
          <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted-foreground mt-0.5 truncate">
            {agendaCaption}
          </div>
        )}
      </div>

      {badge && (
        <span
          className="font-sans text-[9.5px] uppercase tracking-[0.12em] px-2 py-0.5 rounded-sm shrink-0 whitespace-nowrap"
          style={{
            color: isFinal ? "var(--destructive)" : "var(--muted-foreground)",
            border: `1px solid ${isFinal ? "var(--destructive)" : "var(--border)"}`,
            background: "transparent",
            fontWeight: isFinal ? 600 : 400,
          }}
          title={badge.tooltip ?? ""}
        >
          {badge.label}
        </span>
      )}

      <span
        className="font-mono text-[11px] tabular-nums shrink-0 whitespace-nowrap pt-[2px]"
        title={`Za / Przeciw / Wstrz.`}
      >
        <span style={{ color: "var(--success)" }}>{yes}</span>
        <span className="text-muted-foreground"> / </span>
        <span style={{ color: "var(--destructive)" }}>{no}</span>
        <span className="text-muted-foreground"> / </span>
        <span className="text-muted-foreground">{abstain}</span>
      </span>

      {mpVote && (
        <span
          className="font-sans text-[10.5px] uppercase tracking-[0.12em] px-2 py-0.5 rounded-sm shrink-0 w-[54px] text-center"
          style={{
            color: VOTE_COLOR[mpVote],
            border: `1px solid ${VOTE_COLOR[mpVote]}`,
            background: "transparent",
          }}
        >
          {VOTE_SHORT[mpVote]}
        </span>
      )}

      {verdict && (
        <span
          className="font-sans text-[10px] uppercase tracking-[0.12em] px-2 py-0.5 rounded-sm shrink-0 w-[64px] text-center"
          style={{
            color: verdict.passed ? "var(--success)" : "var(--destructive)",
            border: `1px solid ${verdict.passed ? "var(--success)" : "var(--destructive)"}`,
          }}
        >
          {verdict.label}
        </span>
      )}

      {dissent && (
        <span
          className="font-mono text-[10px] tracking-wide shrink-0 pt-[2px]"
          style={{ color: "var(--destructive)" }}
          title={dissent.tooltip ?? ""}
        >
          ✕ wbrew klub.
        </span>
      )}
    </li>
  );
}
