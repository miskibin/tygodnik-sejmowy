import { getPartyDiscipline } from "@/lib/db/atlas";
import { getCommitteeList } from "@/lib/db/committees";
import { getPollAverages30d } from "@/lib/db/polls";
import { getLatestThread } from "@/lib/db/threads";
import { getPatroniteStats } from "@/lib/patronite";
import { getTopViralStatements } from "@/lib/db/statements";
import { getLatestSittingWithPrints } from "@/lib/db/prints";
import { KLUB_COLORS, KLUB_LABELS } from "@/lib/atlas/constants";
import { partyColor, partyLabel, partyLogoSrc, RESIDUAL_CODES } from "../sondaze/_components/partyMeta";
import { FeatureTile } from "./FeatureTile";
import { FeatureTileCarousel } from "./FeatureTileCarousel";

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try { return await p; } catch { return fallback; }
}

// Atlas klub codes → logo file in public/club-logos/. Atlas uses parliament
// club codes (PSL-TD, Polska2050) which differ from poll codes — partyLogoSrc
// from partyMeta is poll-keyed, so we map directly here.
const KLUB_LOGO: Record<string, string> = {
  PiS: "PiS.jpg",
  KO: "KO.jpg",
  Konfederacja: "Konfederacja.jpg",
  Lewica: "Lewica.jpg",
  "PSL-TD": "PSL-TD.jpg",
  Polska2050: "Polska2050.jpg",
  Razem: "Razem.jpg",
};

function klubLogoSrc(code: string): string | null {
  const f = KLUB_LOGO[code];
  return f ? `/club-logos/${f}` : null;
}

const STAGES = [
  { key: "druk", label: "druk" },
  { key: "i", label: "I czyt." },
  { key: "kom", label: "komisje" },
  { key: "ii", label: "II czyt." },
  { key: "iii", label: "III czyt." },
  { key: "eli", label: "Dz.U." },
] as const;

// Map a stage_type from process_stages into one of the 6 timeline buckets.
function stageBucket(stageType: string | null, stageName: string | null): number {
  const t = (stageType ?? "").toLowerCase();
  const n = (stageName ?? "").toLowerCase();
  if (t.includes("eli") || n.includes("publik")) return 5;
  if (n.includes("iii czyt")) return 4;
  if (n.includes("ii czyt")) return 3;
  if (t.includes("committee") || n.includes("komisj")) return 2;
  if (n.includes("i czyt") || n.includes("pierwsze")) return 1;
  return 0;
}

function fmtZl(n: number): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 0 }).format(n);
}

export async function FeatureTileGrid() {
  const [polls, thread, committees, discipline, patronite, viralSample, latestSitting] = await Promise.all([
    safe(getPollAverages30d(), []),
    safe(getLatestThread(), null),
    safe(getCommitteeList(10), []),
    safe(getPartyDiscipline(10), []),
    safe(getPatroniteStats(), {
      activeCount: 0, monthlyAmount: 0, inactiveCount: 0,
      totalEverCount: 0, fetchedAt: "", ok: false,
    }),
    safe(getTopViralStatements(1), []),
    safe(getLatestSittingWithPrints(10), null),
  ]);
  const mowaQuote = viralSample[0] ?? null;
  const mowaKlubColor = mowaQuote?.clubRef
    ? KLUB_COLORS[mowaQuote.clubRef] ?? "var(--muted-foreground)"
    : "var(--muted-foreground)";
  const mowaKlubLabel = mowaQuote?.clubRef
    ? KLUB_LABELS[mowaQuote.clubRef] ?? mowaQuote.clubRef
    : null;

  // ── 01 Atlas — party discipline (loyalty share), 4–6 main klubs ───────
  const atlasBars = discipline.slice(0, 6);
  const atlasHasData = atlasBars.length > 0;

  // ── 02 Sondaże — top blocs from 30d weighted avg ──────────────────────
  const mainPolls = polls
    .filter((r) => !RESIDUAL_CODES.has(r.party_code))
    .slice(0, 4);
  const pollsTotal = mainPolls.reduce((s, r) => s + r.percentage_avg, 0);

  // ── 03 Wątek — latest active bill ─────────────────────────────────────
  const threadStage = thread
    ? stageBucket(thread.lastStageType, thread.lastStageName)
    : -1;

  // ── 05 Komisja — counts ───────────────────────────────────────────────
  const standing = committees.filter((c) => c.type === "STANDING").length;
  const totalMembers = committees.reduce((s, c) => s + c.memberCount, 0);

  // ── 06 Budżet — monthly target vs patronite ───────────────────────────
  const target = 600;
  const raised = patronite.ok ? patronite.monthlyAmount : 0;
  const coverage = Math.min(100, Math.round((raised / target) * 100));
  const budzetMonth = new Date().toLocaleDateString("pl-PL", { month: "long", year: "numeric" });

  // ── 07 Alerty — RSS feed already live; push/ICS still wkrótce. ────────
  const alertChannels: Array<{ name: string; live: boolean; href?: string }> = [
    { name: "RSS", live: true, href: "/rss.xml" },
    { name: "push", live: false },
    { name: "ICS", live: false },
  ];
  const sittingDate = latestSitting?.lastDate
    ? new Date(latestSitting.lastDate).toLocaleDateString("pl-PL", { day: "numeric", month: "long" })
    : null;

  return (
    <section className="px-4 md:px-8 lg:px-14 py-12 md:py-16 border-b border-rule">
      <div className="max-w-[1100px] mx-auto">
        <div className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-2 mb-8 md:mb-10">
          <h2 className="font-serif font-medium tracking-[-0.025em] leading-none m-0" style={{ fontSize: "clamp(1.75rem, 4.5vw, 3rem)" }}>
            Dalej <span className="italic text-destructive">w numerze</span>
          </h2>
          <p className="font-serif italic text-[14px] md:text-[15px] text-secondary-foreground m-0">
            Siedem pozostałych działów.
          </p>
        </div>

        <FeatureTileCarousel slides={[
          <FeatureTile
            key="01"
            num="01"
            kicker="WYKRESY"
            title="Atlas"
            description="Dominujący klub w każdym z 41 okręgów, dyscyplina klubowa, zmiany barw partyjnych — w jednym widoku."
            preview={
              atlasHasData ? (() => {
                // Klub size (totalMembersAvg) — gives real visual variance
                // (PiS ~190, Polska2050 ~15). Discipline alone is too flat.
                const sizes = atlasBars.map((r) => Math.round(r.totalMembersAvg));
                const max = Math.max(...sizes, 1);
                const maxIdx = sizes.indexOf(max);
                return (
                  <div className="flex items-end gap-2">
                    {atlasBars.map((r, i) => {
                      const size = sizes[i];
                      const isMax = i === maxIdx;
                      const heightPx = Math.max(14, Math.round((size / max) * 72));
                      const logo = klubLogoSrc(r.klub);
                      return (
                        <div key={r.klub} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
                          <span className={`font-mono text-[10px] leading-none ${isMax ? "text-destructive" : "text-muted-foreground"}`}>
                            {size}
                          </span>
                          <div
                            className="w-full"
                            style={{
                              height: `${heightPx}px`,
                              background: partyColor(r.klub),
                              opacity: isMax ? 1 : 0.75,
                            }}
                            title={`${r.klub}: średnio ${size} mandatów`}
                          />
                          {logo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={logo}
                              alt={r.klub}
                              title={r.klub}
                              className="w-5 h-5 rounded-full object-cover border border-border"
                            />
                          ) : (
                            <span className="font-mono text-[9px] text-muted-foreground truncate w-full text-center">
                              {r.klub}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })() : (
                <div className="font-mono text-[11px] text-muted-foreground italic">brak danych</div>
              )
            }
            href="/atlas"
            ctaLabel="otwórz atlas →"
          />

          ,
          <FeatureTile
            key="02"
            num="02"
            kicker="POPARCIE PARTII"
            title="Sondaże"
            description="Średnia ważona z ostatnich 30 dni. Z przeliczeniem na mandaty w Sejmie."
            preview={
              mainPolls.length > 0 ? (
                <div>
                  <div className="flex h-[14px] w-full overflow-hidden border border-border">
                    {mainPolls.map((r) => (
                      <div
                        key={r.party_code}
                        style={{
                          width: `${(r.percentage_avg / Math.max(1, pollsTotal)) * 100}%`,
                          background: partyColor(r.party_code),
                        }}
                        title={`${partyLabel(r.party_code)} ${r.percentage_avg.toFixed(1)}%`}
                      />
                    ))}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
                    {mainPolls.map((r) => {
                      const logo = partyLogoSrc(r.party_code);
                      return (
                        <div key={r.party_code} className="flex items-center gap-2">
                          {logo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={logo}
                              alt={partyLabel(r.party_code)}
                              title={partyLabel(r.party_code)}
                              className="w-5 h-5 rounded-full object-cover border border-border shrink-0"
                            />
                          ) : (
                            <span
                              className="w-2 h-2 rounded-sm shrink-0"
                              style={{ background: partyColor(r.party_code) }}
                            />
                          )}
                          <span className="font-mono text-[10.5px] text-foreground truncate">
                            {r.party_code}
                          </span>
                          <span className="font-mono text-[11px] text-muted-foreground ml-auto">
                            {r.percentage_avg.toFixed(0)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="font-mono text-[11px] text-muted-foreground italic">brak danych</div>
              )
            }
            href="/sondaze"
            ctaLabel="zobacz sondaż →"
          />

          ,
          <FeatureTile
            key="03"
            num="03"
            kicker="PEŁEN CYKL"
            title="Wątek"
            description="Każda ustawa — od druku przez czytania, komisje, głosowania, aż po publikację w Dzienniku Ustaw."
            preview={
              <div>
                <div className="font-serif italic text-[13.5px] leading-snug text-foreground line-clamp-2 mb-3">
                  {thread
                    ? thread.shortTitle || thread.title || `Druk ${thread.number}`
                    : "Każda ustawa — od druku do publikacji w Dzienniku Ustaw."}
                </div>
                <div className="relative flex items-center justify-between">
                  <span className="absolute left-2 right-2 top-[5px] h-px bg-border -z-0" aria-hidden />
                  {STAGES.map((s, i) => {
                    const active = thread && i === threadStage;
                    const past = thread && i < threadStage;
                    const dotStyle = active
                      ? { background: "var(--destructive)", borderColor: "var(--destructive)" }
                      : past
                        ? { background: "var(--foreground)", borderColor: "var(--foreground)" }
                        : { background: "var(--background)", borderColor: "var(--border)" };
                    return (
                      <div key={s.key} className="relative flex flex-col items-center gap-1.5 z-10">
                        <span className="w-2.5 h-2.5 rounded-full border" style={dotStyle} />
                        <span
                          className={`font-mono text-[9px] tracking-tight ${
                            active ? "text-destructive" : "text-muted-foreground"
                          }`}
                        >
                          {s.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            }
            href="/watek"
            ctaLabel="prześledź wątek →"
          />

          ,
          <FeatureTile
            key="04"
            num="04"
            kicker="TRANSKRYPCJE"
            title="Mowa"
            description="Wystąpienia z mównicy. Każde zdanie z linkiem do nagrania."
            preview={
              mowaQuote ? (
                <div className="pl-3 py-0.5 border-l-2" style={{ borderColor: mowaKlubColor }}>
                  <div className="font-serif italic text-[13.5px] leading-snug text-foreground line-clamp-3 mb-2">
                    „{mowaQuote.viralQuote}&rdquo;
                  </div>
                  <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-wide text-muted-foreground">
                    <span className="text-foreground/80 truncate">{mowaQuote.speakerName ?? "anonim"}</span>
                    {mowaKlubLabel && (
                      <>
                        <span className="text-border" aria-hidden>·</span>
                        <span style={{ color: mowaKlubColor }}>{mowaKlubLabel}</span>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="font-mono text-[11px] text-muted-foreground italic">brak danych</div>
              )
            }
            href={mowaQuote ? `/mowa/${mowaQuote.id}` : "/mowa"}
            ctaLabel="otwórz mowę →"
          />

          ,
          <FeatureTile
            key="05"
            num="05"
            kicker="POSIEDZENIA"
            title="Komisja"
            description="Lista komisji X kadencji — typ, liczba członków, przewodniczący. Wkrótce: kalendarz i porządek obrad."
            preview={
              committees.length > 0 ? (
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <div>
                    <div className="font-serif text-[22px] font-medium leading-none">{standing}</div>
                    <div className="font-sans text-[10.5px] text-muted-foreground mt-1">komisji stałych</div>
                  </div>
                  <div>
                    <div className="font-serif text-[22px] font-medium leading-none">{committees.length}</div>
                    <div className="font-sans text-[10.5px] text-muted-foreground mt-1">łącznie</div>
                  </div>
                  <div>
                    <div className="font-serif text-[22px] font-medium leading-none">{totalMembers}</div>
                    <div className="font-sans text-[10.5px] text-muted-foreground mt-1">mandatów członkowskich</div>
                  </div>
                </div>
              ) : (
                <div className="font-mono text-[11px] text-muted-foreground italic">brak danych</div>
              )
            }
            href="/komisja"
            ctaLabel="otwórz listę →"
          />

          ,
          <FeatureTile
            key="06"
            num="06"
            kicker="FINANSE"
            title="Budżet"
            description="Transparentny budżet projektu: ile wpływa od patronów, ile kosztuje serwer, gdzie idzie reszta."
            preview={
              <div>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="font-serif text-[26px] font-medium leading-none">
                    {fmtZl(raised)} zł
                  </span>
                  <span className="font-sans text-[12px] italic text-muted-foreground">
                    / {fmtZl(target)} zł
                  </span>
                </div>
                <div className="h-[8px] w-full bg-border overflow-hidden">
                  <div
                    className="h-full bg-foreground"
                    style={{ width: `${coverage}%` }}
                  />
                </div>
                <div className="flex justify-between font-mono text-[10px] text-muted-foreground mt-1.5">
                  <span>{patronite.ok ? `${patronite.activeCount} patronów` : "patronite offline"}</span>
                  <span>{coverage}% celu</span>
                  <span>{budzetMonth}</span>
                </div>
              </div>
            }
            href="/budzet"
            ctaLabel="zobacz budżet →"
          />

          ,
          <FeatureTile
            key="07"
            num="07"
            kicker="SUBSKRYPCJE"
            title="Alerty"
            description="RSS działa: nowe druki w czytniku. Push, ICS i alerty słowne — w planach."
            preview={
              <div className="space-y-3">
                {latestSitting ? (
                  <div>
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="font-serif text-[24px] font-medium leading-none">
                        {latestSitting.printCount}
                      </span>
                      <span className="font-sans text-[11.5px] text-muted-foreground">
                        nowych druków
                      </span>
                    </div>
                    <div className="font-mono text-[10px] tracking-wide text-muted-foreground">
                      posiedzenie #{latestSitting.sittingNum}
                      {sittingDate && <> · do {sittingDate}</>}
                    </div>
                  </div>
                ) : (
                  <div className="font-mono text-[11px] text-muted-foreground italic">brak danych</div>
                )}
                <div>
                  <div className="font-mono text-[9.5px] tracking-[0.16em] uppercase text-muted-foreground mb-1.5">
                    kanały
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {alertChannels.map((c) =>
                      c.live && c.href ? (
                        <a
                          key={c.name}
                          href={c.href}
                          className="font-mono text-[10.5px] px-2 py-0.5 border border-destructive text-destructive rounded-sm hover:bg-destructive hover:text-background transition-colors"
                        >
                          {c.name} ✓
                        </a>
                      ) : (
                        <span
                          key={c.name}
                          className="font-mono text-[10.5px] px-2 py-0.5 border border-dashed border-border text-muted-foreground rounded-sm"
                        >
                          {c.name}
                        </span>
                      ),
                    )}
                  </div>
                </div>
              </div>
            }
            href="/alerty"
            ctaLabel="co planujemy →"
            comingSoon
          />,
        ]} />
      </div>
    </section>
  );
}
