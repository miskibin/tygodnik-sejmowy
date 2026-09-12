import Link from "next/link";
import { voteMeaning } from "@/lib/weekly-stories";
import { documentCategoryLabel, sponsorAuthorityLabel } from "@/lib/labels";
import type { PrintDetail, ProcessOutcome, LinkedVoting } from "@/lib/db/prints";

function formatDateShort(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// Split the title at the first " oraz " / " o zmianie " / em-dash so we can
// emphasize the "second clause" in italic red, mirroring the mockup hero.
function splitTitle(title: string): { head: string; tail: string | null } {
  const m = title.match(/^(.+?)\s+(oraz\s+.+|—\s+.+|–\s+.+)$/i);
  if (m) return { head: m[1].trim(), tail: m[2].trim() };
  return { head: title, tail: null };
}

function statusLabel(p: PrintDetail, outcome: ProcessOutcome | null): string | null {
  if (outcome?.act?.publishedAt) return outcome.act.eliId.startsWith("MP/") ? "Opublikowano w Monitorze Polskim" : "Opublikowano w Dz.U.";
  const stageType = p.currentStageType;
  if (!stageType) return outcome?.passed ? "Uchwalono — brak potwierdzonej publikacji w danych" : null;
  if (stageType === "Withdrawn") return "Wycofany";
  if (stageType === "Rejected") return "Odrzucony";
  if (stageType === "End") return "Zakończono";
  if (stageType === "PresidentSignature") return "Podpisano przez Prezydenta";
  if (stageType === "ToPresident") return "Przekazano Prezydentowi";
  if (stageType === "SenatePosition") return "Stanowisko Senatu";
  if (stageType === "SenateAmendments") return "Rozpatrywanie poprawek Senatu";
  if (stageType === "CommitteeWork" || stageType === "CommitteeReport") return "W komisji";
  if (stageType === "SejmReading" || stageType === "Voting") return "W Sejmie";
  return null;
}

export function Hero({
  print,
  outcome,
  mainVoting,
}: {
  print: PrintDetail;
  outcome: ProcessOutcome | null;
  mainVoting: LinkedVoting | null;
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

  const status = statusLabel(print, outcome);
  const sejmUrl = `https://www.sejm.gov.pl/Sejm${print.term}.nsf/druk.xsp?nr=${encodeURIComponent(print.number)}`;

  const v = mainVoting;
  const decision = v ? voteMeaning({
    id: v.votingId, voting_number: v.votingNumber, title: v.title,
    date: v.date, topic: v.topic ?? null, description: v.description ?? null,
    short_title: null, yes: v.yes, no: v.no, abstain: v.abstain,
    majority_votes: v.majorityVotes, motion_polarity: v.motionPolarity, kind: v.kind,
  }) : null;
  const showCategory = !headline.toLocaleLowerCase("pl").includes(category.toLocaleLowerCase("pl"));
  return (
    <header className="border-b border-border pb-7 max-w-[1000px]">
      <h1 className="font-medium text-foreground m-0 text-[30px] sm:text-[42px] lg:text-[50px] leading-[1.15] tracking-[-.025em] text-pretty">
        {head}{tail && <em className="block mt-2 text-destructive font-normal text-[.8em]">{tail}</em>}
      </h1>
      <div className="mt-5 flex flex-wrap items-baseline gap-x-5 gap-y-2 text-[13px] text-muted-foreground">
        <span>Druk <strong className="text-foreground font-medium">{print.number}</strong></span>
        {print.documentDate && <time dateTime={print.documentDate}>Dokument z {formatDateShort(print.documentDate)}</time>}
        {showCategory && <span>{category}</span>}
      </div>
      {decision && v ? <p className="mt-5 text-[14px] leading-relaxed">
        <Link href={`/glosowanie/${v.votingId}`} className="font-medium hover:underline">{decision.label}</Link>
        <time dateTime={v.date} className="block text-[12px] text-muted-foreground mt-1">Głosowanie z {formatDateShort(v.date)}</time>
      </p> : status && <p className="mt-4 text-[14px] font-medium">{status}</p>}
      {decision && status && outcome?.act?.publishedAt && <p className="mt-3 text-[14px]">{status}</p>}
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[13px]">
        <a href={sejmUrl} target="_blank" rel="noopener noreferrer" className="underline decoration-border underline-offset-4">Dokument w Sejmie ↗</a>
        {print.parentNumber && <a href={`/proces/${print.term}/${encodeURIComponent(print.parentNumber)}`} className="underline decoration-border underline-offset-4">Dotyczy druku {print.parentNumber}</a>}
        {initiative ? <span className="text-muted-foreground">Inicjatywa {initiative}</span> : sponsor && <span className="text-muted-foreground">{sponsor}</span>}
      </div>
    </header>
  );
}
