import Link from "next/link";
import { getTopViralStatements } from "@/lib/db/statements";
import { ComingSoonPage } from "@/components/chrome/ComingSoonPage";
import { PageBreadcrumb } from "@/components/chrome/PageBreadcrumb";
import { KLUB_COLORS, KLUB_LABELS } from "@/lib/atlas/constants";
import { MowaViralStage, type StageQuote } from "./_components/MowaViralStage";

// Pełen feed wystąpień jest jeszcze przebudowywany (getStatements zwraca pustą
// listę w prod — historia w komentarzu pod ComingSoonPage). Do czasu jego
// powrotu /mowa pokazuje to, co już mamy posortowane przez model:
// najbardziej rezonansowe cytaty z mównicy, animowane na górze i jako
// statyczna siatka pod spodem.

async function safeViral() {
  try {
    return await getTopViralStatements(36);
  } catch (err) {
    console.error("[/mowa] getTopViralStatements failed", err);
    return [];
  }
}

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("pl-PL", { day: "numeric", month: "long" });
  } catch {
    return null;
  }
}

export default async function MowaPage() {
  const viral = await safeViral();

  if (viral.length === 0) {
    // Database has no viral_quote rows yet — keep the original placeholder.
    return (
      <ComingSoonPage
        routeName={
          <>
            Mowa <span className="italic text-destructive">sejmowa</span>
          </>
        }
        description={
          <>
            Wkrótce wróci pełen feed wystąpień z mównicy — przeszukiwalny po
            klubie, pośle, dacie i posiedzeniu. Pojedyncze wystąpienia nadal
            działają — możesz do nich trafić z głosowań i wątków.
          </>
        }
        plannedFeatures={[
          "Chronologiczny feed wystąpień z X kadencji",
          "Filtry: klub, poseł, posiedzenie, zakres dat",
          "Pełen tekst stenogramu z linkiem do oryginału w sejm.gov.pl",
        ]}
      />
    );
  }

  const stage: StageQuote[] = viral.slice(0, 8).map((q) => ({
    id: q.id,
    speakerName: q.speakerName,
    function: q.function,
    clubRef: q.clubRef,
    viralQuote: q.viralQuote,
    viralReason: q.viralReason,
    tone: q.tone,
    date: q.date,
  }));

  const rest = viral.slice(8);

  return (
    <main className="bg-background text-foreground min-h-screen pb-24">
      <div className="max-w-[1240px] mx-auto px-4 md:px-8 lg:px-14 pt-6">
        <PageBreadcrumb
          items={[{ label: "Mowa sejmowa" }]}
          subtitle={
            <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground">
              cytaty rezonansowe · X kadencja
            </span>
          }
        />
      </div>

      <MowaViralStage quotes={stage} />

      {rest.length > 0 && (
        <section className="px-4 md:px-8 lg:px-14 py-12 md:py-16">
          <div className="max-w-[1100px] mx-auto">
            <div className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-2 mb-8">
              <h2
                className="font-serif font-medium tracking-[-0.025em] leading-none m-0"
                style={{ fontSize: "clamp(1.5rem, 3.5vw, 2.25rem)" }}
              >
                Pozostałe <span className="italic text-destructive">cytaty</span>
              </h2>
              <p className="font-serif italic text-[14px] text-secondary-foreground m-0">
                Każdy klikalny — prowadzi do pełnej wypowiedzi.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border border border-border">
              {rest.map((q) => {
                const klubColor = q.clubRef
                  ? KLUB_COLORS[q.clubRef] ?? "var(--muted-foreground)"
                  : "var(--muted-foreground)";
                const klubLabel = q.clubRef
                  ? KLUB_LABELS[q.clubRef] ?? q.clubRef
                  : null;
                const date = fmtDate(q.date);
                return (
                  <Link
                    key={q.id}
                    href={`/mowa/${q.id}`}
                    className="group bg-background p-5 hover:bg-muted transition-colors relative"
                  >
                    <span
                      aria-hidden
                      className="absolute left-0 top-0 h-full w-[3px]"
                      style={{ background: klubColor, opacity: 0.6 }}
                    />
                    <div className="flex items-center justify-between mb-3 font-mono text-[10px] tracking-[0.16em] uppercase">
                      <span style={{ color: klubColor }}>
                        {klubLabel ?? "—"}
                      </span>
                      {date && (
                        <span className="text-muted-foreground">{date}</span>
                      )}
                    </div>
                    <blockquote
                      className="font-serif italic text-foreground leading-[1.25] line-clamp-4 mb-3"
                      style={{ fontSize: 15, textWrap: "balance" }}
                    >
                      <span
                        aria-hidden
                        className="select-none mr-1 font-serif italic"
                        style={{ color: klubColor, opacity: 0.4 }}
                      >
                        “
                      </span>
                      {q.viralQuote}
                    </blockquote>
                    <div className="flex items-baseline justify-between pt-2 border-t border-border">
                      <span className="font-sans text-[12px] text-foreground/85 truncate pr-2">
                        {q.speakerName ?? "anonim"}
                      </span>
                      <span className="font-mono text-[10px] tracking-wide text-muted-foreground group-hover:text-destructive transition-colors shrink-0">
                        →
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <footer className="px-4 md:px-8 lg:px-14 mt-4">
        <div className="max-w-[1100px] mx-auto pt-6 border-t border-border font-mono text-[10px] tracking-wide text-muted-foreground leading-relaxed">
          Źródło: stenogramy posiedzeń Sejmu RP X kadencji. Wybór cytatów —
          model językowy (viral_score). Pełen przeszukiwalny feed wystąpień —
          wkrótce.
        </div>
      </footer>
    </main>
  );
}
