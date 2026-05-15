import Link from "next/link";
import { ScrollText, ArrowRight, Crown, Landmark, Vote, FileSearch } from "lucide-react";

// Promo card surfacing the /jak-powstaje-ustawa explainer on the landing.
// Lives between ElectionCountdown and FeatureTileGrid — separate section so
// it doesn't get lost in the 7-tile feature carousel; this content is
// evergreen and educational, not a feed item.

const STEPS = [
  { icon: ScrollText, label: "Wpłynęło" },
  { icon: FileSearch, label: "Komisja" },
  { icon: Vote, label: "Plenum" },
  { icon: Landmark, label: "Senat" },
  { icon: Crown, label: "Prezydent" },
] as const;

export function LegislativeProcessCard() {
  return (
    <section
      className="px-4 md:px-8 lg:px-14 py-10 md:py-12 border-b border-rule"
      style={{ background: "var(--muted)" }}
    >
      <div className="max-w-[1100px] mx-auto">
        <Link
          href="/jak-powstaje-ustawa"
          className="group block rounded-md p-6 md:p-8 transition-colors hover:bg-background border border-transparent hover:border-border"
        >
          <div
            className="grid gap-6 md:gap-10 items-center"
            style={{ gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)" }}
          >
            {/* Left: copy */}
            <div>
              <span
                className="font-mono uppercase tracking-[0.18em] text-destructive"
                style={{ fontSize: 11, fontWeight: 600 }}
              >
                Przewodnik
              </span>
              <h2
                className="font-serif font-medium m-0 mt-2 mb-3"
                style={{ fontSize: "clamp(24px, 3.5vw, 36px)", letterSpacing: "-0.02em", lineHeight: 1.1 }}
              >
                Jak powstaje <span className="italic text-destructive">ustawa</span> w Sejmie
              </h2>
              <p
                className="font-serif text-secondary-foreground m-0 mb-4"
                style={{ fontSize: 15, lineHeight: 1.55 }}
              >
                Każda ustawa przechodzi przez <strong>11 etapów</strong> — od
                wpłynięcia projektu, przez komisje i głosowania w Sejmie i
                Senacie, aż po podpis Prezydenta i publikację w Dzienniku
                Ustaw. Tłumaczymy każdy etap prostym językiem.
              </p>
              <span className="font-sans text-[12.5px] tracking-wide text-destructive group-hover:underline inline-flex items-center gap-1">
                Otwórz przewodnik
                <ArrowRight size={14} strokeWidth={2} />
              </span>
            </div>

            {/* Right: 5-step icon strip — a teaser of the phase grouping */}
            <div className="hidden md:block">
              <div className="flex items-center justify-between gap-2 relative">
                {/* Connecting line behind icons */}
                <div
                  aria-hidden
                  className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-px"
                  style={{
                    background:
                      "repeating-linear-gradient(to right, var(--border) 0 4px, transparent 4px 8px)",
                  }}
                />
                {STEPS.map((s, i) => {
                  const Icon = s.icon;
                  const isActive = i === 2; // PLENUM highlighted as visual anchor
                  return (
                    <div
                      key={s.label}
                      className="flex flex-col items-center gap-1.5 relative z-10"
                    >
                      <div
                        className="flex items-center justify-center rounded-full"
                        style={{
                          width: 44,
                          height: 44,
                          background: isActive ? "var(--destructive)" : "var(--background)",
                          color: isActive ? "var(--destructive-foreground)" : "var(--secondary-foreground)",
                          boxShadow: `0 0 0 1.5px ${isActive ? "var(--destructive)" : "var(--border)"}`,
                        }}
                      >
                        <Icon size={18} strokeWidth={1.75} />
                      </div>
                      <span
                        className="font-mono uppercase tracking-[0.08em]"
                        style={{
                          fontSize: 9.5,
                          color: isActive ? "var(--destructive)" : "var(--muted-foreground)",
                          fontWeight: isActive ? 600 : 500,
                        }}
                      >
                        {s.label}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div
                className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 font-mono text-[10px] tracking-[0.1em] uppercase text-muted-foreground"
              >
                <span>460 posłów</span>
                <span aria-hidden>·</span>
                <span>100 senatorów</span>
                <span aria-hidden>·</span>
                <span>21 dni Prezydent</span>
              </div>
            </div>
          </div>
        </Link>
      </div>
    </section>
  );
}
