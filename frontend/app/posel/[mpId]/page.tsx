import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getMp, getClubName, getMpStats } from "@/lib/db/mps";
import { PoselTabs } from "./_components/PoselTabs";
import {
  TydzienAsync,
  VotesAsync,
  QuestionsAsync,
  StatementsAsync,
  PromisesAsync,
  PanelFallback,
} from "./_components/AsyncPanels";
import { ProfilPanel } from "./_components/ProfilPanel";
import { HeroLedeBand } from "./_components/HeroLedeBand";
import { ClubBadge } from "@/components/clubs/ClubBadge";
import { NotFoundPage } from "@/components/chrome/NotFoundPage";
import { ViewMethodologyFooter } from "@/components/chrome/ViewMethodologyFooter";


export async function generateMetadata({
  params,
}: { params: Promise<{ mpId: string }> }): Promise<Metadata> {
  const { mpId: raw } = await params;
  const mpId = Number(raw);
  if (!Number.isFinite(mpId)) return {};
  const mp = await getMp(mpId);
  if (!mp) return {};
  const clubName = await getClubName(mp.clubRef);
  const baseRole = guessRoleLabel(mp.firstLastName);
  const role = mp.active ? `${baseRole} X kadencji` : `By${baseRole === "Posłanka" ? "ła posłanka" : "ły poseł"}`;
  const club = clubName ?? mp.clubRef ?? "klub bezpartyjny";
  const district = mp.districtNum ? ` · okręg ${mp.districtNum}` : "";
  const desc = `${role} · ${club}${district}. Frekwencja, głosowania, interpelacje, wystąpienia, obietnice vs głosy.`;
  const path = `/posel/${mpId}`;
  return {
    title: mp.firstLastName,
    description: desc,
    alternates: { canonical: path },
    openGraph: {
      title: `${mp.firstLastName} — ${role}`,
      description: desc,
      url: path,
      type: "profile",
      images: mp.photoUrl ? [{ url: mp.photoUrl }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: `${mp.firstLastName} — ${role}`,
      description: desc,
      images: mp.photoUrl ? [mp.photoUrl] : undefined,
    },
  };
}

function formatPct(p: number | null): string {
  if (p == null) return "—";
  return `${p.toLocaleString("pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function guessRoleLabel(firstLastName: string): string {
  const first = firstLastName.split(/\s+/)[0] ?? "";
  const cleaned = first.replace(/[.,]/g, "").toLowerCase();
  return cleaned.endsWith("a") ? "Posłanka" : "Poseł";
}

// Last name pulled out of "Imię Drugie Nazwisko" to italicize separately
// in the display title.
function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length <= 1) return { first: "", last: full };
  const last = parts.pop()!;
  return { first: parts.join(" "), last };
}

export default async function MpPage({ params }: { params: Promise<{ mpId: string }> }) {
  const { mpId: raw } = await params;
  const mpId = Number(raw);
  if (!Number.isFinite(mpId) || mpId <= 0) notFound();

  let mp: Awaited<ReturnType<typeof getMp>> = null;
  try {
    mp = await getMp(mpId);
  } catch (err) {
    console.error("[/posel/[mpId]] getMp failed", { mpId, err });
    return (
      <NotFoundPage
        entity="Poseł"
        gender="m"
        id={mpId}
        message="Nie udało się załadować profilu posła. Spróbuj odświeżyć stronę."
        backLink={{ href: "/posel", label: "Wróć do listy posłów →" }}
      />
    );
  }
  if (!mp) notFound();

  let clubName: string | null = null;
  let stats: Awaited<ReturnType<typeof getMpStats>>;
  try {
    [clubName, stats] = await Promise.all([
      getClubName(mp.clubRef),
      getMpStats(mpId),
    ]);
  } catch (err) {
    console.error("[/posel/[mpId]] club/stats failed", { mpId, err });
    clubName = null;
    stats = {
      attendancePct: null,
      attendanceCount: 0,
      attendanceTotal: 0,
      loyaltyPct: null,
      loyaltyVotes: null,
      questionCount: 0,
      statementCount: 0,
    };
  }

  const roleLabel = guessRoleLabel(mp.firstLastName);
  const { first, last } = splitName(mp.firstLastName);

  const frekwSub =
    stats.attendanceTotal === 0
      ? "brak głosowań w tej kadencji w bazie"
      : `${stats.attendanceCount} z ${stats.attendanceTotal} głosowań`;

  const loyaltySub =
    stats.loyaltyVotes != null
      ? `${stats.loyaltyVotes} głosowań — zgodnie z większością klubu`
      : "brak danych";

  const statTiles: { k: string; v: string; sub: string; color: string }[] = [
    {
      k: "Frekwencja",
      v: formatPct(stats.attendancePct),
      sub: frekwSub,
      color:
        stats.attendancePct == null
          ? "var(--muted-foreground)"
          : stats.attendancePct >= 85
            ? "var(--success)"
            : stats.attendancePct >= 70
              ? "var(--warning)"
              : "var(--destructive)",
    },
    {
      k: "Głosy z klubem",
      v: formatPct(stats.loyaltyPct),
      sub: loyaltySub,
      color:
        stats.loyaltyPct == null
          ? "var(--muted-foreground)"
          : stats.loyaltyPct >= 90
            ? "var(--muted-foreground)"
            : stats.loyaltyPct >= 75
              ? "var(--warning)"
              : "var(--destructive)",
    },
    {
      k: "Interpelacje",
      v: String(stats.questionCount),
      sub: stats.questionCount === 0 ? "brak w bazie" : "łącznie złożone",
      color: "var(--foreground)",
    },
    {
      k: "Wystąpienia",
      v: String(stats.statementCount),
      sub: stats.statementCount === 0 ? "brak w bazie" : "na posiedzeniach Sejmu",
      color: "var(--foreground)",
    },
  ];

  const tabs = [
    { id: "tydzien", label: "Ostatnia aktywność" },
    { id: "wszystko", label: "Wszystkie głosowania", count: stats.attendanceTotal },
    { id: "interpelacje", label: "Interpelacje", count: stats.questionCount },
    { id: "wystapienia", label: "Wystąpienia", count: stats.statementCount },
    { id: "obietnice", label: "Obietnice vs głosy" },
    { id: "profil", label: "Profil" },
  ];

  return (
    <div className="bg-background text-foreground font-serif pb-16 sm:pb-20 min-w-0 overflow-x-hidden">
      {/* Breadcrumb */}
      <div className="max-w-[1100px] mx-auto px-4 md:px-8 lg:px-14 pt-6 sm:pt-8">
        <div className="font-sans text-[11px] tracking-[0.16em] uppercase flex items-center gap-3 flex-wrap mb-5 sm:mb-7">
          <Link href="/posel" className="text-muted-foreground hover:text-destructive">
            ‹ Posłowie
          </Link>
          {mp.districtNum && (
            <>
              <span className="text-border" aria-hidden>/</span>
              <span className="text-destructive font-medium normal-case text-[12px] tracking-normal">
                Okręg {mp.districtNum}
                {mp.voivodeship ? ` — ${mp.voivodeship}` : ""}
              </span>
            </>
          )}
        </div>
      </div>

      {/* HERO */}
      <div className="max-w-[1100px] mx-auto px-4 md:px-8 lg:px-14 pb-6 sm:pb-8 border-b border-border">
        <div
          className="grid gap-5 md:gap-9 items-end min-w-0 grid-cols-[100px_1fr] sm:grid-cols-[140px_1fr] md:grid-cols-[180px_1fr_240px]"
        >
          {/* Portrait */}
          <div
            className="relative bg-muted border border-rule"
            style={{ aspectRatio: "4 / 5", boxShadow: "6px 6px 0 var(--rule)" }}
          >
            {mp.photoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={mp.photoUrl} alt={mp.firstLastName} className="w-full h-full object-cover" loading="eager" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center font-serif italic text-muted-foreground opacity-50" style={{ fontSize: "clamp(36px, 5vw, 56px)" }}>
                {mp.firstLastName.split(" ").map((s) => s[0]).join("").slice(0, 2)}
              </div>
            )}
            {mp.clubRef && (
              <span aria-hidden className="absolute inset-x-0 -bottom-1 h-1.5" style={{ background: `var(--destructive)` }} />
            )}
          </div>

          {/* Name + badges + lede */}
          <div className="min-w-0">
            <div className="flex flex-wrap gap-1.5 mb-3">
              <span className="font-mono text-[9.5px] sm:text-[10px] tracking-[0.16em] uppercase bg-destructive text-background px-2.5 py-1">
                {roleLabel} · X kadencja
              </span>
              {mp.districtNum && (
                <span className="font-mono text-[9.5px] sm:text-[10px] tracking-[0.16em] uppercase border border-foreground/40 text-secondary-foreground px-2.5 py-1">
                  Okręg {mp.districtNum}
                </span>
              )}
              {!mp.active && (
                <span className="font-mono text-[9.5px] sm:text-[10px] tracking-[0.16em] uppercase border border-warning text-warning px-2.5 py-1">
                  Były poseł
                </span>
              )}
            </div>

            <h1
              className="font-serif font-medium m-0 leading-[0.96] tracking-[-0.035em] text-balance break-words"
              style={{ fontSize: "clamp(2.25rem, 7vw, 5.25rem)" }}
            >
              {first ? <>{first}{" "}</> : null}
              <em className="not-italic font-serif italic text-destructive">{last}</em>
            </h1>

            <p className="font-serif text-secondary-foreground mt-3 sm:mt-4 mb-0 leading-[1.45] text-[15px] sm:text-[17px] max-w-[640px] break-words text-pretty">
              {mp.clubRef ? (
                <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 align-middle">
                  <ClubBadge klub={mp.clubRef} size="sm" tooltip={clubName ?? undefined} />
                  <strong className="text-foreground font-medium">{clubName ?? mp.clubRef}</strong>
                </span>
              ) : (
                <strong className="text-foreground">brak klubu</strong>
              )}
              {mp.profession ? <> · {mp.profession}</> : null}
              {mp.educationLevel ? <> · wykszt. {mp.educationLevel}</> : null}
            </p>
          </div>

          {/* Action stack — mobile drops to full-width row below */}
          <div className="col-span-2 md:col-span-1 flex md:flex-col w-full min-w-0 gap-2 mt-2 md:mt-0">
            {mp.email ? (
              <a
                href={`mailto:${mp.email}`}
                className="font-sans text-[12px] sm:text-[13px] px-4 py-2.5 sm:py-3 bg-foreground text-background tracking-[0.04em] text-center shrink-0 flex-1 md:flex-none"
              >
                ✉ Napisz e-mail
              </a>
            ) : (
              <span className="font-sans text-[11.5px] px-4 py-2.5 bg-muted text-muted-foreground tracking-wide text-center flex-1 md:flex-none leading-snug">
                brak publicznego e-maila
              </span>
            )}
          </div>
        </div>
      </div>

      {/* LEDE band — renders only if there's real recent activity */}
      <Suspense fallback={null}>
        <HeroLedeBand mpId={mpId} firstLastName={mp.firstLastName} />
      </Suspense>

      {/* STATS STRIP — single edge-to-edge band of cells */}
      <div className="max-w-[1100px] mx-auto px-4 md:px-8 lg:px-14 pt-6 pb-2">
        <div className="grid grid-cols-2 md:grid-cols-4">
          {statTiles.map((s, i) => (
            <div
              key={s.k}
              className="py-4 md:py-5 px-3 md:px-5 border-border min-w-0"
              style={{
                borderRight: i < statTiles.length - 1 ? "1px solid var(--border)" : undefined,
                borderBottom: i < 2 ? "1px solid var(--border)" : undefined,
              }}
            >
              <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground mb-1.5">
                {s.k}
              </div>
              <div
                className="font-serif font-medium leading-none tabular-nums mb-1.5"
                style={{ fontSize: "clamp(1.75rem, 4vw, 2.5rem)", color: s.color, letterSpacing: "-0.025em" }}
              >
                {s.v}
              </div>
              <div className="font-sans text-[10.5px] text-muted-foreground leading-snug break-words hyphens-auto">
                {s.sub}
              </div>
            </div>
          ))}
        </div>
        <p className="font-sans text-[10px] text-muted-foreground mt-3 mb-0 tracking-wide">
          Liczby dotyczą X kadencji Sejmu.
        </p>
      </div>

      {/* Tabs */}
      <PoselTabs
        tabs={tabs}
        panels={{
          tydzien: (
            <Suspense fallback={<PanelFallback rows={4} />}>
              <TydzienAsync mpId={mpId} />
            </Suspense>
          ),
          wszystko: (
            <Suspense fallback={<PanelFallback rows={6} />}>
              <VotesAsync mpId={mpId} klubRef={mp.clubRef ?? null} />
            </Suspense>
          ),
          interpelacje: (
            <Suspense fallback={<PanelFallback rows={5} />}>
              <QuestionsAsync mpId={mpId} />
            </Suspense>
          ),
          wystapienia: (
            <Suspense fallback={<PanelFallback rows={5} />}>
              <StatementsAsync mpId={mpId} klubRef={mp.clubRef ?? null} />
            </Suspense>
          ),
          obietnice: (
            <Suspense fallback={<PanelFallback rows={4} />}>
              <PromisesAsync mpId={mpId} />
            </Suspense>
          ),
          profil: <ProfilPanel mp={mp} clubName={clubName} />,
        }}
      />

      <div className="max-w-[1100px] mx-auto px-4 md:px-8 lg:px-14">
        <ViewMethodologyFooter
          columns={[
            {
              kicker: "Skąd dane",
              children: (
                <>
                  api.sejm.gov.pl, własne aktualizacje. Frekwencja i lojalność klubowa liczone z
                  pełnej historii głosowań w tej kadencji.
                </>
              ),
            },
            {
              kicker: "Co znaczy lojalność klubowa",
              children: (
                <>
                  Procent głosowań, w których głos posła był zgodny z większością jego klubu. Niższy
                  wynik = częściej głosuje samodzielnie, niekoniecznie &bdquo;przeciw&rdquo;.
                </>
              ),
            },
            {
              kicker: "Znaczniki wydarzeń",
              children: (
                <>
                  Pionowe linie na wykresach (głosowania, wystąpienia) to ręcznie kuratorowana
                  lista istotnych momentów politycznych — globalnych oraz dla partii tego posła.
                  Pełna lista i historia zmian w pliku{" "}
                  <a
                    href="https://github.com/miskibin/tygodnik-sejmowy/blob/main/frontend/lib/timeline-events.ts"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline decoration-dotted underline-offset-2 hover:text-destructive"
                  >
                    lib/timeline-events.ts
                  </a>
                  .
                </>
              ),
            },
            {
              kicker: "Widzisz błąd?",
              children: (
                <>
                  Zgłoś go publicznie — repozytorium jest otwarte.
                  <a
                    href="https://github.com/miskibin/tygodnik-sejmowy/issues"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 border border-foreground px-3 py-1.5 font-mono text-[10.5px] tracking-[0.14em] uppercase text-foreground hover:bg-foreground hover:text-background transition-colors"
                  >
                    ↗ Zgłoś na GitHubie
                  </a>
                </>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
