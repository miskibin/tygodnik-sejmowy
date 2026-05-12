import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getCommittee,
  getCommitteeMembers,
  getCommitteeSittings,
  getCommitteeLinkedPrints,
  getSubcommittees,
  parseAgendaHtml,
  committeeTypeLabel,
  type CommitteeMember,
  type CommitteeSitting,
  type LinkedPrint,
  type CommitteeListItem,
} from "@/lib/db/committees";
import { MPCardGrid } from "@/components/posel/MPCardGrid";
import { PageBreadcrumb } from "@/components/chrome/PageBreadcrumb";
import { NotFoundPage } from "@/components/chrome/NotFoundPage";
import { SittingCard } from "@/components/komisja/SittingCard";
import { formatRelativePl, pluralPl } from "@/lib/format/relative-pl";

const RANK_LABEL: Record<number, string> = {
  0: "Przewodniczący",
  1: "Zastępcy przewodniczącego",
  2: "Sekretarze",
  3: "Członkowie",
};

const STATUS_LABEL: Record<string, string> = {
  FINISHED: "zakończone",
  ONGOING: "trwa",
  PLANNED: "planowane",
};

const STATUS_CLASS: Record<string, string> = {
  FINISHED: "text-muted-foreground border-border",
  ONGOING: "text-destructive border-destructive",
  PLANNED: "text-foreground border-foreground/40",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pl-PL", { day: "2-digit", month: "long", year: "numeric" });
}

function formatShortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default async function KomisjaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const id = Number(raw);
  if (!Number.isFinite(id) || id <= 0) notFound();

  let committee: Awaited<ReturnType<typeof getCommittee>> = null;
  let members: CommitteeMember[] = [];
  let sittings: CommitteeSitting[] = [];
  let prints: LinkedPrint[] = [];
  let subcommittees: CommitteeListItem[] = [];

  try {
    committee = await getCommittee(id);
    if (committee) {
      const [m, s, p, sc] = await Promise.all([
        getCommitteeMembers(committee.id),
        getCommitteeSittings(committee.id).catch((err) => {
          console.error("[/komisja/[id]] sittings load failed", { id, err });
          return [] as CommitteeSitting[];
        }),
        getCommitteeLinkedPrints(committee.id).catch((err) => {
          console.error("[/komisja/[id]] prints load failed", { id, err });
          return [] as LinkedPrint[];
        }),
        getSubcommittees(committee.id).catch((err) => {
          console.error("[/komisja/[id]] subcommittees load failed", { id, err });
          return [] as CommitteeListItem[];
        }),
      ]);
      members = m;
      sittings = s;
      prints = p;
      subcommittees = sc;
    }
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

  // Split sittings: planowane (future) vs odbyte (past + ongoing). The "Ostatnie
  // posiedzenia" feed must not surface future agenda items as "what they did".
  const todayMs = new Date().setHours(23, 59, 59, 999);
  const pastSittings: CommitteeSitting[] = [];
  const futureSittings: CommitteeSitting[] = [];
  for (const s of sittings) {
    const sittingMs = s.date ? new Date(s.date).getTime() : 0;
    const isFuture = s.status === "PLANNED" || (sittingMs > todayMs && s.status !== "FINISHED");
    if (isFuture) futureSittings.push(s);
    else pastSittings.push(s);
  }

  // Hero stats — counts/dates use past only.
  const currentYear = new Date().getFullYear();
  const yearSittings = pastSittings.filter((s) => {
    if (!s.date) return false;
    return new Date(s.date).getFullYear() === currentYear;
  });
  const lastFinishedDate = pastSittings[0]?.date ?? null;
  const lastFinishedRelative = formatRelativePl(lastFinishedDate);

  const topSittings = pastSittings.slice(0, 3);
  const archiveSittings = pastSittings.slice(3);
  const topAgendas = topSittings.map((s) => parseAgendaHtml(s.agendaHtml));
  // Upcoming: closest first.
  const upcomingSittings = [...futureSittings].sort((a, b) => {
    const at = a.date ? new Date(a.date).getTime() : 0;
    const bt = b.date ? new Date(b.date).getTime() : 0;
    return at - bt;
  }).slice(0, 3);

  // Roster grouping
  const grouped = new Map<number, CommitteeMember[]>();
  for (const m of members) {
    const arr = grouped.get(m.rank) ?? [];
    arr.push(m);
    grouped.set(m.rank, arr);
  }
  const ranks = Array.from(grouped.keys()).sort((a, b) => a - b);

  return (
    <main className="bg-background text-foreground font-serif pb-20">
      <div className="max-w-[1100px] mx-auto px-4 md:px-8 lg:px-14 pt-7 md:pt-9">
        <PageBreadcrumb
          items={[
            { label: "Komisje", href: "/komisja" },
            { label: committee.name },
          ]}
          subtitle={
            <>
              {committeeTypeLabel(committee.type)} · <span className="font-mono">{committee.code}</span>
              {committee.scope ? ` — ${committee.scope}` : ""}
            </>
          }
        />
      </div>

      {/* Hero stats */}
      <div className="max-w-[1100px] mx-auto px-4 md:px-8 lg:px-14 grid grid-cols-2 md:grid-cols-4 gap-x-4 md:gap-x-6 border-b border-border">
        <Tile
          k={`Posiedzenia ${currentYear}`}
          v={String(yearSittings.length)}
          sub={`${sittings.length} łącznie w tej kadencji`}
          pos={0}
        />
        <Tile
          k="Ostatnie posiedzenie"
          v={lastFinishedRelative ?? "—"}
          sub={lastFinishedDate ? formatShortDate(lastFinishedDate) : "brak danych"}
          pos={1}
        />
        <Tile
          k="Skład"
          v={String(members.length)}
          sub={pluralPl(members.length, ["członek", "członków", "członków"])}
          pos={2}
        />
        <Tile
          k="Druki"
          v={prints.length > 0 ? String(prints.length) : "—"}
          sub={prints.length > 0 ? "ostatnio rozpatrywane" : "brak powiązań"}
          pos={3}
        />
      </div>

      <div className="max-w-[1100px] mx-auto px-4 md:px-8 lg:px-14 pt-8 md:pt-10 space-y-12">
        {/* Upcoming sittings — only if any are planned */}
        {upcomingSittings.length > 0 && (
          <section>
            <div className="font-sans text-[11px] tracking-[0.16em] uppercase text-foreground mb-1">
              ✶ Najbliższe posiedzenia · {futureSittings.length}
            </div>
            <p className="font-sans text-[12px] text-muted-foreground max-w-[680px] mb-4 leading-relaxed">
              Zaplanowane na przyszłość. Pełny porządek pojawi się tuż przed posiedzeniem.
            </p>
            <ul className="border border-border divide-y divide-border">
              {upcomingSittings.map((s) => (
                <UpcomingSittingRow key={s.id} s={s} />
              ))}
            </ul>
          </section>
        )}

        {/* Past sittings feed */}
        <section>
          <div className="font-sans text-[11px] tracking-[0.16em] uppercase text-destructive mb-1">
            ✶ Ostatnie posiedzenia
          </div>
          <p className="font-sans text-[12px] text-muted-foreground max-w-[680px] mb-5 leading-relaxed">
            Trzy najświeższe odbyte posiedzenia wraz z punktami porządku obrad. Pełne archiwum poniżej.
          </p>

          {topSittings.length === 0 ? (
            <p className="font-serif italic text-muted-foreground">
              Brak zarejestrowanych posiedzeń.
            </p>
          ) : (
            <div className="space-y-4">
              {topSittings.map((s, i) => (
                <SittingCard key={s.id} sitting={s} agenda={topAgendas[i]} variant="expanded" />
              ))}
            </div>
          )}

          {archiveSittings.length > 0 && (
            <details className="mt-6 border border-border">
              <summary className="cursor-pointer px-4 py-3 font-sans text-[11px] tracking-[0.14em] uppercase text-muted-foreground hover:text-destructive hover:border-destructive">
                Wszystkie odbyte posiedzenia · {pastSittings.length}
              </summary>
              <ul className="px-4 pb-2">
                {archiveSittings.map((s) => (
                  <ArchiveSittingRow key={s.id} s={s} />
                ))}
              </ul>
            </details>
          )}
        </section>

        {/* Linked prints */}
        {prints.length > 0 && (
          <section>
            <div className="font-sans text-[11px] tracking-[0.16em] uppercase text-destructive mb-1">
              ✶ Druki nad którymi pracuje komisja
            </div>
            <p className="font-sans text-[12px] text-muted-foreground max-w-[680px] mb-4 leading-relaxed">
              Projekty ustaw i inne dokumenty, w których komisja brała udział na którymś z etapów. ✓ = wydała sprawozdanie.
            </p>
            <ul className="border border-border divide-y divide-border">
              {prints.map((p) => (
                <li key={p.printId}>
                  <Link
                    href={`/druki/${p.printId}`}
                    className="flex items-baseline gap-x-3 gap-y-1 px-4 py-3 hover:bg-muted/40 transition-colors"
                  >
                    <span className="font-mono text-[11px] tracking-wide text-destructive w-16 shrink-0">
                      {p.number}
                    </span>
                    <span className="font-serif text-[14.5px] leading-snug flex-1 min-w-0">
                      {p.shortTitle ?? p.title}
                    </span>
                    {p.hadReport && (
                      <span
                        className="font-sans text-[10px] tracking-[0.14em] uppercase border border-foreground/40 text-foreground px-1.5 py-0.5 shrink-0"
                        title="Komisja wydała sprawozdanie"
                      >
                        ✓ sprawozd.
                      </span>
                    )}
                    <span className="font-sans text-[11px] text-muted-foreground tabular-nums w-28 text-right shrink-0 hidden sm:inline">
                      {formatRelativePl(p.lastTouched) ?? "—"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Subcommittees */}
        {subcommittees.length > 0 && (
          <section>
            <div className="font-sans text-[11px] tracking-[0.16em] uppercase text-destructive mb-1">
              ✶ Podkomisje · {subcommittees.length}
            </div>
            <p className="font-sans text-[12px] text-muted-foreground max-w-[680px] mb-4 leading-relaxed">
              Mniejsze zespoły powołane wewnątrz komisji do prac szczegółowych.
            </p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {subcommittees.map((sc) => {
                const hasName = sc.name && sc.name !== sc.code;
                const displayName = hasName ? sc.name : `Podkomisja ${sc.code}`;
                return (
                  <li key={sc.id}>
                    <Link
                      href={`/komisja/${sc.id}`}
                      className="block border border-border hover:border-destructive transition-colors px-3 py-2.5"
                    >
                      <div className="flex items-baseline gap-x-3">
                        <span className="font-mono text-[10.5px] tracking-wide text-destructive uppercase shrink-0">
                          {sc.code}
                        </span>
                        <span
                          className={`font-serif text-[14px] leading-snug min-w-0 flex-1 ${
                            hasName ? "" : "italic text-muted-foreground"
                          }`}
                        >
                          {displayName}
                        </span>
                        {sc.memberCount > 0 && (
                          <span className="font-mono text-[10.5px] text-muted-foreground shrink-0">
                            {sc.memberCount} czł.
                          </span>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Composition */}
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

        {/* Meta footer */}
        <section className="border-t border-border pt-5 font-sans text-[11.5px] text-muted-foreground">
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <span>
              <span className="uppercase tracking-[0.12em] text-[10px] mr-1">Powołana:</span>
              {formatDate(committee.appointmentDate)}
            </span>
            <span>
              <span className="uppercase tracking-[0.12em] text-[10px] mr-1">Skład z dnia:</span>
              {formatDate(committee.compositionDate)}
            </span>
            {committee.phone && (
              <span>
                <span className="uppercase tracking-[0.12em] text-[10px] mr-1">Tel.:</span>
                <span className="font-mono">{committee.phone}</span>
              </span>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function UpcomingSittingRow({ s }: { s: CommitteeSitting }) {
  const dateLabel = s.date
    ? new Date(s.date).toLocaleDateString("pl-PL", { day: "2-digit", month: "long", year: "numeric" })
    : "—";
  const relative = formatRelativePlFuture(s.date);
  const oneLine = s.agendaText.length > 140 ? s.agendaText.slice(0, 140).trimEnd() + "…" : s.agendaText;
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-serif text-[14px]">{dateLabel}</span>
        {relative && (
          <span className="font-sans text-[11px] tracking-[0.04em] text-foreground">{relative}</span>
        )}
        <span className="font-sans text-[10.5px] text-muted-foreground tracking-[0.08em]">nr {s.num}</span>
        <span className="font-sans text-[9.5px] tracking-[0.14em] uppercase border border-foreground/40 text-foreground px-1.5 py-0.5">
          planowane
        </span>
        {s.remote && (
          <span className="font-sans text-[9.5px] tracking-[0.14em] uppercase text-muted-foreground">
            zdalne
          </span>
        )}
        {s.room && (
          <span className="font-sans text-[11px] text-muted-foreground ml-auto">{s.room}</span>
        )}
      </div>
      {oneLine && (
        <p className="font-serif text-[13px] leading-snug text-muted-foreground mt-1 max-w-[820px]">
          {oneLine}
        </p>
      )}
    </li>
  );
}

function formatRelativePlFuture(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const days = Math.round((d.getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return "dziś";
  if (days === 1) return "jutro";
  if (days < 7) return `za ${days} dni`;
  if (days < 30) {
    const w = Math.floor(days / 7);
    return `za ${w} ${w === 1 ? "tydzień" : "tyg."}`;
  }
  const m = Math.floor(days / 30);
  return `za ${m} mies.`;
}

function ArchiveSittingRow({ s }: { s: CommitteeSitting }) {
  const status = s.status ?? "FINISHED";
  const dateLabel = s.date
    ? new Date(s.date).toLocaleDateString("pl-PL", { day: "2-digit", month: "long", year: "numeric" })
    : "—";
  const oneLine = s.agendaText.length > 140 ? s.agendaText.slice(0, 140).trimEnd() + "…" : s.agendaText;
  return (
    <li className="border-b border-border last:border-b-0 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-serif text-[14px]">{dateLabel}</span>
        <span className="font-sans text-[10.5px] text-muted-foreground tracking-[0.08em]">nr {s.num}</span>
        <span className={`font-sans text-[9.5px] tracking-[0.14em] uppercase border px-1.5 py-0.5 ${STATUS_CLASS[status] ?? STATUS_CLASS.FINISHED}`}>
          {STATUS_LABEL[status] ?? status.toLowerCase()}
        </span>
        {s.videoPlayerLink && (
          <a
            href={s.videoPlayerLink}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto font-sans text-[11px] underline decoration-dotted underline-offset-4 hover:text-destructive"
          >
            ▶ wideo
          </a>
        )}
      </div>
      {oneLine && (
        <p className="font-serif text-[13px] leading-snug text-muted-foreground mt-1 max-w-[820px]">
          {oneLine}
        </p>
      )}
    </li>
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
        style={{ fontSize: "clamp(1.05rem, 2.2vw, 1.4rem)" }}
      >
        {v}
      </div>
      <div className="font-sans text-[10.5px] text-muted-foreground leading-tight truncate">{sub}</div>
    </div>
  );
}
