import Link from "next/link";
import { getCommitteeList, committeeTypeLabel, type CommitteeListItem } from "@/lib/db/committees";
import { PageHeading } from "@/components/chrome/PageHeading";


function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function CommitteeRow({ c }: { c: CommitteeListItem }) {
  return (
    <Link
      href={`/komisja/${c.id}`}
      className="block border border-border hover:border-destructive bg-background transition-colors px-4 py-3"
    >
      <div className="grid items-baseline gap-x-4 gap-y-1 grid-cols-[64px_1fr_auto] md:grid-cols-[80px_1fr_140px_120px]">
        <div className="font-mono text-[11px] tracking-wide text-destructive uppercase">{c.code}</div>
        <div className="font-serif text-[15px] leading-snug min-w-0">{c.name}</div>
        <div className="font-sans text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground hidden md:block">
          {committeeTypeLabel(c.type)}
        </div>
        <div className="font-mono text-[11px] text-muted-foreground text-right">
          {c.memberCount > 0 ? `${c.memberCount} czł.` : "—"}
          {c.appointmentDate && (
            <span className="hidden md:inline">
              {" · "}
              {formatDate(c.appointmentDate)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export default async function KomisjaIndexPage() {
  const committees = await getCommitteeList();

  const standingCount = committees.filter((c) => c.type === "STANDING").length;
  const extraCount = committees.filter((c) => c.type === "EXTRAORDINARY" || c.type === "INVESTIGATIVE").length;

  const grouped: Record<string, CommitteeListItem[]> = {
    STANDING: [],
    EXTRAORDINARY: [],
    INVESTIGATIVE: [],
    OTHER: [],
  };
  for (const c of committees) {
    if (c.type === "STANDING") grouped.STANDING.push(c);
    else if (c.type === "EXTRAORDINARY") grouped.EXTRAORDINARY.push(c);
    else if (c.type === "INVESTIGATIVE") grouped.INVESTIGATIVE.push(c);
    else grouped.OTHER.push(c);
  }

  return (
    <main className="bg-background text-foreground font-serif pb-20">
      <section className="border-b border-rule">
        <div className="max-w-[1100px] mx-auto px-4 md:px-8 lg:px-14 pt-8 pb-5">
          <div className="flex items-baseline justify-between gap-4 flex-wrap">
            <PageHeading>
              Komisje <span className="italic text-destructive">sejmowe</span>
            </PageHeading>
            <p className="font-serif italic text-[12.5px] text-secondary-foreground max-w-[460px] m-0 leading-snug">
              {standingCount} komisji stałych i {extraCount} nadzwyczajnych w X kadencji. Klucz do tego, kto naprawdę pisze ustawy.
            </p>
          </div>
        </div>
      </section>

      <div className="max-w-[1100px] mx-auto px-4 md:px-8 lg:px-14 pt-8 md:pt-10 space-y-10">
        {grouped.STANDING.length > 0 && (
          <section>
            <div className="font-sans text-[11px] tracking-[0.16em] uppercase text-destructive mb-4">
              ✶ Komisje stałe · {grouped.STANDING.length}
            </div>
            <ul className="grid gap-2">
              {grouped.STANDING.map((c) => (
                <li key={c.id}>
                  <CommitteeRow c={c} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {grouped.EXTRAORDINARY.length > 0 && (
          <section>
            <div className="font-sans text-[11px] tracking-[0.16em] uppercase text-destructive mb-4">
              ✶ Komisje nadzwyczajne · {grouped.EXTRAORDINARY.length}
            </div>
            <ul className="grid gap-2">
              {grouped.EXTRAORDINARY.map((c) => (
                <li key={c.id}>
                  <CommitteeRow c={c} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {grouped.INVESTIGATIVE.length > 0 && (
          <section>
            <div className="font-sans text-[11px] tracking-[0.16em] uppercase text-destructive mb-4">
              ✶ Komisje śledcze · {grouped.INVESTIGATIVE.length}
            </div>
            <ul className="grid gap-2">
              {grouped.INVESTIGATIVE.map((c) => (
                <li key={c.id}>
                  <CommitteeRow c={c} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {grouped.OTHER.length > 0 && (
          <section>
            <div className="font-sans text-[11px] tracking-[0.16em] uppercase text-muted-foreground mb-4">
              ✶ Pozostałe · {grouped.OTHER.length}
            </div>
            <ul className="grid gap-2">
              {grouped.OTHER.map((c) => (
                <li key={c.id}>
                  <CommitteeRow c={c} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
