import { notFound } from "next/navigation";
import { getVotingPageData } from "@/lib/db/voting";
import { VotingHero } from "@/components/voting/VotingHero";
import { VotingMeaning } from "@/components/voting/VotingMeaning";
import { ClubBreakdownTable } from "@/components/voting/ClubBreakdownTable";
import { RebelGrid } from "@/components/voting/RebelGrid";
import { FullRosterGrid } from "@/components/voting/FullRosterGrid";
import WhatsNextTimeline from "@/components/voting/WhatsNextTimeline";
import VotingSources from "@/components/voting/VotingSources";
import { NotFoundPage } from "@/components/chrome/NotFoundPage";


export default async function VotingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isFinite(id) || id <= 0) notFound();

  // Fail closed: any DB error → branded 404 instead of Next default page.
  let data: Awaited<ReturnType<typeof getVotingPageData>> = null;
  try {
    data = await getVotingPageData(id);
  } catch (err) {
    console.error("[/glosowanie/[id]] getVotingPageData failed", { id, err });
    return (
      <NotFoundPage
        entity="Głosowanie"
        gender="n"
        id={id}
        message="Nie udało się załadować głosowania. Spróbuj odświeżyć stronę lub wrócić do Tygodnika."
      />
    );
  }
  if (!data) notFound();

  const { header, passed, clubs, seats, rebels, linkedPrint, predictedStages, promiseLink, relatedVotings } = data;
  const total = header.yes + header.no + header.abstain + header.not_participating;

  return (
    <main className="bg-background text-foreground font-serif min-h-screen">
      <VotingHero data={data} />
      <VotingMeaning linkedPrint={linkedPrint} clubs={clubs} passed={passed} />
      <ClubBreakdownTable clubs={clubs} header={header} shortTitle={linkedPrint?.short_title ?? null} />
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
      <WhatsNextTimeline stages={predictedStages} promiseLink={promiseLink} passed={passed} />
      <VotingSources
        header={header}
        linkedPrint={linkedPrint}
        relatedVotings={relatedVotings}
        promiseLink={promiseLink}
      />
    </main>
  );
}
