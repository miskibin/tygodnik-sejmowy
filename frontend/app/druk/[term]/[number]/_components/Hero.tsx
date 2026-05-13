import { documentCategoryLabel, sponsorAuthorityLabel } from "@/lib/labels";
import type { PrintDetail, ProcessOutcome } from "@/lib/db/prints";

function formatDateShort(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}

// Split the title at the first " oraz " / " o zmianie " / em-dash so we can
// emphasize the "second clause" in italic red, mirroring the mockup hero.
function splitTitle(title: string): { head: string; tail: string | null } {
  const m = title.match(/^(.+?)\s+(oraz\s+.+|—\s+.+|–\s+.+)$/i);
  if (m) return { head: m[1].trim(), tail: m[2].trim() };
  return { head: title, tail: null };
}

function statusLabel(p: PrintDetail, outcome: ProcessOutcome | null): string {
  if (outcome?.passed && outcome.act) return "Opublikowano w Dz.U.";
  if (outcome?.passed) return "Uchwalono — oczekuje na publikację";
  const stageType = p.currentStageType;
  if (!stageType) return "W toku";
  if (stageType === "Withdrawn") return "Wycofany";
  if (stageType === "Rejected") return "Odrzucony";
  if (stageType === "End") return "Zakończono";
  if (stageType === "PresidentSignature" || stageType === "ToPresident") return "U Prezydenta";
  if (stageType === "SenatePosition" || stageType === "SenateAmendments") return "W Senacie";
  if (stageType === "CommitteeWork" || stageType === "CommitteeReport") return "W komisji";
  if (stageType === "SejmReading" || stageType === "Voting") return "W Sejmie";
  return "W toku";
}

export function Hero({
  print,
  outcome,
}: {
  print: PrintDetail;
  outcome: ProcessOutcome | null;
}) {
  const category = documentCategoryLabel(print.documentCategory) ?? "druk sejmowy";
  const sponsor = sponsorAuthorityLabel(print.sponsorAuthority);
  const initiative = print.sponsorAuthority === "rzad"
    ? "rządowa"
    : print.sponsorAuthority === "prezydent"
    ? "prezydencka"
    : print.sponsorAuthority === "klub_poselski"
    ? "poselska"
    : print.sponsorAuthority === "senat"
    ? "senacka"
    : print.sponsorAuthority === "obywatele"
    ? "obywatelska"
    : null;
  const headline = print.shortTitle?.trim() || print.title?.trim() || `Druk ${print.number}`;
  const { head, tail } = splitTitle(headline);
  const dni = daysSince(print.documentDate);
  const status = statusLabel(print, outcome);
  const sejmUrl = `https://www.sejm.gov.pl/Sejm${print.term}.nsf/druk.xsp?nr=${encodeURIComponent(print.number)}`;

  return (
    <section className="border-b border-border pt-1 pb-8">
      <div className="font-mono text-[11px] tracking-[0.16em] uppercase text-muted-foreground mb-3">
        {category}
        {initiative && <> &nbsp;·&nbsp; inicjatywa {initiative}</>}
        {sponsor && !initiative && <> &nbsp;·&nbsp; {sponsor}</>}
      </div>
      <h1
        className="font-serif font-medium text-foreground m-0 mb-3"
        style={{
          fontSize: "clamp(28px, 4.4vw, 50px)",
          lineHeight: 1.04,
          letterSpacing: "-0.024em",
          textWrap: "balance" as never,
          maxWidth: 1000,
        }}
      >
        {head}
        {tail && (
          <>
            <br />
            <em
              className="text-destructive font-normal not-italic"
              style={{
                fontStyle: "italic",
                fontSize: "clamp(20px, 2.8vw, 30px)",
              }}
            >
              {tail}.
            </em>
          </>
        )}
      </h1>
      <div className="font-sans text-[13px] text-muted-foreground flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span>
          Druk nr <strong className="text-foreground font-medium">{print.number}</strong>
        </span>
        {print.documentDate && (
          <>
            <span aria-hidden>·</span>
            <span>
              wpłynął <strong className="text-foreground font-medium">{formatDateShort(print.documentDate)}</strong>
            </span>
            {dni !== null && (
              <>
                <span aria-hidden>·</span>
                <span>{dni} dni temu</span>
              </>
            )}
          </>
        )}
        <a
          href={sejmUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Otwórz stronę druku w serwisie Sejmu"
          className="text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-destructive"
        >
          ↗ strona druku w Sejmie
        </a>
        <span
          className="ml-auto font-mono text-[11px] uppercase text-destructive"
          style={{ letterSpacing: "0.12em" }}
        >
          ● {status}
        </span>
      </div>
    </section>
  );
}
