import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getCommittee,
  getCommitteeMembers,
  committeeTypeLabel,
  type CommitteeMember,
} from "@/lib/db/committees";
import { MPCardGrid } from "@/components/posel/MPCardGrid";
import { PageHeading } from "@/components/chrome/PageHeading";
import { NotFoundPage } from "@/components/chrome/NotFoundPage";


function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pl-PL", { day: "2-digit", month: "long", year: "numeric" });
}

const RANK_LABEL: Record<number, string> = {
  0: "Przewodniczący",
  1: "Zastępcy przewodniczącego",
  2: "Sekretarze",
  3: "Członkowie",
};

export default async function KomisjaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const id = Number(raw);
  if (!Number.isFinite(id) || id <= 0) notFound();

  let committee: Awaited<ReturnType<typeof getCommittee>> = null;
  let members: CommitteeMember[] = [];
  try {
    committee = await getCommittee(id);
    if (committee) members = await getCommitteeMembers(committee.id);
  } catch (err) {
    console.error("[/komisja/[id]] load failed", { id, err });
    return (
      <NotFoundPage
        entity="Komisja"
        gender="f"
        id={id}
        message="Nie udało się załadować komisji. Spróbuj odświeżyć stronę."
        backLink={{ href: "/komisja", label: "Wróć do listy komisji →" }}
      />
    );
  }
  if (!committee) notFound();

  const grouped = new Map<number, CommitteeMember[]>();
  for (const m of members) {
    const arr = grouped.get(m.rank) ?? [];
    arr.push(m);
    grouped.set(m.rank, arr);
  }
  const ranks = Array.from(grouped.keys()).sort((a, b) => a - b);

  return (
    <main className="bg-background text-foreground font-serif pb-20">
      <section className="border-b border-rule">
        <div className="max-w-[1100px] mx-auto px-4 md:px-8 lg:px-14 pt-7 md:pt-9 pb-6">
          <div className="font-sans text-[11px] tracking-[0.16em] uppercase mb-3 flex items-center gap-3 flex-wrap">
            <Link href="/komisja" className="text-muted-foreground hover:text-destructive">
              ‹ Komisje
            </Link>
            <span className="text-border">/</span>
            <span className="text-destructive">{committeeTypeLabel(committee.type)}</span>
            <span className="text-border">·</span>
            <span className="font-mono text-muted-foreground">{committee.code}</span>
          </div>

          <PageHeading className="mb-3">
            {committee.name}
          </PageHeading>

          {committee.scope && (
            <p className="font-serif italic text-[15px] text-secondary-foreground m-0 max-w-[760px] leading-relaxed">
              {committee.scope}
            </p>
          )}
        </div>
      </section>

      <div className="max-w-[1100px] mx-auto px-4 md:px-8 lg:px-14 grid grid-cols-2 md:grid-cols-4 gap-x-4 md:gap-x-6 border-b border-border">
        <Tile k="Skład" v={String(members.length)} sub={members.length === 1 ? "członek" : "członków"} pos={0} />
        <Tile k="Powołana" v={formatDate(committee.appointmentDate)} sub="data powołania" pos={1} />
        <Tile k="Skład z dnia" v={formatDate(committee.compositionDate)} sub="ostatnia aktualizacja" pos={2} />
        <Tile k="Telefon" v={committee.phone ? "✓" : "—"} sub={committee.phone ?? "brak danych"} pos={3} />
      </div>

      <div className="max-w-[1100px] mx-auto px-4 md:px-8 lg:px-14 pt-8 md:pt-10">
        <section>
          <div className="font-sans text-[11px] tracking-[0.16em] uppercase text-destructive mb-5">
            ✶ Skład komisji
          </div>

          {members.length === 0 ? (
            <p className="font-serif italic text-muted-foreground">
              Skład zostanie uzupełniony.
            </p>
          ) : (
            <div className="space-y-8">
              {ranks.map((rank) => {
                const group = grouped.get(rank) ?? [];
                if (group.length === 0) return null;
                return (
                  <div key={rank}>
                    <div className="font-sans text-[10.5px] tracking-[0.14em] uppercase text-muted-foreground mb-3">
                      {RANK_LABEL[rank] ?? "Członkowie"} · {group.length}
                    </div>
                    <ul className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                      {group.map((m) => (
                        <li key={m.mpId}>
                          <MPCardGrid
                            mpId={m.mpId}
                            name={m.firstLastName}
                            photoUrl={m.photoUrl}
                            clubRef={m.clubShort}
                            district={m.districtNum}
                            subline={m.function}
                            photoSize="sm"
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="mt-12 border-t border-border pt-6">
          <p className="font-serif italic text-[13px] text-muted-foreground m-0 max-w-[760px]">
            Lista posiedzeń komisji — moduł w przygotowaniu, na razie zobacz{" "}
            <Link href="/atlas" className="underline decoration-dotted underline-offset-4 hover:text-destructive">
              Atlas Sejmu
            </Link>
            .
          </p>
        </section>
      </div>
    </main>
  );
}

function Tile({ k, v, sub, pos }: { k: string; v: string; sub: string; pos: number }) {
  return (
    <div
      className="py-4"
      style={{
        borderRight: pos < 3 ? "1px solid var(--border)" : undefined,
        borderBottom: pos < 2 ? "1px solid var(--border)" : undefined,
        paddingRight: pos < 3 ? 16 : 0,
      }}
    >
      <div className="font-sans text-[10px] text-muted-foreground uppercase tracking-[0.14em] mb-1">{k}</div>
      <div
        className="font-serif font-medium leading-none mb-1 tracking-[-0.02em]"
        style={{ fontSize: "clamp(1.125rem, 2.4vw, 1.5rem)" }}
      >
        {v}
      </div>
      <div className="font-sans text-[10.5px] text-muted-foreground leading-tight truncate">{sub}</div>
    </div>
  );
}
