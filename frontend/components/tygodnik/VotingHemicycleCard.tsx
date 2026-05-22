import type { ClubTallyRow } from "@/lib/db/voting";
import { isUnaffiliated } from "@/lib/clubs/filter";
import { ClubBadge } from "@/components/clubs/ClubBadge";
import { CitationText } from "@/components/tygodnik/CitationLink";
import { NumberedRow } from "@/components/tygodnik/NumberedRow";
import {
  CardTitle,
  DotyczyCallout,
  FooterLinks,
  VoteResultBar,
  type FooterLink,
} from "@/components/tygodnik/atoms";
import type { MotionPolarity } from "@/lib/promiseAlignment";

// Standalone vote card — used only for votes whose linked print isn't
// already in the feed (most votes get merged into their print's card via
// BriefList, eliminating duplicates). The hemicycle was removed from the
// feed because it duplicated content with print cards; full hemicycle now
// lives on /proces/[term]/[number] for users who want the visual breakdown.

export type VotingHemicycleData = {
  voting_id: number;
  voting_number: number;
  title: string;
  // Question actually voted on ("wniosek o odrzucenie projektu...", "głosowanie
  // nad całością projektu", etc.). Distinct from `title`, which is the agenda
  // kicker. Surfacing both prevents the procedural-motion-vs-bill-vote
  // confusion (issue #25 follow-up).
  topic?: string | null;
  date: string;
  yes: number;
  no: number;
  abstain: number;
  not_participating: number;
  majority_votes?: number | null;
  motion_polarity?: MotionPolarity | null;
  term: number;
};

const KLUB_LIMIT = 3;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });
}

export function VotingHemicycleCard({
  idx,
  voting,
  clubs,
  linkedPrint,
}: {
  idx: number;
  voting: VotingHemicycleData;
  clubs: ClubTallyRow[];
  linkedPrint: {
    number: string;
    short_title: string | null;
    impact_punch?: string | null;
  } | null;
}) {
  // Title hierarchy: prefer linked print's short_title (plain Polish),
  // else strip the "Pkt. N." agenda prefix from raw voting.title. The raw
  // title (with agenda ref) becomes a small caption below.
  const stripAgendaPrefix = (t: string): string =>
    t.replace(/^Pkt\.\s*\d+\.?\s*/i, "").trim();
  const primaryTitle = linkedPrint?.short_title ?? stripAgendaPrefix(voting.title);
  const agendaCaption = voting.title;

  const topClubs = [...clubs]
    .filter((c) => !isUnaffiliated(c.club_short))
    .filter((c) => c.yes + c.no + c.abstain + c.not_voting > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, KLUB_LIMIT);

  // Title uses CardTitle `href` (same primitive as print ItemView). Footer keeps
  // only non-duplicate actions: druk link is the title when a print is linked.
  const titleHref = linkedPrint
    ? `/proces/${voting.term}/${linkedPrint.number}`
    : `/glosowanie/${voting.voting_id}`;

  const links: FooterLink[] = linkedPrint
    ? [{ href: `/glosowanie/${voting.voting_id}`, label: "wyniki głosowania", primary: true }]
    : [];

  return (
    <NumberedRow
      idx={idx}
      indexSize={64}
      indexColor="var(--destructive)"
      pad="loose"
      meta={
        <>
          <div>głos. <span className="text-foreground">{voting.voting_number}</span></div>
          <div>{formatDate(voting.date)}</div>
        </>
      }
    >
      <CardTitle
        href={titleHref}
        subtitle={
          <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted-foreground">
            {agendaCaption}
          </span>
        }
      >
        {primaryTitle}
      </CardTitle>

      {voting.topic?.trim() && (
        <div
          className="font-serif italic"
          style={{
            fontSize: 13,
            lineHeight: 1.45,
            color: "var(--secondary-foreground)",
            marginBottom: 12,
          }}
        >
          <span
            className="font-mono"
            style={{
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--muted-foreground)",
              marginRight: 8,
              fontStyle: "normal",
            }}
          >
            pytanie:
          </span>
          „{voting.topic.trim()}”.
        </div>
      )}

      {linkedPrint?.impact_punch && (
        <DotyczyCallout>
          “<CitationText term={voting.term}>{linkedPrint.impact_punch}</CitationText>”
        </DotyczyCallout>
      )}

      <VoteResultBar
        result={{
          votingNumber: voting.voting_number,
          yes: voting.yes,
          no: voting.no,
          abstain: voting.abstain,
          notParticipating: voting.not_participating,
          majorityVotes: voting.majority_votes ?? null,
          motionPolarity: voting.motion_polarity ?? null,
        }}
      />

      {topClubs.length > 0 && (
        <div className="font-sans text-[12px] text-muted-foreground mb-3 flex flex-wrap gap-x-4 gap-y-1.5 items-center">
          <span className="font-mono text-[10px] tracking-[0.14em] uppercase">kluby:</span>
          {topClubs.map((c) => {
            const a11y = `${c.club_name}: ${c.yes} za, ${c.no} przeciw`;
            return (
              <span
                key={c.club_short}
                className="inline-flex items-center gap-1.5"
                title={a11y}
                tabIndex={0}
              >
                <ClubBadge klub={c.club_short} tooltip={c.club_name} size="sm" />
                <span aria-hidden style={{ color: "var(--success)" }}>{c.yes}</span>
                <span aria-hidden className="text-muted-foreground">/</span>
                <span aria-hidden style={{ color: "var(--destructive)" }}>{c.no}</span>
                <span className="sr-only">{a11y}</span>
              </span>
            );
          })}
        </div>
      )}

      <FooterLinks links={links} />
    </NumberedRow>
  );
}
