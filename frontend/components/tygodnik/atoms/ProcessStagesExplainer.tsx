"use client";

import { ArrowRight, ArrowLeft, HelpCircle, X } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Citizen-facing explainer of the 7-step legislative pipeline rendered by
// ProcessStageBar. Triggered by a "?" affordance next to the bar.
//
// Two design choices driven by citizen review:
//   1. Plain Polish, no jargon ("subsydiarność", "tryb pilny" out).
//   2. Each step shows BRANCH OPTIONS, not just the happy path. The bar
//      can move backwards (committee revisits after II czytanie; Sejm
//      re-votes after Senate amendments; Sejm overrides presidential
//      veto with 3/5 majority). Without branches the bar reads as
//      one-way which is misleading.

type Branch = {
  kind: "forward" | "back" | "terminal";
  label: string;
  detail?: string;
};

type StageExplainer = {
  step: number;
  key: string;
  label: string;
  blurb: string;
  detail: string;
  branches: Branch[];
};

const STAGES: StageExplainer[] = [
  {
    step: 1,
    key: "intake",
    label: "Wpłynęło",
    blurb: "Projekt trafia do Sejmu.",
    detail:
      "Ustawę może zgłosić rząd, posłowie (klub poselski lub grupa 15 posłów), Senat, Prezydent, komisja sejmowa albo 100 tysięcy obywateli przez inicjatywę obywatelską. To początek — nic jeszcze nie zostało zdecydowane, projekt czeka na pierwsze omówienie.",
    branches: [
      { kind: "forward", label: "I czytanie", detail: "Zawsze następny krok." },
    ],
  },
  {
    step: 2,
    key: "first_reading",
    label: "I czytanie",
    blurb: "Pierwsze formalne omówienie.",
    detail:
      "Marszałek Sejmu kieruje projekt albo bezpośrednio na salę plenarną (cały Sejm), albo do komisji branżowej — zależnie od wagi tematu. Autorzy przedstawiają cele, posłowie zapoznają się z treścią.",
    branches: [
      { kind: "forward", label: "Komisja", detail: "Standardowa droga — szczegółowa analiza." },
      { kind: "terminal", label: "Odrzucenie", detail: "Sejm może odrzucić projekt już na tym etapie." },
    ],
  },
  {
    step: 3,
    key: "committee",
    label: "Komisja",
    blurb: "Branżowi eksperci analizują szczegóły.",
    detail:
      "Komisje sejmowe (np. zdrowia, finansów, kultury) czytają projekt linijka po linijce, słuchają opinii ekspertów, organizacji społecznych i strony rządowej. Mogą wprowadzać poprawki. To zwykle najdłuższy etap — tygodnie lub miesiące — tu zapada większość konkretnych decyzji o ostatecznym kształcie ustawy.",
    branches: [
      { kind: "forward", label: "Plenum (II czytanie)", detail: "Komisja przedstawia sprawozdanie z poprawkami." },
      { kind: "terminal", label: "Wycofanie", detail: "Wnioskodawcy mogą wycofać projekt." },
    ],
  },
  {
    step: 4,
    key: "plenum",
    label: "Plenum",
    blurb: "II i III czytanie na sali Sejmu.",
    detail:
      "Wszyscy posłowie debatują nad projektem na sali plenarnej. Każdy klub przedstawia stanowisko, można zgłaszać nowe poprawki. Po II czytaniu komisja często analizuje świeże poprawki przed III czytaniem — wtedy proces wraca chwilowo do etapu KOMISJA. To NORMALNE i nie oznacza, że projekt zawraca.",
    branches: [
      { kind: "forward", label: "Głosowanie", detail: "Po III czytaniu — finałowy głos." },
      { kind: "back", label: "← Komisja", detail: "Jeśli pojawiły się nowe poprawki wymagające analizy." },
    ],
  },
  {
    step: 5,
    key: "vote",
    label: "Głosowanie",
    blurb: "Posłowie głosują nad finałową wersją.",
    detail:
      "Wymagana jest zwykła większość — więcej głosów ZA niż PRZECIW, przy obecności co najmniej połowy posłów (kworum). Każdy klub poselski wcześniej ogłasza, jak będzie głosować, ale poszczególni posłowie mogą głosować inaczej.",
    branches: [
      { kind: "forward", label: "Senat", detail: "Ustawa idzie do izby wyższej." },
      { kind: "terminal", label: "Odrzucenie", detail: "Za mało głosów ZA — proces się kończy." },
    ],
  },
  {
    step: 6,
    key: "senate",
    label: "Senat",
    blurb: "30 dni na stanowisko izby wyższej.",
    detail:
      "Senat ma trzy opcje: przyjąć ustawę bez zmian (idzie do Prezydenta), wnieść poprawki (wraca do Sejmu) albo odrzucić w całości (wraca do Sejmu). Jeśli Senat milczy 30 dni — ustawa idzie dalej automatycznie.",
    branches: [
      { kind: "forward", label: "Prezydent", detail: "Bez poprawek lub po przyjęciu/odrzuceniu poprawek senackich." },
      { kind: "back", label: "← Sejm głosuje znowu", detail: "Sejm bezwzględną większością może odrzucić senackie zmiany." },
    ],
  },
  {
    step: 7,
    key: "president",
    label: "Prezydent",
    blurb: "21 dni na decyzję.",
    detail:
      "Prezydent ma trzy opcje: podpisać (ustawa po publikacji w Dzienniku Ustaw zaczyna obowiązywać), zawetować, albo skierować do Trybunału Konstytucyjnego do oceny zgodności z konstytucją.",
    branches: [
      { kind: "forward", label: "Dziennik Ustaw", detail: "Po podpisie — ustawa wchodzi w życie." },
      { kind: "back", label: "← Sejm odrzuca weto", detail: "Większością 3/5 głosów Sejm może obalić weto Prezydenta." },
      { kind: "terminal", label: "Trybunał Konstytucyjny", detail: "Prezydent może żądać sprawdzenia zgodności z konstytucją." },
    ],
  },
];

function BranchPill({ branch }: { branch: Branch }) {
  const color =
    branch.kind === "forward"
      ? "var(--secondary-foreground)"
      : branch.kind === "back"
      ? "var(--destructive)"
      : "var(--muted-foreground)";
  const Icon =
    branch.kind === "back" ? ArrowLeft : branch.kind === "terminal" ? X : ArrowRight;
  return (
    <div className="flex items-start gap-2">
      <span
        className="inline-flex items-center gap-1.5 font-mono uppercase tracking-[0.08em] shrink-0"
        style={{ fontSize: 10, color, paddingTop: 2 }}
      >
        <Icon size={11} strokeWidth={2} />
        {branch.label}
      </span>
      {branch.detail && (
        <span className="font-sans text-[11.5px] text-muted-foreground leading-relaxed">
          {branch.detail}
        </span>
      )}
    </div>
  );
}

export function ProcessStagesExplainer() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="Jak działa proces legislacyjny — wyjaśnienie"
          className="inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors shrink-0"
          style={{ width: 18, height: 18 }}
        >
          <HelpCircle size={14} strokeWidth={1.75} />
        </button>
      </DialogTrigger>

      <DialogContent
        className="max-w-[calc(100%-1.5rem)] sm:max-w-4xl max-h-[90vh] overflow-y-auto p-0"
      >
        <div className="px-6 pt-6 pb-4 border-b border-border sticky top-0 bg-popover z-10">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">
              Jak powstaje ustawa w Sejmie
            </DialogTitle>
            <DialogDescription className="text-sm">
              Siedem etapów, przez które przechodzi każdy projekt — od wpłynięcia
              do podpisu Prezydenta. Pasek pokazuje, na którym etapie jest
              konkretna ustawa.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6">
          <div
            className="mt-4 mb-5 rounded-md border-l-2 px-3 py-2 text-[13px] leading-relaxed"
            style={{ borderColor: "var(--destructive)", background: "var(--muted)" }}
          >
            <strong className="font-medium">Proces nie zawsze idzie do przodu.</strong>{" "}
            Projekt może wrócić do komisji po poprawkach, Senat może zawrócić
            ustawę, Sejm może odrzucić prezydenckie weto. Każde &quot;cofnięcie&quot; to
            szansa na dopracowanie albo zatrzymanie ustawy — a nie porażka.
          </div>

          <ol className="list-none p-0 m-0 space-y-5">
            {STAGES.map((stage) => (
              <li
                key={stage.key}
                className="grid gap-6 pb-5 border-b border-border last:border-b-0 last:pb-0"
                style={{ gridTemplateColumns: "auto 1fr 240px" }}
              >
                <div
                  className="font-serif font-medium leading-none"
                  style={{ color: "var(--destructive)", fontSize: 32, paddingTop: 2 }}
                >
                  {stage.step}
                </div>

                <div className="min-w-0">
                  <h3
                    className="font-serif font-medium m-0 mb-1 uppercase tracking-wide"
                    style={{ fontSize: 13, letterSpacing: "0.08em" }}
                  >
                    {stage.label}
                  </h3>
                  <p className="font-sans text-[12.5px] text-muted-foreground m-0 mb-2 italic">
                    {stage.blurb}
                  </p>
                  <p
                    className="font-serif text-secondary-foreground m-0"
                    style={{ fontSize: 14, lineHeight: 1.55, textWrap: "pretty" as never }}
                  >
                    {stage.detail}
                  </p>
                </div>

                <div
                  className="rounded-md p-3 self-start"
                  style={{ background: "var(--muted)" }}
                >
                  <div
                    className="font-mono uppercase tracking-[0.1em] text-muted-foreground mb-2"
                    style={{ fontSize: 9.5 }}
                  >
                    Co dalej
                  </div>
                  <div className="space-y-2">
                    {stage.branches.map((b, i) => (
                      <BranchPill key={i} branch={b} />
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ol>

          <div
            className="mt-5 flex flex-wrap gap-3 text-[11px] text-muted-foreground font-sans"
            style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}
          >
            <span className="inline-flex items-center gap-1">
              <ArrowRight size={11} style={{ color: "var(--secondary-foreground)" }} />
              dalej w procesie
            </span>
            <span className="inline-flex items-center gap-1">
              <ArrowLeft size={11} style={{ color: "var(--destructive)" }} />
              wraca do wcześniejszego etapu
            </span>
            <span className="inline-flex items-center gap-1">
              <X size={11} />
              proces się kończy
            </span>
            <span className="ml-auto">
              Źródło:{" "}
              <a
                href="https://www.sejm.gov.pl/Sejm10.nsf/proces.xsp"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                procedura legislacyjna Sejmu RP
              </a>
            </span>
          </div>
        </div>

        <DialogClose className="sr-only">Zamknij</DialogClose>
      </DialogContent>
    </Dialog>
  );
}
