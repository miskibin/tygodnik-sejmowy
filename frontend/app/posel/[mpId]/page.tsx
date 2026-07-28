import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getMp, getClubName, getMpStats } from "@/lib/db/mps";
import { getMpOfficeExpenseSummary } from "@/lib/db/posel-tabs";
import { PoselTabs } from "./_components/PoselTabs";
import {
  TydzienAsync,
  VotesAsync,
  QuestionsAsync,
  StatementsAsync,
  PromisesAsync,
  OfficeExpensesAsync,
  PanelFallback,
} from "./_components/AsyncPanels";
import { ProfilPanel } from "./_components/ProfilPanel";
import { HeroLedeBand } from "./_components/HeroLedeBand";
import { ClubBadge } from "@/components/clubs/ClubBadge";
import { KLUB_LABELS } from "@/lib/atlas/constants";
import { NotFoundPage } from "@/components/chrome/NotFoundPage";
import { PageBreadcrumb } from "@/components/chrome/PageBreadcrumb";


const PLN_INT = new Intl.NumberFormat("pl-PL", {
  style: "currency",
  currency: "PLN",
  maximumFractionDigits: 0,
});

export async function generateMetadata({
  params,
}: { params: Promise<{ mpId: string }> }): Promise<Metadata> {
  const { mpId: raw } = await params;
  const mpId = Number(raw);
  if (!Number.isFinite(mpId)) return {};
  const mp = await getMp(mpId);
  if (!mp) return {};
  // Fetch expenses summary in parallel — adds one cheap query but materially
  // improves SEO for "ile wydał poseł X" search intent.
  const [clubName, expSummary] = await Promise.all([
    getClubName(mp.clubRef),
    getMpOfficeExpenseSummary(mpId).catch(() => null),
  ]);
  const baseRole = guessRoleLabel(mp.firstLastName);
  const isFemale = baseRole === "Posłanka";
  const role = mp.active ? `${baseRole} X kadencji` : `By${isFemale ? "ła posłanka" : "ły poseł"}`;
  const club = clubName ?? mp.clubRef ?? "klub bezpartyjny";
  const district = mp.districtNum ? ` · okręg ${mp.districtNum}` : "";

  // SEO: when we have verified expense data, lead the description with the
  // amount + year ("wydał X zł na biuro w 2025"). Polish search queries
  // along the lines of "ile wydał poseł", "wydatki biura X", "sprawozdanie
  // ryczałtowe" then surface this page with the number visible in SERP.
  const isVerifiedExp = expSummary && expSummary.dataConfidence === "verified";
  const verb = isFemale ? "Wydała" : "Wydał";
  const expClause = isVerifiedExp
    ? `${verb} ${PLN_INT.format(expSummary!.totalSpent)} na biuro poselskie w ${expSummary!.year} r. `
    : "";
  // Inactive-MP suffix matches the MP's gender (Polish requires it).
  const inactiveSuffix = isFemale ? "(była posłanka)" : "(były poseł)";
  const titleSuffix = isVerifiedExp
    ? `${PLN_INT.format(expSummary!.totalSpent)} wydatków biura ${expSummary!.year}`
    : `${baseRole} ${mp.active ? "X kadencji" : inactiveSuffix}`;
  const desc =
    `${expClause}${role} · ${club}${district}. ` +
    "Frekwencja, głosowania, interpelacje, wystąpienia, obietnice vs głosy, " +
    "sprawozdanie wydatków biura poselskiego.";

  const path = `/posel/${mpId}`;
  const fullTitle = `${mp.firstLastName} — ${titleSuffix}`;

  // Keyword string is mostly cosmetic for Google but still indexed by a few
  // engines (Bing, Yandex, DuckDuckGo). Cheap to ship.
  const keywords = [
    mp.firstLastName,
    `${mp.firstLastName} wydatki`,
    `${mp.firstLastName} biuro poselskie`,
    `${mp.firstLastName} sprawozdanie`,
    `${mp.firstLastName} ryczałt`,
    `ile wydaje poseł ${mp.firstLastName}`,
    "sprawozdania wydatków biur poselskich",
    "ryczałt biuro poselskie 2025",
    "wydatki posłów Sejm X kadencja",
    club,
  ].filter(Boolean) as string[];

  return {
    title: fullTitle,
    description: desc,
    keywords,
    alternates: { canonical: path },
    openGraph: {
      title: fullTitle,
      description: desc,
      url: path,
      type: "profile",
      images: mp.photoUrl ? [{ url: mp.photoUrl }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
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
  let expSummary: Awaited<ReturnType<typeof getMpOfficeExpenseSummary>> = null;
  try {
    [clubName, stats, expSummary] = await Promise.all([
      getClubName(mp.clubRef),
      getMpStats(mpId),
      getMpOfficeExpenseSummary(mpId).catch(() => null),
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
    expSummary = null;
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
    { id: "wydatki", label: "Wydatki biura" },
    { id: "profil", label: "Profil" },
  ];

  // Schema.org Person + the year's office-expense total exposed as
  // additionalProperty. Google/Bing pick this up for the Knowledge Graph
  // and for richer SERP snippets — letting "ile wydał poseł X" queries
  // hit our page with the actual number visible.
  const ldJson: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: mp.firstLastName,
    jobTitle: mp.active ? `${roleLabel} X kadencji Sejmu RP` : "Były poseł / była posłanka",
    affiliation: clubName
      ? { "@type": "Organization", name: clubName }
      : undefined,
    image: mp.photoUrl ?? undefined,
    url: `https://tygodniksejmowy.pl/posel/${mpId}`,
    nationality: "PL",
  };
  if (expSummary && expSummary.dataConfidence === "verified") {
    ldJson.additionalProperty = [
      {
        "@type": "PropertyValue",
        name: `Wydatki biura poselskiego ${expSummary.year}`,
        value: expSummary.totalSpent,
        unitText: "PLN",
        description: `Łączne wydatki z ryczałtu na prowadzenie biura poselskiego w ${expSummary.year} r., wg sprawozdania zatwierdzonego przez Prezydium Sejmu.`,
      },
    ];
  }

  // Escape `<` so a stray `</script>` in any string field (MP name from DB,
  // club name, …) can't break out of the script element. Same defensive
  // pattern as app/jak-powstaje-ustawa/page.tsx.
  const ldJsonHtml = JSON.stringify(ldJson).replace(/</g, "\\u003c");

  return (
    <div className="bg-background text-foreground pb-16 sm:pb-20 min-w-0 overflow-x-hidden">
      {/* JSON-LD structured data for the MP profile + (if verified) the
          year's expense total. Surfaced in SERPs and Knowledge Graph. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: ldJsonHtml }}
      />

      {/* Breadcrumb */}
      <div className="max-w-[1100px] mx-auto px-4 md:px-8 lg:px-14 pt-6 sm:pt-8">
        <PageBreadcrumb
          items={[
            { label: "Posłowie", href: "/posel" },
            { label: mp.firstLastName },
          ]}
          subtitle={
            mp.districtNum
              ? `Okręg ${mp.districtNum}${mp.voivodeship ? ` — ${mp.voivodeship}` : ""}`
              : undefined
          }
        />
      </div>

      {/* HERO */}
      <div className="max-w-[1100px] mx-auto px-4 md:px-8 lg:px-14 pb-6 sm:pb-8 border-b border-border">
        <div
          className="grid gap-5 md:gap-9 items-end min-w-0 grid-cols-[88px_1fr] sm:grid-cols-[120px_1fr] md:grid-cols-[152px_1fr_240px]"
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
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground opacity-50" style={{ fontSize: "clamp(36px, 5vw, 56px)" }}>
                {mp.firstLastName.split(" ").map((s) => s[0]).join("").slice(0, 2)}
              </div>
            )}
            {mp.clubRef && (
              <span aria-hidden className="absolute inset-x-0 -bottom-1 h-1.5" style={{ background: `var(--destructive)` }} />
            )}
          </div>

          {/* Name + badges + lede */}
          <div className="min-w-0">
            <h1
              className="font-medium m-0 leading-[0.96] tracking-[-0.035em] text-balance break-words"
              style={{ fontSize: "clamp(2.25rem, 7vw, 5.25rem)" }}
            >
              {first ? <>{first}{" "}</> : null}
              <em className="not-italic italic text-destructive">{last}</em>
            </h1>

            <div className="mt-3 sm:mt-4 max-w-[640px] flex flex-col gap-2">
              <div className="text-secondary-foreground leading-[1.45] text-[15px] sm:text-[17px] break-words text-pretty">
                {mp.clubRef ? (
                  <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 align-middle">
                    <ClubBadge klub={mp.clubRef} size="xl" tooltip={clubName ?? undefined} />
                    <strong
                      className="text-foreground font-medium"
                      title={clubName ?? undefined}
                    >
                      {KLUB_LABELS[mp.clubRef] ?? mp.clubRef}
                    </strong>
                  </span>
                ) : (
                  <strong className="text-foreground">brak klubu</strong>
                )}
              </div>
              {(mp.profession || mp.educationLevel) && (
                <div className="flex flex-wrap gap-1.5">
                  {mp.profession && (
                    <span className="text-[11px] border border-foreground/40 text-secondary-foreground px-2.5 py-1 font-medium">
                      {mp.profession}
                    </span>
                  )}
                  {mp.educationLevel && (
                    <span className="text-[11px] border border-foreground/40 text-secondary-foreground px-2.5 py-1 font-medium">
                      wykszt. {mp.educationLevel}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Action stack — mobile drops to full-width row below */}
          <div className="col-span-2 md:col-span-1 flex md:flex-col w-full min-w-0 gap-2 mt-2 md:mt-0">
            {expSummary && expSummary.dataConfidence === "verified" && (
              <a
                href="#wydatki"
                className="block group text-center md:text-right shrink-0 flex-1 md:flex-none"
              >
                <span className="block text-[11px] text-muted-foreground font-medium">
                  Wydał w {expSummary.year}
                </span>
                <span
                  className="block font-medium tabular-nums tracking-[-0.03em] text-foreground group-hover:text-foreground transition-colors leading-[0.95] mt-0.5"
                  style={{ fontSize: "clamp(1.9rem, 4.4vw, 2.9rem)" }}
                >
                  {PLN_INT.format(expSummary.totalSpent)}
                </span>
                <span className="block text-[11px] text-muted-foreground group-hover:text-foreground mt-0.5 font-medium">
                  na biuro poselskie →
                </span>
              </a>
            )}
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
              <div className="text-[11px] text-muted-foreground mb-1.5 font-medium">
                {s.k}
              </div>
              <div
                className="font-medium leading-none tabular-nums mb-1.5"
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
        initialTabId="obietnice"
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
          wydatki: (
            <Suspense fallback={<PanelFallback rows={6} />}>
              <OfficeExpensesAsync mpId={mpId} mpName={mp.firstLastName} klubRef={mp.clubRef ?? null} />
            </Suspense>
          ),
          profil: <ProfilPanel mp={mp} clubName={clubName} />,
        }}
      />

    </div>
  );
}
