import type { Metadata } from "next";
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
import { ClubBadge } from "@/components/clubs/ClubBadge";
import { PageHeading } from "@/components/chrome/PageHeading";
import { NotFoundPage } from "@/components/chrome/NotFoundPage";


// Per-MP metadata. Title goes into <title> + og:title via the layout's
// `template: "%s · Tygodnik Sejmowy"`. Description seeds the search snippet.
// JSON-LD Person schema added via `other` so Google can render a Knowledge
// Graph card on name searches.
export async function generateMetadata({
  params,
}: { params: Promise<{ mpId: string }> }): Promise<Metadata> {
  const { mpId: raw } = await params;
  const mpId = Number(raw);
  if (!Number.isFinite(mpId)) return {};
  const mp = await getMp(mpId);
  if (!mp) return {};
  const clubName = await getClubName(mp.clubRef);
  const role = mp.active ? "Poseł X kadencji" : "Były poseł";
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

// Polish female first names overwhelmingly end in "a"; "Maria", "Anna", "Joanna",
// etc. all hit. The handful of male exceptions ("Kuba", "Bonawentura") aren't
// in the Sejm. Heuristic-only — swap for a real `mp.gender` field when ETL has it.
function guessRoleLabel(firstLastName: string): string {
  const first = firstLastName.split(/\s+/)[0] ?? "";
  const cleaned = first.replace(/[.,]/g, "").toLowerCase();
  return cleaned.endsWith("a") ? "Posłanka" : "Poseł";
}

export default async function MpPage({ params }: { params: Promise<{ mpId: string }> }) {
  const { mpId: raw } = await params;
  const mpId = Number(raw);
  if (!Number.isFinite(mpId) || mpId <= 0) notFound();

  // Fail closed on DB errors → branded 404 instead of Next default page.
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

  // Header + stat-tile data is awaited (small, used by tab labels too).
  // Tab panel content streams behind <Suspense>, populating as queries resolve.
  // getMpStats is best-effort: if it throws (rare aggregate-view issue),
  // render zeros instead of crashing the whole page.
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

  const frekwSub =
    stats.attendanceTotal === 0
      ? "brak głosowań w tej kadencji w bazie"
      : `${stats.attendanceCount} z ${stats.attendanceTotal} głosowań (obecność = brał udział w głosowaniu)`;

  const loyaltySub =
    stats.loyaltyVotes != null
      ? `${stats.loyaltyVotes} głosowań, w których brał udział — zgodnie z większością klubu`
      : "brak danych";

  const statTiles: { k: string; v: string; sub: string; barPct: number | null }[] = [
    {
      k: "Frekwencja",
      v: formatPct(stats.attendancePct),
      sub: frekwSub,
      barPct:
        stats.attendancePct != null && stats.attendanceTotal > 0
          ? Math.min(100, Math.max(0, stats.attendancePct))
          : null,
    },
    {
      k: "Głosy z klubem",
      v: formatPct(stats.loyaltyPct),
      sub: loyaltySub,
      barPct:
        stats.loyaltyPct != null && stats.loyaltyVotes != null && stats.loyaltyVotes > 0
          ? Math.min(100, Math.max(0, stats.loyaltyPct))
          : null,
    },
    {
      k: "Interpelacje",
      v: String(stats.questionCount),
      sub: stats.questionCount === 0 ? "brak w bazie" : "łącznie złożone",
      barPct: null,
    },
    {
      k: "Wystąpienia",
      v: String(stats.statementCount),
      sub: stats.statementCount === 0 ? "brak w bazie" : "na posiedzeniach Sejmu",
      barPct: null,
    },
  ];

  const tabs = [
    { id: "tydzien", label: "Ostatnia aktywność" },
    { id: "wszystko", label: "Wszystkie głosowania", count: stats.attendanceTotal },
    { id: "interpelacje", label: "Interpelacje", count: stats.questionCount },
    { id: "wystapienia", label: "Wystąpienia", count: stats.statementCount },
    { id: "obietnice", label: "Obietnica vs głosowanie" },
  ];

  return (
    <div className="bg-background text-foreground font-serif pb-20 min-w-0 overflow-x-hidden">
      {/* Compact hero — breadcrumb + photo + name + meta + actions in one band */}
      <div className="max-w-[1100px] mx-auto px-4 md:px-8 lg:px-14 pt-7 md:pt-9 pb-6">
        <div className="font-sans text-[11px] tracking-[0.16em] uppercase mb-4 flex items-center gap-3 flex-wrap">
          <a href="/posel" className="text-muted-foreground hover:text-destructive">‹ Posłowie</a>
          {mp.districtNum && (
            <>
              <span className="text-border">/</span>
              <span className="text-destructive font-medium normal-case text-[12px] tracking-normal">
                Okręg {mp.districtNum}
                {mp.voivodeship ? ` — ${mp.voivodeship}` : ""}
              </span>
            </>
          )}
        </div>

        <div className="grid items-start gap-4 sm:gap-5 md:gap-7 min-w-0 grid-cols-[88px_1fr] sm:grid-cols-[96px_1fr] md:[grid-template-columns:120px_1fr_auto]">
          <div className="bg-muted border border-border relative w-full min-w-0" style={{ aspectRatio: "4 / 5" }}>
            {mp.photoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={mp.photoUrl} alt={mp.firstLastName} className="w-full h-full object-cover" loading="eager" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center font-serif italic text-muted-foreground opacity-40" style={{ fontSize: 40 }}>
                {mp.firstLastName.split(" ").map((s) => s[0]).join("").slice(0, 2)}
              </div>
            )}
          </div>

          <div className="min-w-0">
            <PageHeading
              kicker={mp.active ? `${guessRoleLabel(mp.firstLastName)} X kadencji` : "Były poseł"}
              className="mb-2"
            >
              {mp.firstLastName}
            </PageHeading>
            <p className="font-sans text-[13px] text-secondary-foreground m-0 max-w-[640px] leading-snug break-words text-pretty">
              {mp.clubRef ? (
                <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 align-middle">
                  <ClubBadge klub={mp.clubRef} size="sm" tooltip={clubName ?? undefined} />
                  <strong className="text-foreground">{clubName ?? mp.clubRef}</strong>
                </span>
              ) : (
                <strong className="text-foreground">—</strong>
              )}
              {mp.profession ? <> · {mp.profession}</> : null}
              {mp.educationLevel ? <> · wykszt. {mp.educationLevel}</> : null}
              {mp.birthLocation ? <> · ur. {mp.birthLocation}</> : null}
            </p>
          </div>

          <div className="col-span-2 md:col-span-1 flex w-full min-w-0 flex-col gap-2 md:max-w-none">
            {mp.email ? (
              <a
                href={`mailto:${mp.email}`}
                className="font-sans text-[12.5px] px-4 py-2.5 rounded-full bg-foreground text-background tracking-wide cursor-pointer text-center shrink-0 w-full md:w-auto"
              >
                ✉ Napisz e-mail
              </a>
            ) : (
              <span className="font-sans text-[11.5px] px-4 py-2.5 rounded-full bg-muted text-muted-foreground tracking-wide text-center w-full md:w-auto leading-snug">
                brak publicznego e-maila w Sejmie
              </span>
            )}
            <span
              className="font-sans text-[12.5px] px-4 py-2.5 rounded-full border border-border text-muted-foreground tracking-wide text-center cursor-not-allowed opacity-70 w-full md:w-auto shrink-0"
              title="Funkcja w przygotowaniu."
            >
              Obserwuj (wkrótce)
            </span>
          </div>
        </div>
      </div>

      {/* Stat cards — frekwencja / klub / interpelacje / wystąpienia */}
      <div className="max-w-[1100px] mx-auto px-4 md:px-8 lg:px-14 pb-2">
        <div className="grid grid-cols-1 min-[400px]:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {statTiles.map((s) => (
            <div
              key={s.k}
              className="rounded-lg border border-border bg-muted/30 px-3 py-3 md:px-4 md:py-4 flex flex-col min-h-0 min-[400px]:min-h-[108px] lg:min-h-[118px]"
            >
              <div className="font-sans text-[10px] text-muted-foreground uppercase tracking-[0.14em] mb-1">
                {s.k}
              </div>
              <div
                className="font-serif font-medium leading-none mb-1.5 tracking-[-0.02em] text-foreground"
                style={{ fontSize: "clamp(1.25rem, 2.8vw, 1.75rem)" }}
              >
                {s.v}
              </div>
              <div className="font-sans text-[10.5px] text-muted-foreground leading-snug flex-1 break-words hyphens-auto">
                {s.sub}
              </div>
              {s.barPct != null && (
                <div className="mt-2 h-1 w-full rounded-full bg-border overflow-hidden shrink-0" aria-hidden>
                  <div
                    className="h-full rounded-full bg-foreground/85"
                    style={{ width: `${s.barPct}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
        <p className="font-sans text-[10px] text-muted-foreground mt-3 mb-0 tracking-wide">
          Liczby dotyczą 10. kadencji Sejmu.
        </p>
      </div>

      {/* Tabs — each panel streams independently behind its own Suspense boundary. */}
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
              <VotesAsync mpId={mpId} />
            </Suspense>
          ),
          interpelacje: (
            <Suspense fallback={<PanelFallback rows={5} />}>
              <QuestionsAsync mpId={mpId} />
            </Suspense>
          ),
          wystapienia: (
            <Suspense fallback={<PanelFallback rows={5} />}>
              <StatementsAsync mpId={mpId} />
            </Suspense>
          ),
          obietnice: (
            <Suspense fallback={<PanelFallback rows={4} />}>
              <PromisesAsync mpId={mpId} />
            </Suspense>
          ),
        }}
      />
    </div>
  );
}

