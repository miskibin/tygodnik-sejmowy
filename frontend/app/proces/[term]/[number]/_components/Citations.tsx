import Link from "next/link";
import { MPAvatar } from "@/components/tygodnik/MPAvatar";
import type { ProcessCitation } from "@/lib/db/statements";

function SectionHead({ title, subtitle }: { title: string; subtitle?: string | null }) {
  return (
    <div className="mb-5 flex items-baseline gap-4 border-b border-border pb-3">
      <h2
        className="font-serif font-medium text-foreground m-0"
        style={{ fontSize: 22, lineHeight: 1, letterSpacing: "-0.015em" }}
      >
        {title}
      </h2>
      {subtitle && (
        <span className="font-sans text-[11.5px] text-muted-foreground ml-auto">
          {subtitle}
        </span>
      )}
    </div>
  );
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("pl-PL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function Citations({ items }: { items: ProcessCitation[] }) {
  if (items.length === 0) return null;
  const sittingNum = items[0].proceedingNumber;

  return (
    <section className="py-12 border-b border-border">
      <div className="max-w-[1280px] mx-auto">
        <SectionHead
          title="Cytaty z sali plenarnej"
          subtitle={
            sittingNum
              ? `Wybrane wypowiedzi · posiedzenie nr ${sittingNum}`
              : "Wybrane wypowiedzi"
          }
        />

        <div className="grid gap-6 md:gap-8 grid-cols-1 md:grid-cols-2">
          {items.map((c) => (
            <CitationCard key={c.id} c={c} />
          ))}
        </div>

        <div className="mt-5 font-sans text-[11px] text-muted-foreground italic">
          Próbka spośród najbardziej cytowalnych wypowiedzi — odśwież stronę, by
          zobaczyć inne.
        </div>
      </div>
    </section>
  );
}

function CitationCard({ c }: { c: ProcessCitation }) {
  const dateLabel = formatDate(c.date);
  const role = c.function?.trim();
  const hideRole =
    !role ||
    role.localeCompare("poseł", "pl", { sensitivity: "accent" }) === 0;

  return (
    <article className="flex flex-col gap-3 min-w-0">
      <div className="flex items-baseline gap-3 min-w-0">
        <MPAvatar
          mpId={c.mpId}
          name={c.speakerName}
          photoUrl={c.photoUrl}
          klub={c.clubRef}
          size={40}
          shape="squircle"
        />
        <span className="ml-auto font-mono uppercase text-muted-foreground shrink-0"
          style={{ fontSize: 10, letterSpacing: "0.12em" }}
        >
          {dateLabel}
        </span>
      </div>
      {!hideRole && (
        <div
          className="font-sans text-muted-foreground"
          style={{ fontSize: 11, letterSpacing: "0.02em" }}
        >
          {role}
        </div>
      )}
      <Link
        href={`/mowa/${c.id}`}
        className="group block no-underline"
        aria-label={`Otwórz pełną wypowiedź — ${c.speakerName ?? "wypowiedź sejmowa"}`}
      >
        <blockquote
          className="font-serif italic m-0 relative text-foreground group-hover:text-foreground/90"
          style={{
            fontSize: 18,
            lineHeight: 1.4,
            padding: "6px 0 6px 22px",
            borderLeft: "3px solid var(--destructive)",
            textWrap: "pretty" as never,
          }}
        >
          <span
            aria-hidden
            className="font-serif text-destructive absolute"
            style={{
              fontSize: 44,
              lineHeight: 0.8,
              left: 8,
              top: 2,
              opacity: 0.18,
              fontStyle: "normal",
            }}
          >
            “
          </span>
          {c.viralQuote}
        </blockquote>
      </Link>
      {c.viralReason && (
        <div
          className="font-sans text-muted-foreground italic"
          style={{ fontSize: 12, lineHeight: 1.45 }}
        >
          {c.viralReason}
        </div>
      )}
    </article>
  );
}
