import Link from "next/link";
import { ClubBadge } from "@/components/clubs/ClubBadge";
import { ToneBadge } from "./ToneBadge";

export type StatementPrintRefLite = {
  printTerm: number;
  printNumber: string;
  shortTitle: string | null;
  source: "agenda_item" | "title_regex";
};

type Common = {
  id: number;
  mpId: number | null;
  speakerName: string | null;
  function?: string | null;
  clubRef?: string | null;
  clubName?: string | null;
  date: string | null;
  proceedingNumber?: number | null;
  dayIdx?: number | null;
  agendaTopic?: string | null;
  processTitle?: string | null;
};

// Discriminated union — feed | inline | hit | related. The `full` page-level
// composition is /mowa/[id] (StatementHero + ViralQuote + FullTranscript)
// and is intentionally NOT a card variant.
export type StatementCardProps =
  | (Common & {
      variant: "feed";
      excerpt: string;
      printRefs?: StatementPrintRefLite[];
      transcriptUrl?: string | null;
    })
  | (Common & {
      variant: "inline";
      excerpt: string;
      rapporteur?: boolean;
      secretary?: boolean;
    })
  | (Common & {
      variant: "hit";
      term: number;
      excerpt: string;
      transcriptUrl?: string | null;
    })
  | (Common & {
      variant: "related";
      tone?: string | null;
      viralQuote?: string | null;
      summaryOneLine?: string | null;
    });

function formatShortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

function formatLongDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("pl-PL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// Strip the "Pkt. NN " ordinal — already present in the agenda derivation;
// the user-facing label should read clean.
function stripPktPrefix(s: string | null | undefined): string | null {
  if (!s) return null;
  return s.replace(/^\s*Pkt\.\s*\d+\s*/i, "").trim() || null;
}

export function StatementCard(props: StatementCardProps) {
  if (props.variant === "feed") return <FeedVariant {...props} />;
  if (props.variant === "inline") return <InlineVariant {...props} />;
  if (props.variant === "hit") return <HitVariant {...props} />;
  return <RelatedVariant {...props} />;
}

function FeedVariant(
  props: Extract<StatementCardProps, { variant: "feed" }>,
) {
  const sittingLine =
    props.proceedingNumber != null && props.dayIdx != null
      ? `Posiedzenie ${props.proceedingNumber}, dzień ${props.dayIdx}`
      : props.proceedingNumber != null
      ? `Posiedzenie ${props.proceedingNumber}`
      : null;
  const agendaTopic = stripPktPrefix(props.agendaTopic);
  const printRefs = props.printRefs ?? [];
  return (
    <article className="grid gap-5 py-5 px-1 border-b border-border md:[grid-template-columns:130px_1fr]">
      <div className="font-mono text-[11px] text-muted-foreground tracking-wide leading-snug">
        <div className="text-secondary-foreground">{formatShortDate(props.date)}</div>
        {sittingLine && <div className="mt-0.5">{sittingLine}</div>}
      </div>
      <div className="min-w-0">
        <div className="font-serif text-[17px] font-medium leading-snug tracking-[-0.005em]">
          {props.mpId != null ? (
            <Link href={`/posel/${props.mpId}`} className="hover:text-destructive">
              {props.speakerName ?? "—"}
            </Link>
          ) : (
            props.speakerName ?? "—"
          )}
          {props.clubRef && (
            <span className="ml-2 align-middle">
              <ClubBadge klub={props.clubRef} tooltip={props.clubName ?? undefined} size="xs" />
            </span>
          )}
        </div>
        {props.function && (
          <div className="font-sans text-[11px] text-muted-foreground mb-1.5 mt-0.5 uppercase tracking-[0.12em]">
            {props.function}
          </div>
        )}
        {agendaTopic && (
          <div className="font-serif text-[12.5px] italic text-secondary-foreground mt-1 mb-0.5 leading-snug">
            <span className="not-italic font-sans text-[10px] uppercase tracking-[0.16em] text-muted-foreground mr-1.5">
              Punkt
            </span>
            {agendaTopic}
          </div>
        )}
        {props.processTitle && props.processTitle !== agendaTopic && (
          <div className="font-serif text-[11.5px] text-muted-foreground leading-snug">
            {props.processTitle}
          </div>
        )}
        <p className="font-serif italic text-[15px] text-foreground leading-snug m-0 mt-1.5">
          {props.excerpt}
        </p>
        {printRefs.length > 0 && (
          <div className="flex gap-1.5 flex-wrap mt-2 font-sans text-[10.5px]">
            {printRefs.slice(0, 6).map((p) => {
              const dim = p.source === "title_regex";
              return (
                <Link
                  key={`${p.printTerm}/${p.printNumber}/${p.source}`}
                  href={`/druk/${p.printTerm}/${p.printNumber}`}
                  className="px-1.5 py-0.5 rounded-sm tracking-wide hover:text-destructive"
                  title={p.shortTitle ?? `druk ${p.printNumber}`}
                  style={{
                    border: `1px solid ${dim ? "var(--border)" : "var(--secondary-foreground)"}`,
                    color: dim ? "var(--muted-foreground)" : "var(--secondary-foreground)",
                    background: "transparent",
                  }}
                >
                  druk {p.printNumber}
                  {p.shortTitle && (
                    <span className="ml-1 opacity-70">
                      · {p.shortTitle.length > 32 ? p.shortTitle.slice(0, 32) + "…" : p.shortTitle}
                    </span>
                  )}
                </Link>
              );
            })}
            {printRefs.length > 6 && (
              <span className="text-muted-foreground py-0.5">+{printRefs.length - 6}</span>
            )}
          </div>
        )}
        <div className="flex gap-4 flex-wrap mt-2.5 font-sans text-[11px]">
          <Link
            href={`/mowa/${props.id}`}
            className="text-destructive underline decoration-dotted underline-offset-4 hover:decoration-solid"
          >
            Czytaj całość →
          </Link>
          {props.transcriptUrl && (
            <a
              href={props.transcriptUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-destructive"
            >
              ↗ Stenogram (sejm.gov.pl)
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

function InlineVariant(
  props: Extract<StatementCardProps, { variant: "inline" }>,
) {
  return (
    <article
      className="grid border-b border-border py-3.5 gap-3"
      style={{ gridTemplateColumns: "76px 1fr" }}
    >
      <div className="pt-0.5">
        <div className="font-mono text-[11px] text-muted-foreground tracking-wide leading-tight">
          {formatShortDate(props.date)}
        </div>
        {props.proceedingNumber != null && (
          <div className="font-mono text-[9.5px] text-border tracking-wide leading-tight mt-0.5">
            pos. {props.proceedingNumber}
          </div>
        )}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-2 mb-1.5">
          {props.rapporteur && (
            <span
              className="font-sans text-[10px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-sm"
              style={{ color: "var(--destructive)", border: "1px solid var(--destructive)" }}
            >
              sprawozdawca
            </span>
          )}
          {props.secretary && (
            <span
              className="font-sans text-[10px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-sm"
              style={{ color: "var(--warning)", border: "1px solid var(--warning)" }}
            >
              sekretarz
            </span>
          )}
          {props.function && !props.rapporteur && !props.secretary && (
            <span className="font-sans text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              {props.function}
            </span>
          )}
        </div>
        <Link
          href={`/mowa/${props.id}`}
          className="font-serif text-[15.5px] leading-snug text-foreground hover:text-destructive block"
        >
          {props.excerpt || "(brak tekstu wystąpienia)"}
        </Link>
      </div>
    </article>
  );
}

function HitVariant(props: Extract<StatementCardProps, { variant: "hit" }>) {
  return (
    <article className="border-b border-border">
      <Link
        href={`/mowa/${props.id}`}
        className="block py-5 px-1 hover:bg-muted"
      >
        <div className="flex items-baseline justify-between gap-4 mb-2 font-sans text-[10px] tracking-[0.18em] uppercase">
          <span className="text-secondary-foreground">
            Wystąpienie · kad. {props.term}
            {props.speakerName ? ` · ${props.speakerName}` : ""}
          </span>
          <span className="font-mono text-muted-foreground tracking-normal">
            {formatShortDate(props.date)}
          </span>
        </div>
        {props.function && (
          <div className="font-sans text-[11px] text-muted-foreground mb-1">{props.function}</div>
        )}
        <div className="font-serif italic text-[15px] text-foreground leading-snug">
          {props.excerpt}
        </div>
      </Link>
      {props.transcriptUrl && (
        <div className="px-1 pb-3 -mt-1">
          <a
            href={props.transcriptUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-sans text-[10.5px] text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-destructive"
          >
            ↗ stenogram (PDF)
          </a>
        </div>
      )}
    </article>
  );
}

function RelatedVariant(
  props: Extract<StatementCardProps, { variant: "related" }>,
) {
  return (
    <li className="border-b border-dotted border-border pb-3">
      <Link
        href={`/mowa/${props.id}`}
        className="block group focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-destructive"
      >
        <div className="flex items-baseline justify-between gap-3 mb-1.5">
          <ToneBadge tone={props.tone ?? null} />
          <span className="font-mono text-[10px] text-muted-foreground">
            {formatLongDate(props.date)}
            {props.proceedingNumber != null && ` · pos. ${props.proceedingNumber}`}
          </span>
        </div>
        {props.viralQuote && (
          <p
            className="font-serif italic text-foreground m-0 leading-snug group-hover:text-destructive transition-colors"
            style={{ fontSize: 16, textWrap: "balance" }}
          >
            „{props.viralQuote}"
          </p>
        )}
        {props.summaryOneLine && (
          <p className="font-sans text-[12px] text-muted-foreground mt-1.5 m-0">
            {props.summaryOneLine}
          </p>
        )}
      </Link>
    </li>
  );
}
