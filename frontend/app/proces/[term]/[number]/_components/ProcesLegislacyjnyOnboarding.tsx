"use client";

import * as React from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  BookMarked,
  Building2,
  FileText,
  Landmark,
  ListChecks,
  PenLine,
  UsersRound,
  Vote,
} from "lucide-react";

const STORAGE_KEY = "tsj-proces-legislacyjny-intro-v3";

type StepGroup = "formal" | "sejm" | "senat" | "prezydent" | "prawo";

const FLOW_STEPS: {
  id: string;
  short: string;
  hint: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  group: StepGroup;
}[] = [
  { id: "druk", short: "Druk", hint: "numer, uzasadnienie", Icon: FileText, group: "formal" },
  { id: "i", short: "I czytanie", hint: "zarys w izbie", Icon: Landmark, group: "sejm" },
  { id: "kom", short: "Komisja", hint: "opinie, sprawozdanie", Icon: UsersRound, group: "sejm" },
  { id: "ii", short: "II czytanie", hint: "poprawki w Sejmie", Icon: ListChecks, group: "sejm" },
  { id: "iii", short: "III czytanie", hint: "kolej głosowań", Icon: Vote, group: "sejm" },
  { id: "senat", short: "Senat", hint: "druga izba", Icon: Building2, group: "senat" },
  { id: "prez", short: "Prezydent", hint: "podpis / weto / TK", Icon: PenLine, group: "prezydent" },
  { id: "pub", short: "Dz.U. / MP", hint: "vacatio → prawo", Icon: BookMarked, group: "prawo" },
];

const GROUP_RING: Record<StepGroup, string> = {
  formal: "ring-amber-700/35 bg-amber-100/80 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100",
  sejm: "ring-destructive/25 bg-[color-mix(in_oklab,var(--destructive)_12%,transparent)] text-[var(--destructive-deep)]",
  senat: "ring-slate-500/30 bg-slate-200/70 text-slate-900 dark:bg-slate-800/80 dark:text-slate-100",
  prezydent: "ring-violet-600/30 bg-violet-100/90 text-violet-950 dark:bg-violet-950/40 dark:text-violet-100",
  prawo: "ring-[color-mix(in_oklab,var(--success)_45%,transparent)] bg-[color-mix(in_oklab,var(--success)_14%,transparent)] text-[var(--success)]",
};

function ProcessFlowRail() {
  return (
    <div className="relative rounded-2xl border border-border/80 bg-gradient-to-b from-muted/50 to-muted/20 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.35)] dark:shadow-none">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Ścieżka w skrócie
        </p>
        <div className="flex flex-wrap gap-1.5 font-sans text-[9px] uppercase tracking-wide text-muted-foreground">
          <span className="rounded-full border border-border bg-background/80 px-2 py-0.5">Sejm</span>
          <span className="rounded-full border border-border bg-background/80 px-2 py-0.5">Senat</span>
          <span className="rounded-full border border-border bg-background/80 px-2 py-0.5">Prezydent</span>
          <span className="rounded-full border border-border bg-background/80 px-2 py-0.5">Publikacja</span>
        </div>
      </div>

      <div className="relative overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]">
        <div className="flex min-w-[min(100%,720px)] items-start justify-between gap-0 px-1 sm:min-w-full">
          {FLOW_STEPS.map((step, i) => (
            <React.Fragment key={step.id}>
              <div className="flex w-[4.75rem] shrink-0 flex-col items-center sm:w-[5.25rem]">
                <div
                  className={cn(
                    "flex size-11 items-center justify-center rounded-2xl ring-2 ring-offset-2 ring-offset-[var(--popover)] shadow-sm sm:size-12",
                    GROUP_RING[step.group],
                  )}
                  aria-hidden
                >
                  <step.Icon className="size-[1.15rem] sm:size-5" strokeWidth={1.65} />
                </div>
                <span className="mt-2 text-center font-sans text-[10px] font-semibold leading-tight text-foreground sm:text-[11px]">
                  {step.short}
                </span>
                <span className="mt-0.5 hidden text-center font-sans text-[9px] leading-snug text-muted-foreground sm:block">
                  {step.hint}
                </span>
              </div>
              {i < FLOW_STEPS.length - 1 && (
                <div
                  className="mx-0.5 mt-[1.35rem] hidden h-[3px] min-w-[0.5rem] flex-1 rounded-full bg-gradient-to-r from-border via-destructive/35 to-border sm:block"
                  aria-hidden
                />
              )}
            </React.Fragment>
          ))}
        </div>
        <div className="mt-3 flex justify-between gap-1 px-0.5 sm:hidden">
          {FLOW_STEPS.map((_, i) =>
            i < FLOW_STEPS.length - 1 ? (
              <div
                key={`m-${i}`}
                className="h-1 flex-1 rounded-full bg-gradient-to-r from-border via-destructive/30 to-border"
                aria-hidden
              />
            ) : null,
          )}
        </div>
      </div>
    </div>
  );
}

function BranchDiagram() {
  return (
    <figure
      className="overflow-hidden rounded-2xl border border-dashed border-border bg-background/60 p-4 shadow-inner"
      aria-label="Schemat: po uchwaleniu w Sejmie tekst idzie do Senatu, potem do Prezydenta, na końcu do publikacji. Z Senatu mogą wrócić poprawki do Sejmu."
    >
      <figcaption className="mb-3 font-sans text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Rozgałęzienia po Sejmie
      </figcaption>
      <svg viewBox="0 0 520 132" className="h-auto w-full max-h-[140px] text-foreground" aria-hidden>
        <defs>
          <linearGradient id="proces-leg-line" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--border)" />
            <stop offset="50%" stopColor="var(--destructive)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="var(--border)" />
          </linearGradient>
          <marker id="proces-leg-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" className="fill-muted-foreground" />
          </marker>
        </defs>
        <line x1="16" y1="40" x2="108" y2="40" stroke="url(#proces-leg-line)" strokeWidth="3" markerEnd="url(#proces-leg-arrow)" />
        <rect x="8" y="22" width="88" height="36" rx="8" className="fill-muted stroke-border" strokeWidth="1.5" />
        <text x="52" y="46" textAnchor="middle" fill="currentColor" className="font-sans text-[11px] font-semibold">
          Sejm uchwalił
        </text>
        <line x1="108" y1="40" x2="200" y2="40" stroke="url(#proces-leg-line)" strokeWidth="3" markerEnd="url(#proces-leg-arrow)" />
        <rect x="200" y="14" width="100" height="52" rx="10" className="fill-[color-mix(in_oklab,var(--secondary)_88%,white)] stroke-border dark:fill-secondary/40" strokeWidth="1.5" />
        <text x="250" y="36" textAnchor="middle" fill="currentColor" className="font-sans text-[10.5px] font-semibold">
          Senat
        </text>
        <text x="250" y="52" textAnchor="middle" fill="currentColor" className="font-sans text-[9px] opacity-70">
          bez zmian · poprawki · odrzucenie
        </text>
        <path
          d="M 300 66 C 330 96, 360 96, 390 66"
          fill="none"
          stroke="var(--destructive)"
          strokeWidth="2"
          strokeDasharray="4 3"
          opacity="0.55"
        />
        <text x="348" y="100" textAnchor="middle" fill="currentColor" className="font-sans text-[8.5px] opacity-70">
          poprawki → z powrotem do Sejmu
        </text>
        <line x1="300" y1="40" x2="392" y2="40" stroke="url(#proces-leg-line)" strokeWidth="3" markerEnd="url(#proces-leg-arrow)" />
        <rect x="392" y="22" width="112" height="36" rx="8" className="fill-[color-mix(in_oklab,var(--muted)_70%,transparent)] stroke-border" strokeWidth="1.5" />
        <text x="448" y="46" textAnchor="middle" fill="currentColor" className="font-sans text-[11px] font-semibold">
          Prezydent
        </text>
        <line x1="448" y1="58" x2="448" y2="78" stroke="var(--border)" strokeWidth="2" markerEnd="url(#proces-leg-arrow)" />
        <rect x="392" y="86" width="112" height="36" rx="8" className="fill-[color-mix(in_oklab,var(--success)_18%,var(--muted))] stroke-[color-mix(in_oklab,var(--success)_50%,var(--border))]" strokeWidth="1.5" />
        <text x="448" y="110" textAnchor="middle" fill="currentColor" className="font-sans text-[11px] font-semibold">
          Dz.U. / MP
        </text>
      </svg>
    </figure>
  );
}

function OutcomeStrip() {
  const items = [
    { k: "Dalej", d: "kolejny etap regulaminowy", tone: "border-emerald-800/25 bg-emerald-100/60 text-emerald-950 dark:bg-emerald-950/25 dark:text-emerald-50" },
    { k: "Odbicie", d: "np. poprawki Senatu → Sejm", tone: "border-amber-800/25 bg-amber-100/70 text-amber-950 dark:bg-amber-950/25 dark:text-amber-50" },
    { k: "Stop", d: "odrzucenie, weto bez przebicia", tone: "border-destructive/30 bg-[color-mix(in_oklab,var(--destructive)_10%,transparent)] text-[var(--destructive-deep)]" },
    { k: "Pauza", d: "TK, zwrot formalny", tone: "border-violet-600/25 bg-violet-100/70 text-violet-950 dark:bg-violet-950/30 dark:text-violet-50" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((x) => (
        <div key={x.k} className={cn("rounded-xl border px-2.5 py-2 shadow-sm", x.tone)}>
          <div className="font-sans text-[11px] font-bold tracking-tight">{x.k}</div>
          <div className="mt-0.5 font-sans text-[9.5px] leading-snug opacity-90">{x.d}</div>
        </div>
      ))}
    </div>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="font-sans text-[12.5px] leading-relaxed text-muted-foreground">{children}</p>;
}

function Ul({ children }: { children: React.ReactNode }) {
  return (
    <ul className="font-sans text-[12.5px] leading-relaxed text-muted-foreground list-disc pl-4 space-y-1.5 marker:text-destructive">
      {children}
    </ul>
  );
}

function Li({ head, children }: { head: string; children: React.ReactNode }) {
  return (
    <li>
      <span className="text-foreground font-medium">{head}</span> — {children}
    </li>
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
      /* ignore */
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
          className={cn(
            "gap-0 overflow-hidden border-border/90 p-0 shadow-2xl ring-1 ring-black/5",
            "max-h-[min(93vh,880px)] w-[calc(100%-1rem)]",
            "max-w-[calc(100vw-1rem)] sm:max-w-[min(56rem,calc(100vw-1.5rem))] lg:max-w-[min(72rem,calc(100vw-2rem))]",
          )}
          showCloseButton
        >
          <div className="h-1.5 w-full bg-gradient-to-r from-amber-600/90 via-destructive to-emerald-700/90" aria-hidden />

          <div className="max-h-[min(91vh,872px)] overflow-y-auto overscroll-contain px-5 pt-5 pb-3 sm:px-8 sm:pt-7 sm:pb-4">
            <DialogHeader className="text-left gap-3 pr-8">
              <DialogTitle className="font-serif text-[1.45rem] leading-snug sm:text-[1.75rem] tracking-tight">
                Etapy ustawy w Sejmie i poza nim
              </DialogTitle>
              <DialogDescription className="font-sans text-[13px] leading-relaxed text-muted-foreground sm:text-[14px] max-w-[62ch]">
                Poniżej: po co jest każdy etap, co może wtedy spaść na głosowaniach albo decyzjach organów oraz
                jak czytać to razem z osią czasu na tej stronie (wpisy z Sejmu: typ etapu + nazwa wydarzenia).
              </DialogDescription>
            </DialogHeader>

            <div className="mt-5 space-y-5">
              <ProcessFlowRail />
              <BranchDiagram />
              <OutcomeStrip />

              <Accordion type="multiple" className="w-full rounded-2xl border border-border/80 bg-muted/15 p-1 sm:p-2">
                <AccordionItem
                  value="druk"
                  className="overflow-hidden rounded-xl border border-transparent px-1 transition-colors data-[state=open]:border-border data-[state=open]:bg-background/90 data-[state=open]:shadow-sm"
                >
                  <AccordionTrigger className="rounded-lg px-3 py-3.5 hover:no-underline hover:bg-muted/40">
                    <span className="flex flex-col gap-1 pr-2 text-left">
                      <span className="inline-flex items-center gap-2">
                        <span className="flex size-7 items-center justify-center rounded-lg bg-amber-100/90 text-amber-950 ring-1 ring-amber-800/20 dark:bg-amber-950/40 dark:text-amber-50">
                          <FileText className="size-3.5" strokeWidth={1.75} aria-hidden />
                        </span>
                        <span className="font-sans text-[13.5px] font-semibold text-foreground sm:text-sm">
                          Druk i formalny start
                        </span>
                      </span>
                      <span className="font-sans text-[11px] font-normal text-muted-foreground pl-9 sm:text-[12px]">
                        Numer w kadencji, uzasadnienie — kiedy projekt jeszcze „nie debatuje”
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="border-t border-border/60 bg-muted/20 px-3 pb-4 pt-3 sm:px-4">
                    <P>
                      <strong className="text-foreground">Po co:</strong> Sejm musi wiedzieć, co właściwie proceduje:
                      pełny tekst, uzasadnienie (potrzeba, skutki, zgodność z prawem UE itd.), a przy projektach
                      rządowych także OSR. Bez formalnego domknięcia pakietu marszałek nie nadaje dalszego biegu.
                    </P>
                    <P className="mt-3">
                      <strong className="text-foreground">Co może spaść i czemu:</strong>
                    </P>
                    <Ul>
                      <Li head="Zwrot do wnioskodawcy">
                        braki formalne w uzasadnieniu — procedura się nie rozwija, dopóki wnioskodawca nie
                        poprawi dokumentów.
                      </Li>
                      <Li head="Opinia Komisji Ustawodawczej (niezgodność z Konstytucją)">
                        przy kwalifikowanej większości 3/5 możliwa jest wstępna blokada prawnie niedopuszczalnego
                        przedmiotu — zanim w ogóle wejdzie się w debatę merytoryczną.
                      </Li>
                    </Ul>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem
                  value="i-czytanie"
                  className="overflow-hidden rounded-xl border border-transparent px-1 transition-colors data-[state=open]:border-border data-[state=open]:bg-background/90 data-[state=open]:shadow-sm"
                >
                  <AccordionTrigger className="rounded-lg px-3 py-3.5 hover:no-underline hover:bg-muted/40">
                    <span className="flex flex-col gap-1 pr-2 text-left">
                      <span className="inline-flex items-center gap-2">
                        <span className="flex size-7 items-center justify-center rounded-lg bg-[color-mix(in_oklab,var(--destructive)_14%,transparent)] text-[var(--destructive-deep)] ring-1 ring-destructive/25">
                          <Landmark className="size-3.5" strokeWidth={1.75} aria-hidden />
                        </span>
                        <span className="font-sans text-[13.5px] font-semibold text-foreground sm:text-sm">I czytanie</span>
                      </span>
                      <span className="font-sans text-[11px] font-normal text-muted-foreground pl-9 sm:text-[12px]">
                        Debata w zarysie: czy ustawa w ogóle ma sens, nie poprawka po poprawce
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="border-t border-border/60 bg-muted/20 px-3 pb-4 pt-3 sm:px-4">
                    <P>
                      <strong className="text-foreground">Po co:</strong> izba poznaje cel i kierunek projektu,
                      wnioskodawca przedstawia uzasadnienie, posłowie pytają. To nie jest jeszcze głosowanie nad
                      każdym przepisem — raczej decyzja, czy iść dalej w szczegóły w komisji.
                    </P>
                    <P className="mt-3">
                      <strong className="text-foreground">Co może spaść i czemu:</strong>
                    </P>
                    <Ul>
                      <Li head="Skierowanie do komisji (jednej lub kilku)">
                        typowy wynik — dalsza robota idzie w mniejszym gronie specjalistów z danego obszaru.
                      </Li>
                      <Li head="Wniosek o odrzucenie projektu w całości">
                        jeśli I czytanie odbywa się na plenum, Sejm może od razu ubić cały projekt, gdy uzna go za
                        zły w całości (politycznie lub merytorycznie w pigułce).
                      </Li>
                    </Ul>
                    <P className="mt-3 text-[11.5px]">
                      Regulamin wymaga minimalnego odstępu od doręczenia druku posłom przed I czytaniem (zwykle co
                      najmniej kilka dni), żeby izba zdążyła się zapoznać.
                    </P>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem
                  value="komisja"
                  className="overflow-hidden rounded-xl border border-transparent px-1 transition-colors data-[state=open]:border-border data-[state=open]:bg-background/90 data-[state=open]:shadow-sm"
                >
                  <AccordionTrigger className="rounded-lg px-3 py-3.5 hover:no-underline hover:bg-muted/40">
                    <span className="flex flex-col gap-1 pr-2 text-left">
                      <span className="inline-flex items-center gap-2">
                        <span className="flex size-7 items-center justify-center rounded-lg bg-[color-mix(in_oklab,var(--destructive)_14%,transparent)] text-[var(--destructive-deep)] ring-1 ring-destructive/25">
                          <UsersRound className="size-3.5" strokeWidth={1.75} aria-hidden />
                        </span>
                        <span className="font-sans text-[13.5px] font-semibold text-foreground sm:text-sm">
                          Komisja (praca + sprawozdanie)
                        </span>
                      </span>
                      <span className="font-sans text-[11px] font-normal text-muted-foreground pl-9 sm:text-[12px]">
                        „Warsztat”: opinie, konsultacje, tekst roboczy — stąd osobny druk ze sprawozdaniem
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="border-t border-border/60 bg-muted/20 px-3 pb-4 pt-3 sm:px-4">
                    <P>
                      <strong className="text-foreground">Po co:</strong> ustawy są technicznie złożone; komisja
                      zbiera opinie organów (np. zgodność z UE przez BAS/BEOS), organizuje wysłuchania, negocjuje
                      brzmienie. Efekt to <strong className="text-foreground">sprawozdanie komisji</strong> — osobny
                      druk z rekomendacją dla Sejmu.
                    </P>
                    <P className="mt-3">
                      <strong className="text-foreground">Co może spaść i czemu:</strong>
                    </P>
                    <Ul>
                      <Li head="Przyjąć bez poprawek">
                        komisja uznaje rządowy / pierwotny tekst za dobry.
                      </Li>
                      <Li head="Przyjąć z poprawkami">
                        komisja składa jednolity tekst — to on trafia pod II czytanie.
                      </Li>
                      <Li head="Odrzucić w komisji">
                        sprawozdanie może rekomendować pełne odrzucenie; Sejm i tak głosuje na plenum, ale sygnał
                        jest mocno negatywny.
                      </Li>
                      <Li head="Wnioski mniejszości">
                        gdy co najmniej pięciu posłów napisem żąda głosowania nad odrzuconą w komisji wersją — trafia
                        do sali jako alternatywa przy II czytaniu.
                      </Li>
                    </Ul>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem
                  value="ii-czytanie"
                  className="overflow-hidden rounded-xl border border-transparent px-1 transition-colors data-[state=open]:border-border data-[state=open]:bg-background/90 data-[state=open]:shadow-sm"
                >
                  <AccordionTrigger className="rounded-lg px-3 py-3.5 hover:no-underline hover:bg-muted/40">
                    <span className="flex flex-col gap-1 pr-2 text-left">
                      <span className="inline-flex items-center gap-2">
                        <span className="flex size-7 items-center justify-center rounded-lg bg-[color-mix(in_oklab,var(--destructive)_14%,transparent)] text-[var(--destructive-deep)] ring-1 ring-destructive/25">
                          <ListChecks className="size-3.5" strokeWidth={1.75} aria-hidden />
                        </span>
                        <span className="font-sans text-[13.5px] font-semibold text-foreground sm:text-sm">II czytanie</span>
                      </span>
                      <span className="font-sans text-[11px] font-normal text-muted-foreground pl-9 sm:text-[12px]">
                        Plenum: sprawozdawca, debata, zgłaszanie poprawek — ostatnia szansa wycofania przez wnioskodawcę
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="border-t border-border/60 bg-muted/20 px-3 pb-4 pt-3 sm:px-4">
                    <P>
                      <strong className="text-foreground">Po co:</strong> otwarta debata nad konkretnym tekstem
                      sprawozdania; wnioskodawca, rząd, kluby i grupy posłów mogą składać <strong className="text-foreground">poprawki</strong>.
                      To moment, w którym widać polityczne i branżowe napięcia wprost na liście wniosków.
                    </P>
                    <P className="mt-3">
                      <strong className="text-foreground">Co może spaść i czemu:</strong>
                    </P>
                    <Ul>
                      <Li head="Nowe poprawki złożone na sali">
                        jeśli pojawią się świeże zmiany, regulamin zwykle odsyła sprawę z powrotem do komisji na{" "}
                        <strong className="text-foreground">dodatkowe sprawozdanie</strong> (kolejny druk) — żeby
                        izba nie głosowała „z marszu” nad tekstem, którego komisja nie rozpatrzyła.
                      </Li>
                      <Li head="Wycofanie przez wnioskodawcę">
                        Konstytucja daje prawo cofnięcia inicjatywy do końca II czytania — dalej już nie da się
                        „cicho” ustawić tematu.
                      </Li>
                    </Ul>
                    <P className="mt-3 text-[11.5px]">
                      Zwykle obowiązuje też minimalny odstęp od doręczenia sprawozdania posłom przed II czytaniem.
                    </P>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem
                  value="iii-czytanie"
                  className="overflow-hidden rounded-xl border border-transparent px-1 transition-colors data-[state=open]:border-border data-[state=open]:bg-background/90 data-[state=open]:shadow-sm"
                >
                  <AccordionTrigger className="rounded-lg px-3 py-3.5 hover:no-underline hover:bg-muted/40">
                    <span className="flex flex-col gap-1 pr-2 text-left">
                      <span className="inline-flex items-center gap-2">
                        <span className="flex size-7 items-center justify-center rounded-lg bg-[color-mix(in_oklab,var(--destructive)_14%,transparent)] text-[var(--destructive-deep)] ring-1 ring-destructive/25">
                          <Vote className="size-3.5" strokeWidth={1.75} aria-hidden />
                        </span>
                        <span className="font-sans text-[13.5px] font-semibold text-foreground sm:text-sm">III czytanie</span>
                      </span>
                      <span className="font-sans text-[11px] font-normal text-muted-foreground pl-9 sm:text-[12px]">
                        Regulaminowa kolej głosowań: najpierw „czy w ogóle”, potem poprawki, na końcu całość
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="border-t border-border/60 bg-muted/20 px-3 pb-4 pt-3 sm:px-4">
                    <P>
                      <strong className="text-foreground">Po co:</strong> uchwalić albo odrzucić ustawę w ostatecznym
                      brzmieniu. Marszałek nie może włożyć do głosowania poprawki, której komisja wcześniej nie
                      „dotknęła” (Konstytucja) — stąd ważność etapów komisji.
                    </P>
                    <P className="mt-3">
                      <strong className="text-foreground">Co może spaść i czemu:</strong>
                    </P>
                    <Ul>
                      <Li head="Głosowanie nad odrzuceniem projektu w całości">
                        jeśli taki wniosek padł — najpierw decyzja „czy ubijamy wszystko naraz”.
                      </Li>
                      <Li head="Głosowania nad pojedynczymi poprawkami">
                        w kolejności regulaminowej, czasem jedna poprawka „rozstrzyga” o innych.
                      </Li>
                      <Li head="Głosowanie w całości w ostatecznym brzmieniu">
                        sukces tutaj oznacza uchwalenie przez Sejm i przekazanie do Senatu oraz informowanie Prezydenta.
                      </Li>
                    </Ul>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem
                  value="senat"
                  className="overflow-hidden rounded-xl border border-transparent px-1 transition-colors data-[state=open]:border-border data-[state=open]:bg-background/90 data-[state=open]:shadow-sm"
                >
                  <AccordionTrigger className="rounded-lg px-3 py-3.5 hover:no-underline hover:bg-muted/40">
                    <span className="flex flex-col gap-1 pr-2 text-left">
                      <span className="inline-flex items-center gap-2">
                        <span className="flex size-7 items-center justify-center rounded-lg bg-slate-200/90 text-slate-900 ring-1 ring-slate-500/25 dark:bg-slate-800 dark:text-slate-100">
                          <Building2 className="size-3.5" strokeWidth={1.75} aria-hidden />
                        </span>
                        <span className="font-sans text-[13.5px] font-semibold text-foreground sm:text-sm">Senat</span>
                      </span>
                      <span className="font-sans text-[11px] font-normal text-muted-foreground pl-9 sm:text-[12px]">
                        Druga izba: może przyjąć, poprawić albo odrzucić — terminy zależą od rodzaju ustawy
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="border-t border-border/60 bg-muted/20 px-3 pb-4 pt-3 sm:px-4">
                    <P>
                      <strong className="text-foreground">Po co:</strong> drugie spojrzenie na tekst uchwalony przez
                      Sejm; Senat nie jest „doklejką”, bo jego poprawki albo odrzucenie wymuszają kolejne głosowania w
                      Sejmie (inna większość przy odrzuceniu poprawek senackich niż przy zwykłym głosowaniu).
                    </P>
                    <P className="mt-3">
                      <strong className="text-foreground">Co może spaść i czemu:</strong>
                    </P>
                    <Ul>
                      <Li head="Uchwała bez poprawek">
                        Senat akceptuje wersję sejmową — projekt idzie do Prezydenta.
                      </Li>
                      <Li head="Poprawki senackie">
                        Sejm musi rozpatrzyć każdą z osobna; przyjęte zmieniają tekst, odrzucone — wraca brzmienie
                        sejmowe.
                      </Li>
                      <Li head="Odrzucenie przez Senat („weto Senatu”)">
                        Sejm może nadrzeczyć decyzję większością bezwzględną (za więcej niż suma przeciw + wstrz.).
                      </Li>
                      <Li head="Brak uchwały Senatu w ustawowym terminie">
                        przy zwykłej ustawie ma to zwykle skutek przyjęcia wersji uchwalonej przez Sejm — inaczej jest
                        np. przy budżecie, ustawach w trybie przyspieszonym albo przy zmianie Konstytucji (inne
                        terminy i logika).
                      </Li>
                    </Ul>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem
                  value="prezydent"
                  className="overflow-hidden rounded-xl border border-transparent px-1 transition-colors data-[state=open]:border-border data-[state=open]:bg-background/90 data-[state=open]:shadow-sm"
                >
                  <AccordionTrigger className="rounded-lg px-3 py-3.5 hover:no-underline hover:bg-muted/40">
                    <span className="flex flex-col gap-1 pr-2 text-left">
                      <span className="inline-flex items-center gap-2">
                        <span className="flex size-7 items-center justify-center rounded-lg bg-violet-100/90 text-violet-950 ring-1 ring-violet-600/25 dark:bg-violet-950/40 dark:text-violet-50">
                          <PenLine className="size-3.5" strokeWidth={1.75} aria-hidden />
                        </span>
                        <span className="font-sans text-[13.5px] font-semibold text-foreground sm:text-sm">Prezydent</span>
                      </span>
                      <span className="font-sans text-[11px] font-normal text-muted-foreground pl-9 sm:text-[12px]">
                        Podpis, weto albo — w wąskim katalogu spraw — wniosek do Trybunału Konstytucyjnego
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="border-t border-border/60 bg-muted/20 px-3 pb-4 pt-3 sm:px-4">
                    <P>
                      <strong className="text-foreground">Po co:</strong> kontrola zgodności z Konstytucją i polityka
                      państwa; Prezydent nie jest notariuszem Sejmu — ma realne narzędzia opóźnienia lub zatrzymania
                      ustawy.
                    </P>
                    <P className="mt-3">
                      <strong className="text-foreground">Co może spaść i czemu:</strong>
                    </P>
                    <Ul>
                      <Li head="Podpis">
                        zgoda na promulgację — dalej publikacja w Dzienniku Ustaw lub Monitorze Polskim.
                      </Li>
                      <Li head="Weto (wniosek o ponowne rozpatrzenie)">
                        ustawa wraca do Sejmu; aby „przebić” weto, potrzebna jest kwalifikowana większość 3/5 obecnych
                        przy quorum, gdy ustawa ma wejść w życie mimo sprzeciwu Prezydenta.
                      </Li>
                      <Li head="Wniosek do TK (kontrola prewencyjna)">
                        w dopuszczalnych typach spraw zatrzymuje zegar podpisu do orzeczenia Trybunału.
                      </Li>
                    </Ul>
                    <P className="mt-3 text-[11.5px]">
                      Czas na decyzję Prezydenta jest krótszy m.in. przy budżecie i w trybie przyspieszonym niż przy
                      zwykłej ustawie.
                    </P>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem
                  value="koniec"
                  className="overflow-hidden rounded-xl border border-transparent px-1 transition-colors data-[state=open]:border-border data-[state=open]:bg-background/90 data-[state=open]:shadow-sm"
                >
                  <AccordionTrigger className="rounded-lg px-3 py-3.5 hover:no-underline hover:bg-muted/40">
                    <span className="flex flex-col gap-1 pr-2 text-left">
                      <span className="inline-flex items-center gap-2">
                        <span className="flex size-7 items-center justify-center rounded-lg bg-[color-mix(in_oklab,var(--success)_18%,var(--muted))] text-[var(--success)] ring-1 ring-[color-mix(in_oklab,var(--success)_45%,transparent)]">
                          <BookMarked className="size-3.5" strokeWidth={1.75} aria-hidden />
                        </span>
                        <span className="font-sans text-[13.5px] font-semibold text-foreground sm:text-sm">
                          Publikacja i koniec ścieżki
                        </span>
                      </span>
                      <span className="font-sans text-[11px] font-normal text-muted-foreground pl-9 sm:text-[12px]">
                        Dziennik Ustaw / Monitor, vacatio legis, obowiązywanie — albo przerwanie bez ustawy
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="border-t border-border/60 bg-muted/20 px-3 pb-4 pt-3 sm:px-4">
                    <P>
                      <strong className="text-foreground">Po co:</strong> społeczeństwo musi wiedzieć, od kiedy obowiązuje
                      prawo; stąd obowiązkowa publikacja i zwykle vacatio legis (czas na przygotowanie urzędów i obywateli).
                    </P>
                    <P className="mt-3">
                      <strong className="text-foreground">Inne twarde zakończenia (nie tylko „ustawa poszła”):</strong>
                    </P>
                    <Ul>
                      <Li head="Odrzucony">
                        negatywne głosowanie w Sejmie, Senacie albo po wetach — procedura pada.
                      </Li>
                      <Li head="Wycofany">
                        decyzja wnioskodawcy (ostatnia realna szansa pod koniec II czytania).
                      </Li>
                      <Li head="Zwrot / braki formalne">
                        marszałek zwraca materiał do poprawy zanim ruszy merytoryczna ścieżka.
                      </Li>
                      <Li head="Wygaśnięcie na koniec kadencji">
                        większość prac nie przechodzi automatycznie do nowego Sejmu — trzeba składać od nowa (wyjątki,
                        np. inicjatywa obywatelska, są węższe).
                      </Li>
                    </Ul>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem
                  value="ui"
                  className="overflow-hidden rounded-xl border border-transparent px-1 transition-colors data-[state=open]:border-border data-[state=open]:bg-background/90 data-[state=open]:shadow-sm"
                >
                  <AccordionTrigger className="rounded-lg px-3 py-3.5 hover:no-underline hover:bg-muted/40">
                    <span className="flex flex-col gap-1 pr-2 text-left">
                      <span className="inline-flex items-center gap-2">
                        <span className="flex size-7 items-center justify-center rounded-lg bg-muted text-muted-foreground ring-1 ring-border">
                          <FileText className="size-3.5" strokeWidth={1.75} aria-hidden />
                        </span>
                        <span className="font-sans text-[13.5px] font-semibold text-foreground sm:text-sm">
                          Co z tego widać na tej stronie
                        </span>
                      </span>
                      <span className="font-sans text-[11px] font-normal text-muted-foreground pl-9 sm:text-[12px]">
                        Oś czasu, głosowania, dokumenty towarzyszące — jak to łączyć z powyższym
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="border-t border-border/60 bg-muted/20 px-3 pb-4 pt-3 sm:px-4">
                    <Ul>
                      <Li head="Wpisy osi">
                        to kolejne publiczne stany z API Sejmu; nazwa często mówi „I/II/III czytanie”, choć typ w danych
                        bywa ogólny — stąd na stronie łączymy typ z pełnym opisem wydarzenia.
                      </Li>
                      <Li head="Sekcja głosowań">
                        pokazuje, co faktycznie padło pod przycisk (odrzucenie całości, poprawki, całość, weto itd.).
                      </Li>
                      <Li head="Osobne druki">
                        sprawozdania, opinie, autopoprawki to osobne numery — na liście „dokumentów towarzyszących”
                        widać, które kroki były rozpisane na wiele publikacji Sejmu.
                      </Li>
                    </Ul>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-border bg-muted/40 px-5 py-4 sm:px-8 sm:flex-row sm:justify-end sm:rounded-b-xl">
            <Button type="button" className="w-full sm:w-auto font-sans shadow-sm" onClick={() => onOpenChange(false)}>
              Rozumiem
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
