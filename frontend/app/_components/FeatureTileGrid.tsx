import { getPartyDiscipline } from "@/lib/db/atlas";
import { getCommitteeList } from "@/lib/db/committees";
import { getPollAverages30d } from "@/lib/db/polls";
import { getLatestThread } from "@/lib/db/threads";
import { getPatroniteStats } from "@/lib/patronite";
import { partyColor, partyLabel, partyLogoSrc, RESIDUAL_CODES } from "../sondaze/_components/partyMeta";
import { FeatureTile } from "./FeatureTile";

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
  { key: "eli", label: "ELI" },
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
  const [polls, thread, committees, discipline, patronite] = await Promise.all([
    safe(getPollAverages30d(), []),
    safe(getLatestThread(), null),
    safe(getCommitteeList(10), []),
    safe(getPartyDiscipline(10), []),
    safe(getPatroniteStats(), {
      activeCount: 0, monthlyAmount: 0, inactiveCount: 0,
      totalEverCount: 0, fetchedAt: "", ok: false,
    }),
  ]);

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

  // ── 07 Alerty — static keyword stub ───────────────────────────────────
  const alertKeywords = [
    { label: "najem instytucjonalny", n: 12, hot: true },
    { label: "składka zdrowotna", n: 5, hot: false },
    { label: "okręg 13", n: 2, hot: false },
    { label: "kwota wolna", n: 8, hot: false },
    { label: "jawność wynagrodzeń", n: 3, hot: true },
  ];

  return (
    <section className="px-4 md:px-8 lg:px-14 py-12 md:py-16 border-b border-rule">
      <div className="max-w-[1100px] mx-auto">
        <div className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-2 mb-8 md:mb-10">
          <h2 className="font-serif font-medium tracking-[-0.025em] leading-none m-0" style={{ fontSize: "clamp(1.75rem, 4.5vw, 3rem)" }}>
            Dalej <span className="italic text-destructive">w numerze</span>
          </h2>
          <p className="font-serif italic text-[14px] md:text-[15px] text-secondary-foreground m-0">
            Tygodnik to wejście. Pod spodem — siedem działów.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-px bg-border border border-border">
          {/* Row 1 — 3 tiles, each 1/3 on lg */}
          <FeatureTile
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
            className="lg:col-span-2"
          />

          <FeatureTile
            num="02"
            kicker="POPARCIE PARTII"
            title="Sondaże"
            description="Średnia ważona z ostatnich 30 dni, bez cherry-pickingu, z mandatami w projekcji."
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
            className="lg:col-span-2"
          />

          <FeatureTile
            num="03"
            kicker="PEŁEN CYKL"
            title="Wątek"
            description="Każda ustawa — od druku przez czytania, komisje, głosowania, aż po publikację w ELI."
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
            className="lg:col-span-2"
          />

          {/* Row 2 — 2 tiles, each 1/2 on lg */}
          <FeatureTile
            num="04"
            kicker="TRANSKRYPCJE"
            title="Mowa"
            description="Wystąpienia z mównicy. Wyszukiwanie pełnotekstowe i semantyczne. Każde zdanie z linkiem do nagrania."
            preview={
              <div className="border-l-2 border-destructive pl-3 py-1">
                <div className="font-serif italic text-[13px] leading-snug text-muted-foreground">
                  „…poznasz, co konkretnie który poseł powiedział z mównicy — z minutą wideo i kontekstem debaty.&rdquo;
                </div>
              </div>
            }
            href={null}
            className="lg:col-span-3"
          />

          <FeatureTile
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
            className="lg:col-span-3"
          />

          {/* Row 3 — 2 tiles, each 1/2 on lg */}
          <FeatureTile
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
            className="lg:col-span-3"
          />

          <FeatureTile
            num="07"
            kicker="SUBSKRYPCJE"
            title="Alerty"
            description="Powiadomienia, gdy w Sejmie padnie konkretne słowo — albo gdy Twój poseł zagłosuje wbrew klubowi."
            preview={
              <div className="flex flex-wrap gap-1.5">
                {alertKeywords.map((k) => (
                  <span
                    key={k.label}
                    className="inline-flex items-center gap-1.5 font-sans text-[11px] px-2.5 py-1 border"
                    style={
                      k.hot
                        ? { background: "var(--destructive)", color: "var(--destructive-foreground)", borderColor: "var(--destructive)" }
                        : { background: "var(--background)", color: "var(--secondary-foreground)", borderColor: "var(--border)" }
                    }
                  >
                    „{k.label}&rdquo;
                    <span className="font-mono text-[9.5px] opacity-70">{k.n}</span>
                  </span>
                ))}
              </div>
            }
            href={null}
            className="lg:col-span-3"
          />
        </div>
      </div>
    </section>
  );
}
