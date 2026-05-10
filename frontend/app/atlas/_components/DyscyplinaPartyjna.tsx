"use client";

import { SectionHead } from "./SectionHead";
import type { DisciplineRow } from "@/lib/db/atlas";
import { KLUB_COLORS, KLUB_LABELS } from "@/lib/atlas/constants";
import { ClubLogo } from "@/components/atlas/ClubLogo";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

export function DyscyplinaPartyjna({ data }: { data: DisciplineRow[] }) {
  if (data.length === 0) {
    return (
      <section>
        <SectionHead num="05" kicker="Monolit czy fronda?" title="Dyscyplina klubowa" sub="Brak danych." />
      </section>
    );
  }
  const top = data[0];
  const bottom = data[data.length - 1];

  return (
    <section>
      <SectionHead
        num="05"
        kicker="Monolit czy fronda?"
        title="Dyscyplina klubowa"
        sub={`Średni odsetek głosów zgodnych z linią klubu (czyli głosów „w stronę większości"). Próba: ${top.votings.toLocaleString("pl-PL")} głosowań w X kadencji.`}
      />
      <div className="grid gap-9 lg:grid-cols-2 items-start">
        <div>
          {data.map((d) => {
            const pct = d.loyalty * 100;
            const color = KLUB_COLORS[d.klub] ?? "var(--muted-foreground)";
            const dissents = Math.round(d.votings * (1 - d.loyalty));
            const klubLabel = KLUB_LABELS[d.klub] ?? d.klub;
            return (
              <HoverCard key={d.klub} openDelay={120} closeDelay={80}>
                <HoverCardTrigger asChild>
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={`${klubLabel}: ${pct.toFixed(1)}% lojalności`}
                    className="mb-5 cursor-pointer rounded-sm transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-destructive p-1"
                  >
                    <div className="flex justify-between items-baseline mb-1.5">
                      <span className="font-serif text-[18px] font-medium text-foreground inline-flex items-center gap-2">
                        <ClubLogo klub={d.klub} size={20} />
                        {klubLabel}
                      </span>
                      <span className="font-mono text-[18px] font-semibold text-foreground">
                        {pct.toFixed(1)}
                        <span className="text-muted-foreground text-[13px]">%</span>
                      </span>
                    </div>
                    <div
                      className="h-2 relative border border-border"
                      style={{ background: "var(--muted)" }}
                    >
                      <div
                        className="absolute left-0 top-0 bottom-0 transition-[width] duration-300"
                        style={{ width: `${pct}%`, background: color }}
                      />
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground mt-1">
                      ~{Math.round(d.totalMembersAvg)} posłów / głos. · {d.votings} głosowań
                    </div>
                  </div>
                </HoverCardTrigger>
                <HoverCardContent className="w-72 font-sans text-[13px] bg-background border-rule">
                  <div className="font-serif text-[18px] text-foreground font-medium mb-2 inline-flex items-center gap-2">
                    <ClubLogo klub={d.klub} size={20} />
                    {klubLabel}
                  </div>
                  <div className="grid grid-cols-2 gap-y-1.5 font-mono text-[11px]">
                    <span className="text-muted-foreground">lojalność średnia</span>
                    <span className="text-right text-foreground font-semibold">{pct.toFixed(1)}%</span>
                    <span className="text-muted-foreground">odstępstw (~)</span>
                    <span className="text-right text-foreground">{dissents}</span>
                    <span className="text-muted-foreground">głosowań w próbie</span>
                    <span className="text-right text-foreground">{d.votings.toLocaleString("pl-PL")}</span>
                    <span className="text-muted-foreground">średnia obecność</span>
                    <span className="text-right text-foreground">~{Math.round(d.totalMembersAvg)} posłów</span>
                  </div>
                  <div className="mt-2.5 pt-2.5 border-t border-dotted border-border font-serif text-[12px] italic text-muted-foreground leading-snug">
                    {pct >= 90 && "Wysoka dyscyplina — głosowania klubowe zwykle przewidywalne."}
                    {pct >= 80 && pct < 90 && "Solidna dyscyplina, sporadyczne odstępstwa."}
                    {pct < 80 && "Klub się rozjeżdża — co piąty głos wbrew linii."}
                  </div>
                </HoverCardContent>
              </HoverCard>
            );
          })}
        </div>
        <aside
          className="font-serif text-[15px] leading-[1.7] text-secondary-foreground p-5"
          style={{ borderLeft: "3px solid var(--destructive)" }}
        >
          <p className="m-0 mb-3.5">
            <strong className="text-foreground">{KLUB_LABELS[top.klub] ?? top.klub} najbardziej zdyscyplinowany</strong>
            {" "}— {(top.loyalty * 100).toFixed(1)}% głosów zgodnych. Tylko {Math.round(top.votings * (1 - top.loyalty))} odstępstw w {top.votings.toLocaleString("pl-PL")} głosowaniach.
          </p>
          <p className="m-0 mb-3.5">
            <strong className="text-foreground">{KLUB_LABELS[bottom.klub] ?? bottom.klub} się sypie.</strong>
            {" "}{(bottom.loyalty * 100).toFixed(1)}% lojalności — {Math.round(bottom.votings * (1 - bottom.loyalty))} głosów wbrew klubowi.
            {bottom.klub === "Polska2050" && (
              <> Konsekwencja odpływu posłów do Centrum (zob. wykres&nbsp;03).</>
            )}
          </p>
          <p className="m-0 text-[13px] text-muted-foreground italic">
            Liczymy „głos zgodny z klubem" jako głos w stronę większości klubu obecnej w danym głosowaniu (winner takes all spośród ZA/PRZECIW/WSTRZYM.). Próba: ≥ 5 członków klubu obecnych w głosowaniu.
          </p>
        </aside>
      </div>
    </section>
  );
}
