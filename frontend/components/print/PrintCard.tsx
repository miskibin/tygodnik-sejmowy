import Link from "next/link";

// Canonical Sejm-druk row, used in two thin variants. The richer tygodnik
// "feed" variant (ItemView in BriefList) and the page-level druk hero are
// intentionally NOT folded in — they carry entity-specific richness
// (persona pills, severity chips, citizen action) or page composition.
//
// Server component.

type Common = {
  id: number;
  term: number;
  number: string;
  shortTitle?: string | null;
  title?: string | null;
  impactPunch?: string | null;
  // Optional short summary (mostly used on /szukaj results to show a
  // single-line excerpt below the headline).
  summaryPlain?: string | null;
  changeDate?: string | null;
};

export type PrintCardProps =
  | (Common & {
      variant: "hit";
      // Hit context — kept optional, surfaced as the right-side mono
      // caption next to the kicker band.
      hitMeta?: string | null;
    })
  | (Common & {
      variant: "row";
      opinionSource?: string | null;
      opinionSourceShort?: string | null;
      opinionSourceLabel?: string | null;
    });

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

export function PrintCard(props: PrintCardProps) {
  if (props.variant === "hit") return <HitVariant {...props} />;
  return <RowVariant {...props} />;
}

function HitVariant(props: Extract<PrintCardProps, { variant: "hit" }>) {
  const headline = props.shortTitle || props.title || `druk ${props.number}`;
  const sub = props.impactPunch || props.summaryPlain;
  return (
    <Link
      href={`/proces/${props.term}/${props.number}`}
      className="block py-5 px-1 border-b border-border hover:bg-muted"
    >
      <div className="flex items-baseline justify-between gap-4 mb-2 font-sans text-[10px] tracking-[0.18em] uppercase">
        <span className="text-destructive">
          Druk · {props.term}/{props.number}
        </span>
        <span className="font-mono text-muted-foreground tracking-normal">
          {props.hitMeta ?? formatDate(props.changeDate)}
        </span>
      </div>
      <div className="font-serif text-[19px] font-medium leading-snug tracking-[-0.005em] mb-1">
        {headline}
      </div>
      {sub && (
        <div className="font-serif italic text-[14px] text-secondary-foreground leading-snug">
          {sub}
        </div>
      )}
    </Link>
  );
}

function RowVariant(props: Extract<PrintCardProps, { variant: "row" }>) {
  const headline = props.shortTitle || props.title || `druk ${props.number}`;
  return (
    <li className="py-2.5 border-b border-dotted border-border flex items-baseline gap-3 flex-wrap">
      {props.opinionSource && props.opinionSourceShort && (
        <span
          className="font-mono text-[10px] tracking-wide px-1.5 py-0.5 border"
          style={{
            borderColor: "var(--rule)",
            background: "var(--muted)",
            color: "var(--foreground)",
          }}
          title={props.opinionSourceLabel ?? props.opinionSource}
        >
          {props.opinionSourceShort}
        </span>
      )}
      <a
        href={`/proces/${props.term}/${encodeURIComponent(props.number)}`}
        className="text-foreground hover:text-destructive underline decoration-dotted underline-offset-4 flex-1 leading-snug"
      >
        {headline}
      </a>
      <span className="font-mono text-[11px] text-muted-foreground">
        {props.number}
      </span>
    </li>
  );
}
