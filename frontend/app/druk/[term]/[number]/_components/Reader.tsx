"use client";

import { useState } from "react";
import { DropCap } from "@/components/chrome/DropCap";
import { MarkdownText } from "@/components/text/MarkdownText";
import { affectedGroupLabel, formatPopulation, isProceduralCategory, severityColor } from "@/lib/labels";
import type { PrintDetail } from "@/lib/db/prints";

const LEVELS = [
  { n: "01", h: "Po polsku, prosto" },
  { n: "02", h: "Dla kogo" },
  { n: "03", h: "Pełny tekst" },
] as const;

function pluralGrupy(n: number): string {
  if (n === 1) return "1 grupa";
  const last = n % 10;
  const lastTwo = n % 100;
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return `${n} grupy`;
  return `${n} grup`;
}

export function Reader({ print }: { print: PrintDetail }) {
  const [level, setLevel] = useState(0);
  // Suppress citizen-action affordance on procedural / meta docs even if the
  // older LLM run left a value in the column.
  const suppressAction = print.isProcedural || isProceduralCategory(print.documentCategory);

  const sub0 = "streszczenie";
  const sub1 = print.affectedGroups.length > 0 ? pluralGrupy(print.affectedGroups.length) : "grupy obywateli";
  const sub2 = "z PDF";
  const subs = [sub0, sub1, sub2];

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-3 auto-rows-fr border border-rule mb-9">
        {LEVELS.map((c, i) => (
          <button
            key={c.n}
            onClick={() => setLevel(i)}
            className="cursor-pointer transition-colors flex flex-col text-left h-full px-5 py-4 sm:px-[22px] sm:py-5 border-b sm:border-b-0 last:border-b-0 sm:border-r last:sm:border-r-0 border-rule"
            style={{
              background: level === i ? "var(--foreground)" : "transparent",
              color: level === i ? "var(--background)" : "var(--foreground)",
            }}
          >
            <div className="font-sans text-[10px] tracking-[0.16em] uppercase opacity-60 mb-2">
              {c.n}
            </div>
            <div className="font-serif text-[22px] font-medium tracking-tight mb-1 leading-tight">
              {c.h}
            </div>
            <div className="font-sans text-[11px] opacity-70 mt-auto">{subs[i]}</div>
          </button>
        ))}
      </div>

      <article className="min-h-[60vh]">
        {level === 0 && (
          <>
            {suppressAction ? (
              <p
                className="m-0 mb-5 text-secondary-foreground font-serif italic"
                style={{ fontSize: 17, lineHeight: 1.65 }}
              >
                Ten druk to dokument proceduralny — techniczny krok w procesie legislacyjnym, który nie zmienia prawa bezpośrednio. Streszczenie codzienne pomijamy. Pełen tekst dostępny w karcie „03 Pełny tekst”.
              </p>
            ) : print.summaryPlain ? (
              <p
                className="m-0 mb-5"
                style={{ fontSize: 21, lineHeight: 1.6, textWrap: "pretty" }}
              >
                <DropCap>{print.summaryPlain.charAt(0)}</DropCap>
                <span>{print.summaryPlain.slice(1)}</span>
              </p>
            ) : print.summary ? (
              <p
                className="m-0 mb-5 text-secondary-foreground"
                style={{ fontSize: 18, lineHeight: 1.65, textWrap: "pretty" }}
              >
                {print.summary}
              </p>
            ) : (
              <p className="font-serif italic text-muted-foreground">
                Streszczenie po polsku jeszcze nie zostało wygenerowane dla tego druku.
              </p>
            )}

            {print.impactPunch && (
              <div
                className="my-8"
                style={{
                  background: "var(--highlight)",
                  padding: "20px 26px",
                  borderLeft: "3px solid var(--destructive)",
                }}
              >
                <div className="font-sans text-[10px] tracking-[0.18em] uppercase text-destructive mb-2">
                  ↳ co się dla mnie zmienia?
                </div>
                <p className="m-0 italic" style={{ fontSize: 17, lineHeight: 1.55 }}>
                  <MarkdownText text={print.impactPunch} />
                </p>
              </div>
            )}

            {print.citizenAction && !suppressAction && (
              <div className="my-8 pt-3.5 border-t border-dotted border-border flex items-baseline gap-3.5 font-sans">
                <span className="text-[10px] tracking-[0.16em] uppercase text-destructive font-medium min-w-[130px]">
                  → co możesz zrobić
                </span>
                <span className="text-sm leading-[1.5] text-secondary-foreground flex-1">
                  <MarkdownText text={print.citizenAction} />
                </span>
              </div>
            )}

            <div className="font-mono text-[10px] text-muted-foreground mt-9 pt-3.5 border-t border-border flex justify-between">
              <span>
                Streszczenie · druk {print.number} · kadencja {print.term}
              </span>
              <span className="text-destructive">zgłoś nieścisłość ↗</span>
            </div>
          </>
        )}

        {level === 1 && (
          <div className="font-serif">
            {print.affectedGroups.length === 0 ? (
              <p className="font-serif italic text-muted-foreground">
                Grupy adresatów nie zostały jeszcze wykryte dla tego druku.
              </p>
            ) : (
              print.affectedGroups.map((g) => {
                const color = severityColor(g.severity);
                const label =
                  g.severity === "high"
                    ? "wpływ bezpośredni"
                    : g.severity === "medium"
                    ? "wpływ pośredni"
                    : "wpływ ograniczony";
                const pop = formatPopulation(g.estPopulation);
                return (
                  <div
                    key={g.tag}
                    className="py-5 border-b border-border flex justify-between items-baseline gap-4"
                  >
                    <div className="min-w-0">
                      <div className="text-[22px] font-medium leading-tight">{affectedGroupLabel(g.tag)}</div>
                      {pop && (
                        <div className="font-sans text-[12px] text-muted-foreground mt-1">
                          ~{pop} osób w Polsce
                          {g.sourceYear ? ` (${g.sourceYear})` : ""}
                          {g.sourceNote ? ` · ${g.sourceNote}` : ""}
                        </div>
                      )}
                    </div>
                    <div className="font-sans text-xs font-medium whitespace-nowrap" style={{ color }}>
                      {label}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {level === 2 && (
          <div
            className="font-mono text-[13px] text-secondary-foreground leading-[1.7] p-5 bg-white border border-border"
          >
            <p className="m-0">{print.title}</p>
            <div className="mt-4 text-muted-foreground">
              Pełny tekst PDF — wkrótce. Backend kompiluje OCR/markdown z załączników druku
              {" "}
              <span className="text-destructive">
                (druk {print.number}, kadencja {print.term})
              </span>
              .
            </div>
          </div>
        )}
      </article>
    </div>
  );
}
