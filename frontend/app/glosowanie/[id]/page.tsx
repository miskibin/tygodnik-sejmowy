import { notFound } from "next/navigation";
import { getVotingPageData } from "@/lib/db/voting";
import { VotingHero } from "@/components/voting/VotingHero";
import { VotingMeaning } from "@/components/voting/VotingMeaning";
import { ClubBreakdownTable } from "@/components/voting/ClubBreakdownTable";
import { RebelGrid } from "@/components/voting/RebelGrid";
import { FullRosterGrid } from "@/components/voting/FullRosterGrid";
import WhatsNextTimeline from "@/components/voting/WhatsNextTimeline";
import VotingSources from "@/components/voting/VotingSources";
import { PageBreadcrumb } from "@/components/chrome/PageBreadcrumb";


export default async function VotingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  // Database failures reach the retryable error boundary; only absent rows are 404s.
  const data = await getVotingPageData(id);
  if (!data) notFound();

  const { header, passed, clubs, seats, rebels, linkedPrint, predictedStages, promiseLink, relatedVotings } = data;
  const total = header.yes + header.no + header.abstain + header.not_participating;

  return (
    <main className="bg-background text-foreground min-h-screen">
      <div className="max-w-[1240px] mx-auto px-4 md:px-8 lg:px-14 pt-6">
        <PageBreadcrumb
          items={[
            { label: "Głosowania", href: "/glosowanie" },
            { label: header.title || `Głosowanie nr ${id}` },
          ]}
          subtitle={`Posiedzenie ${header.sitting} · ${new Date(header.date).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" })}`}
        />
      </div>
      <VotingHero data={data} />
      <VotingMeaning linkedPrint={linkedPrint} clubs={clubs} passed={passed} />
      <ClubBreakdownTable
        clubs={clubs}
        header={header}
        shortTitle={linkedPrint?.short_title ?? null}
        printNumber={linkedPrint?.number ?? null}
      />
      <RebelGrid rebels={rebels} term={header.term} />
      <FullRosterGrid
        seats={seats}
        total={total}
        counts={{
          yes: header.yes,
          no: header.no,
          abstain: header.abstain,
          not_participating: header.not_participating,
        }}
        term={header.term}
      />
      <WhatsNextTimeline stages={predictedStages} promiseLink={promiseLink} passed={passed} motionPolarity={header.motion_polarity} />
      <VotingSources
        header={header}
        linkedPrint={linkedPrint}
        relatedVotings={relatedVotings}
        promiseLink={promiseLink}
      />
    </main>
  );
}
