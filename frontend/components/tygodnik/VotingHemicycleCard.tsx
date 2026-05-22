import type { ClubTallyRow } from "@/lib/db/voting";
import { CitationText } from "@/components/tygodnik/CitationLink";
import { NumberedRow } from "@/components/tygodnik/NumberedRow";
import {
  CardTitle,
  DotyczyCallout,
  FooterLinks,
  StageBadge,
  PrintRef,
  VoteResultCard,
  type VoteResultKind,
  type FooterLink,
} from "@/components/tygodnik/atoms";
import type { MotionPolarity } from "@/lib/promiseAlignment";

// Polish motion-polarity labels for the kicker stage badge — mirrors the
// mapping in BriefList.tsx but kept local to avoid a circular import.
const MOTION_BADGE_LABEL: Record<string, string> = {
  procedural: "WNIOSEK FORMALNY",
  amendment: "POPRAWKA",
  reject: "WNIOSEK O ODRZUCENIE",
  minority: "WNIOSEK MNIEJSZOŚCI",
};

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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function deriveVerdict(
  yes: number,
  no: number,
  motionPolarity?: MotionPolarity | null,
): VoteResultKind {
  const passed = yes > no;
  if (motionPolarity === "procedural") {
    return passed ? "WNIOSEK PRZYJĘTY" : "WNIOSEK ODRZUCONY";
  }
  return passed ? "PRZYJĘTA" : "ODRZUCONA";
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

  // Title uses CardTitle `href` (same primitive as print ItemView). Footer keeps
  // only non-duplicate actions: druk link is the title when a print is linked.
  const titleHref = linkedPrint
    ? `/proces/${voting.term}/${linkedPrint.number}`
    : `/glosowanie/${voting.voting_id}`;

  const links: FooterLink[] = linkedPrint
    ? [{ href: `/glosowanie/${voting.voting_id}`, label: "wyniki głosowania", primary: true }]
    : [];

  const motionLabel = voting.motion_polarity
    ? MOTION_BADGE_LABEL[voting.motion_polarity]
    : null;
  const kicker = (
    <div className="flex gap-1.5 flex-wrap items-center">
      <StageBadge>GŁOSOWANIE</StageBadge>
      {motionLabel && <StageBadge>{motionLabel}</StageBadge>}
      {linkedPrint && <PrintRef term={voting.term} number={linkedPrint.number} />}
    </div>
  );

  const voteCard = (
    <VoteResultCard
      time={formatTime(voting.date)}
      result={deriveVerdict(voting.yes, voting.no, voting.motion_polarity ?? null)}
      yes={voting.yes}
      no={voting.no}
      abstain={voting.abstain}
      absent={voting.not_participating}
      margin={Math.abs(voting.yes - voting.no)}
      motionPolarity={voting.motion_polarity ?? null}
      clubTally={clubs}
      detailHref={`/glosowanie/${voting.voting_id}`}
    />
  );

  return (
    <NumberedRow
      idx={idx}
      indexSize={64}
      indexColor="var(--destructive)"
      pad="loose"
      kicker={kicker}
      meta={
        <>
          <div>głos. <span className="text-foreground">{voting.voting_number}</span></div>
          <div>{formatDate(voting.date)}</div>
        </>
      }
      rightCard={voteCard}
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

      <FooterLinks links={links} />
    </NumberedRow>
  );
}
