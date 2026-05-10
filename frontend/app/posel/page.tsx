import { getAllActiveMps, getMostActiveRecent } from "@/lib/db/mps";
import { PoselIndexClient } from "./_components/PoselIndexClient";
import { PageHeading } from "@/components/chrome/PageHeading";


export default async function PoselIndexPage() {
  const [mostActive, allMps] = await Promise.all([
    getMostActiveRecent(8),
    getAllActiveMps(),
  ]);

  return (
    <main className="bg-background text-foreground font-serif pb-20">
      <section className="border-b border-rule">
        <div className="max-w-[1100px] mx-auto px-4 md:px-8 lg:px-14 pt-8 pb-5">
          <div className="flex items-baseline justify-between gap-4 flex-wrap">
            <PageHeading>
              Twój <span className="italic text-destructive">poseł</span>
            </PageHeading>
            <p className="font-serif italic text-[12.5px] text-secondary-foreground max-w-[420px] m-0 leading-snug">
              Każde dossier zawiera frekwencję, lojalność klubową, interpelacje i wystąpienia.
            </p>
          </div>
        </div>
      </section>

      <div className="max-w-[1100px] mx-auto px-4 md:px-8 lg:px-14 pt-8 md:pt-10">
        <PoselIndexClient mostActive={mostActive} allMps={allMps} />
      </div>
    </main>
  );
}
