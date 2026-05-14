"use client";

import * as React from "react";
import {
  BookOpen,
  Building2,
  ChevronDown,
  PenLine,
  ScrollText,
  UsersRound,
  Vote,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "tsj-proces-legislacyjny-intro-v1";

const PIPELINE: { label: string; sub: string; Icon: typeof ScrollText }[] = [
  {
    label: "Druk i Sejm",
    sub: "nadanie numeru druku, debaty i czytania w izbie oraz głosowania sejmowe nad przepisami",
    Icon: ScrollText,
  },
  {
    label: "Komisja",
    sub: "opinie, poprawki, sprawozdanie — przygotowanie ustaleń pod kolejne czytania",
    Icon: UsersRound,
  },
  {
    label: "III czytanie",
    sub: "głosowanie w Sejmie nad całością projektu — kluczowy moment w izbie",
    Icon: Vote,
  },
  {
    label: "Senat",
    sub: "uchwała Senatu, poprawki lub brak uchwały w ustawowym terminie — potem często powrót do Sejmu",
    Icon: Building2,
  },
  {
    label: "Prezydent",
    sub: "podpis, weto albo — w ściśle określonych sprawach — wniosek do Trybunału Konstytucyjnego",
    Icon: PenLine,
  },
  {
    label: "Dziennik / Monitor",
    sub: "tekst w Dzienniku Ustaw lub Monitorze Polskim, potem zwykle vacatio legis zanim przepisy zaczną obowiązywać",
    Icon: BookOpen,
  },
];

function PipelineVisual() {
  return (
    <div className="rounded-lg border border-border bg-muted/40 px-3 py-3 sm:px-4 sm:py-4">
      <div className="font-sans text-[10px] tracking-[0.14em] uppercase text-muted-foreground mb-3">
        Typowy przebieg (uproszczenie)
      </div>
      <div className="flex flex-col gap-2">
        {PIPELINE.map((step, i) => (
          <React.Fragment key={step.label}>
            <div className="flex gap-3 items-start rounded-md bg-background/80 px-2.5 py-2 ring-1 ring-border/60">
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-destructive"
                style={{ background: "var(--muted)" }}
                aria-hidden
              >
                <step.Icon className="size-4" strokeWidth={1.75} />
              </div>
              <div className="min-w-0 pt-0.5">
                <div className="font-sans text-[13px] font-medium text-foreground leading-tight">
                  {step.label}
                </div>
                <p className="font-sans text-[11.5px] text-muted-foreground leading-snug mt-0.5">
                  {step.sub}
                </p>
              </div>
            </div>
            {i < PIPELINE.length - 1 && (
              <div className="flex justify-center py-0.5 text-muted-foreground" aria-hidden>
                <ChevronDown className="size-4" />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

export function ProcesLegislacyjnyOnboarding() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      try {
        if (window.localStorage.getItem(STORAGE_KEY) !== "1") {
          setOpen(true);
        }
      } catch {
        setOpen(true);
      }
    });
    return () => window.cancelAnimationFrame(id);
  }, []);

  const persistDismiss = React.useCallback(() => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, "1");
      }
    } catch {
      /* ignore quota / private mode */
    }
  }, []);

  const onOpenChange = React.useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next) persistDismiss();
    },
    [persistDismiss],
  );

  return (
    <>
      <div className="flex justify-end mb-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="font-sans text-[11px] text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground hover:decoration-solid"
        >
          Jak działa proces legislacyjny?
        </button>
      </div>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-h-[min(90vh,720px)] w-[calc(100%-1.5rem)] max-w-[min(40rem,calc(100vw-1.5rem))] gap-0 overflow-y-auto p-0 sm:max-w-2xl"
          showCloseButton
        >
          <div className="px-5 pt-5 pb-4 sm:px-6 sm:pt-6">
            <DialogHeader className="text-left gap-2 pr-8">
              <DialogTitle className="font-serif text-[1.35rem] leading-snug sm:text-2xl">
                Jak czytać proces na tej stronie
              </DialogTitle>
              <DialogDescription className="font-sans text-[13px] leading-relaxed text-muted-foreground">
                Ta strona zbiera publiczne informacje o jednym druku sejmowym i powiązanych krokach: czytania,
                komisje, głosowania, Senat, Prezydent i publikacja. Poniżej uproszczony obraz całości — każdy
                projekt ma własną ścieżkę, ale kolejność instytucji jest zwykle taka sama.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-5 space-y-5">
              <PipelineVisual />

              <section className="font-sans text-[13px] leading-relaxed text-foreground space-y-2">
                <h3 className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
                  Możliwe zakończenia (skrót)
                </h3>
                <ul className="list-disc pl-4 space-y-1.5 text-muted-foreground marker:text-destructive">
                  <li>
                    <span className="text-foreground">Ustawa uchwalona i opublikowana</span> — przepisy zaczynają
                    obowiązywać po vacatio legis (domyślnie co najmniej kilkanaście dni; przy niektórych ustawach
                    podatkowych minimum miesiąc).
                  </li>
                  <li>
                    <span className="text-foreground">Odrzucony albo wycofany</span> — Sejm odrzuca projekt albo
                    wnioskodawca cofa inicjatywę.
                  </li>
                  <li>
                    <span className="text-foreground">Inne statusy końcowe</span> — np. zwrot wnioskodawcy albo
                    wygaśnięcie na koniec kadencji, jeśli procedura nie domknęła się wcześniej.
                  </li>
                </ul>
              </section>

              <section className="font-sans text-[13px] leading-relaxed text-foreground space-y-2">
                <h3 className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
                  Gdzie są &quot;opcje&quot;?
                </h3>
                <p className="text-muted-foreground">
                  <span className="text-foreground">Senat</span> może poprawiać tekst albo przyjąć go bez zmian; w
                  wielu sprawach ma określony termin (dla zwykłej ustawy zwykle około 30 dni — krócej przy budżecie
                  czy trybie przyspieszonym, dłużej przy zmianie Konstytucji). Brak uchwały w terminie bywa traktowany
                  jak przyjęcie wersji z Sejmu.
                </p>
                <p className="text-muted-foreground">
                  <span className="text-foreground">Prezydent</span> po otrzymaniu ustawy ma ustawowy czas na podpis
                  albo weto (dla zwykłej ustawy dłużej niż dla budżetu czy trybu przyspieszonego). Sejm może weto
                  odrzucić kwalifikowaną większością, jeśli ustawa ma wejść w życie.
                </p>
              </section>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-border bg-muted/30 px-5 py-4 sm:px-6 sm:flex-row sm:justify-end rounded-b-xl">
            <Button type="button" className="w-full sm:w-auto font-sans" onClick={() => onOpenChange(false)}>
              Rozumiem
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
