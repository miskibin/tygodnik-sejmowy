"use client";

import {
  ArrowLeft,
  ArrowRight,
  Crown,
  FileSearch,
  FileSignature,
  HelpCircle,
  Info,
  Landmark,
  Megaphone,
  PenTool,
  ScrollText,
  Users,
  Vote,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Citizen-facing explainer of the legislative pipeline. Triggered by a "?"
// affordance on ProcessStageBar.
//
// Layout (mirrors the citizen mockup):
//   [num + icon column] | [text column] | ["Co dalej" column]
//   Vertical timeline line connects the numbered bullets on the left.
//
// Stage list goes deeper than ProcessStageBar's 7 buckets — readers
// asked about "I czytanie vs II czytanie vs III czytanie", which the bar
// collapses (Reading + ReadingReferral → first_reading; SejmReading →
// plenum). The explainer therefore shows ALL substantive procedural
// moments. Each row maps to a bar bucket via `bucket` (rendered as a
// subtle tag) so readers can connect the explainer back to the bar.

type Branch = {
  kind: "forward" | "back" | "terminal";
  label: string;
  detail?: string;
};

type StageRow = {
  step: number;
  key: string;
  label: string;
  bucket: string;
  blurb: string;
  detail: string;
  icon: LucideIcon;
  branches: Branch[];
};

const ROWS: StageRow[] = [
  {
    step: 1,
    key: "intake",
    label: "Wpłynęło",
    bucket: "WPŁYNĘŁO",
    blurb: "Projekt trafia do Sejmu.",
    detail:
      "Ustawę może zgłosić rząd, posłowie (klub poselski lub grupa co najmniej 15 posłów), Senat, Prezydent, komisja sejmowa albo 100 tysięcy obywateli przez inicjatywę obywatelską. To początek — projekt zostaje zarejestrowany i czeka na pierwsze omówienie.",
    icon: ScrollText,
    branches: [{ kind: "forward", label: "I czytanie", detail: "Zawsze następny krok." }],
  },
  {
    step: 2,
    key: "first_reading",
    label: "I czytanie",
    bucket: "I CZYTANIE",
    blurb: "Pierwsze formalne omówienie.",
    detail:
      "Marszałek Sejmu decyduje, gdzie trafi projekt: na salę plenarną (cały Sejm — dla najważniejszych spraw jak budżet czy zmiany konstytucji) albo bezpośrednio do komisji branżowej. Autorzy przedstawiają cele projektu, posłowie zadają pierwsze pytania.",
    icon: Megaphone,
    branches: [
      { kind: "forward", label: "Komisja", detail: "Standardowa droga — szczegółowa analiza." },
      { kind: "terminal", label: "Odrzucenie", detail: "Sejm może odrzucić projekt już na tym etapie." },
    ],
  },
  {
    step: 3,
    key: "committee_work",
    label: "Praca w komisji",
    bucket: "KOMISJA",
    blurb: "Branżowi eksperci analizują szczegóły.",
    detail:
      "Komisje sejmowe (np. zdrowia, finansów, kultury, sprawiedliwości) czytają projekt linijka po linijce, słuchają opinii ekspertów, organizacji społecznych, strony rządowej. Mogą wprowadzać poprawki. To zwykle najdłuższy etap — tygodnie albo miesiące. Tu zapada większość konkretnych decyzji o ostatecznym kształcie ustawy.",
    icon: FileSearch,
    branches: [
      { kind: "forward", label: "Sprawozdanie komisji", detail: "Komisja kończy pracę i przedstawia stanowisko Sejmowi." },
      { kind: "terminal", label: "Wycofanie", detail: "Wnioskodawcy mogą wycofać projekt." },
    ],
  },
  {
    step: 4,
    key: "committee_report",
    label: "Sprawozdanie komisji",
    bucket: "KOMISJA",
    blurb: "Komisja przedstawia stanowisko.",
    detail:
      "Komisja głosuje nad treścią projektu i przekazuje sprawozdanie Sejmowi. W sprawozdaniu wskazuje wszystkie wprowadzone poprawki oraz proponowane stanowisko: za przyjęciem, za odrzuceniem albo z dodatkowymi zmianami. Zazwyczaj wyznaczany jest poseł-sprawozdawca, który przedstawi raport na sali.",
    icon: FileSignature,
    branches: [
      { kind: "forward", label: "II czytanie", detail: "Plenum debatuje nad sprawozdaniem komisji." },
    ],
  },
  {
    step: 5,
    key: "second_reading",
    label: "II czytanie",
    bucket: "PLENUM",
    blurb: "Debata plenarna nad sprawozdaniem.",
    detail:
      "Wszyscy posłowie debatują nad projektem w wersji proponowanej przez komisję. Każdy klub przedstawia stanowisko, można zgłaszać nowe poprawki. Jeśli pojawią się świeże poprawki, projekt zazwyczaj wraca do komisji — to NORMALNE, a nie cofanie procesu.",
    icon: Users,
    branches: [
      { kind: "forward", label: "III czytanie", detail: "Jeśli nie ma nowych poprawek do analizy." },
      { kind: "back", label: "Komisja (poprawki)", detail: "Komisja analizuje świeże poprawki z plenum." },
    ],
  },
  {
    step: 6,
    key: "third_reading",
    label: "III czytanie",
    bucket: "PLENUM",
    blurb: "Finałowa debata i głosowania nad poprawkami.",
    detail:
      "Posłowie głosują nad pojedynczymi poprawkami (przyjąć / odrzucić), a potem nad CAŁOŚCIĄ ustawy. Sprawozdawca komisji może rekomendować, jak głosować. To moment, w którym ustala się ostateczna treść projektu — każda poprawka albo wchodzi, albo wypada.",
    icon: Vote,
    branches: [
      { kind: "forward", label: "Głosowanie nad całością", detail: "Po przegłosowaniu poprawek." },
    ],
  },
  {
    step: 7,
    key: "final_vote",
    label: "Głosowanie nad ustawą",
    bucket: "GŁOSOWANIE",
    blurb: "Finałowy głos w Sejmie.",
    detail:
      "Posłowie głosują nad PEŁNĄ wersją projektu po poprawkach. Wymagana zwykła większość — więcej głosów ZA niż PRZECIW, przy obecności co najmniej połowy posłów (kworum 230). Wynik głosowania jest publikowany imiennie — można sprawdzić, jak głosował każdy poseł.",
    icon: Vote,
    branches: [
      { kind: "forward", label: "Senat", detail: "Ustawa idzie do izby wyższej w 3 dni." },
      { kind: "terminal", label: "Odrzucenie", detail: "Za mało głosów ZA — proces się kończy." },
    ],
  },
  {
    step: 8,
    key: "senate",
    label: "Senat",
    bucket: "SENAT",
    blurb: "30 dni na stanowisko izby wyższej.",
    detail:
      "Senat ma trzy opcje: przyjąć ustawę bez zmian (idzie prosto do Prezydenta), wnieść poprawki (wraca do Sejmu), albo odrzucić w całości (wraca do Sejmu). Jeśli Senat milczy 30 dni — ustawa idzie dalej automatycznie. Budżet i pilne ustawy mają skrócone terminy.",
    icon: Landmark,
    branches: [
      { kind: "forward", label: "Prezydent", detail: "Bez zmian albo po rozpatrzeniu poprawek senackich." },
      { kind: "back", label: "Sejm głosuje znowu", detail: "Sejm bezwzględną większością może odrzucić senackie zmiany." },
    ],
  },
  {
    step: 9,
    key: "senate_consideration",
    label: "Rozpatrzenie poprawek Senatu",
    bucket: "SENAT",
    blurb: "Sejm reaguje na zmiany izby wyższej.",
    detail:
      "Jeśli Senat zgłosił poprawki lub odrzucił ustawę w całości, Sejm głosuje nad każdą poprawką osobno. Aby ODRZUCIĆ stanowisko Senatu, trzeba bezwzględnej większości (50% + 1 obecnych). Jeśli Sejm nie odrzuci — stanowisko Senatu wchodzi do ustawy.",
    icon: Users,
    branches: [
      { kind: "forward", label: "Prezydent", detail: "Po rozstrzygnięciu wszystkich poprawek." },
    ],
  },
  {
    step: 10,
    key: "president",
    label: "Prezydent",
    bucket: "PREZYDENT",
    blurb: "21 dni na decyzję głowy państwa.",
    detail:
      "Prezydent ma trzy opcje: PODPISAĆ (ustawa po publikacji w Dzienniku Ustaw zaczyna obowiązywać), ZAWETOWAĆ (Sejm może obalić weto większością 3/5 głosów przy obecności co najmniej połowy posłów), albo SKIEROWAĆ DO TRYBUNAŁU KONSTYTUCYJNEGO do oceny zgodności z konstytucją.",
    icon: PenTool,
    branches: [
      { kind: "forward", label: "Dziennik Ustaw", detail: "Po podpisie ustawa wchodzi w życie." },
      { kind: "back", label: "Sejm obala weto", detail: "Większością 3/5 głosów Sejm odrzuca weto Prezydenta." },
      { kind: "terminal", label: "Trybunał Konstytucyjny", detail: "Prezydent kieruje ustawę do oceny zgodności z konstytucją." },
    ],
  },
  {
    step: 11,
    key: "promulgation",
    label: "Publikacja w Dz.U.",
    bucket: "PREZYDENT",
    blurb: "Ustawa wchodzi w życie.",
    detail:
      "Po podpisie Prezydenta ustawa jest publikowana w Dzienniku Ustaw RP. Tekst zawiera datę wejścia w życie — często to 14 dni od publikacji (tzw. vacatio legis), ale ustawa może określać własny termin. Od tego momentu ustawa obowiązuje wszystkich.",
    icon: Crown,
    branches: [],
  },
];

function BranchPill({ branch }: { branch: Branch }) {
  const color =
    branch.kind === "forward"
      ? "var(--secondary-foreground)"
      : branch.kind === "back"
      ? "var(--destructive)"
      : "var(--muted-foreground)";
  const Icon = branch.kind === "back" ? ArrowLeft : branch.kind === "terminal" ? X : ArrowRight;
  return (
    <div className="flex items-start gap-2 mb-2 last:mb-0">
      <Icon size={11} strokeWidth={2.5} style={{ color, marginTop: 4, flexShrink: 0 }} />
      <div className="flex-1 min-w-0">
        <div
          className="font-mono uppercase tracking-[0.08em]"
          style={{ fontSize: 10.5, color, fontWeight: 600, marginBottom: 1 }}
        >
          {branch.label}
        </div>
        {branch.detail && (
          <div className="font-sans text-[11px] text-muted-foreground leading-snug">
            {branch.detail}
          </div>
        )}
      </div>
    </div>
  );
}

function StageIcon({ Icon }: { Icon: LucideIcon }) {
  return (
    <div
      className="flex items-center justify-center rounded-full shrink-0"
      style={{
        width: 72,
        height: 72,
        background: "var(--muted)",
        color: "var(--secondary-foreground)",
      }}
    >
      <Icon size={32} strokeWidth={1.5} />
    </div>
  );
}

function StepBadge({ n }: { n: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-full shrink-0 font-mono font-medium"
      style={{
        width: 28,
        height: 28,
        background: "var(--destructive)",
        color: "white",
        fontSize: 12,
      }}
      aria-hidden
    >
      {n}
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

      <DialogContent className="max-w-[calc(100%-1rem)] sm:max-w-5xl max-h-[92vh] overflow-y-auto p-0">
        <div className="px-8 pt-8 pb-5 text-center border-b border-border">
          <DialogHeader className="items-center">
            <DialogTitle
              className="font-serif font-medium"
              style={{ fontSize: 32, letterSpacing: "-0.02em", lineHeight: 1.1 }}
            >
              Jak powstaje ustawa w Sejmie
            </DialogTitle>
            <DialogDescription
              className="text-sm max-w-2xl mx-auto mt-2"
              style={{ lineHeight: 1.55 }}
            >
              Jedenaście etapów, przez które przechodzi każdy projekt — od
              wpłynięcia do publikacji w Dzienniku Ustaw. Pasek nad ustawą
              pokazuje, na którym etapie jest konkretna sprawa.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-8 py-6">
          <div
            className="rounded-md flex items-start gap-3 p-4 mb-6"
            style={{ background: "var(--muted)" }}
          >
            <div
              className="rounded-full flex items-center justify-center shrink-0"
              style={{ width: 36, height: 36, background: "var(--destructive)" }}
            >
              <Info size={18} color="white" strokeWidth={2} />
            </div>
            <div className="text-[13.5px] leading-relaxed pt-1">
              <strong className="font-medium">Proces nie zawsze idzie do przodu.</strong>{" "}
              Projekt może wrócić do komisji po poprawkach, Senat może zawrócić
              ustawę, Sejm może odrzucić prezydenckie weto. Każde &quot;cofnięcie&quot;
              to szansa na dopracowanie albo zatrzymanie ustawy — a nie porażka.
            </div>
          </div>

          <ol
            className="list-none p-0 m-0 relative"
            style={
              {
                // Vertical timeline line connecting step badges. Positioned
                // to align with the centre of the step circles (left padding
                // + half circle width = 14px from list-item left edge).
                "--timeline-x": "14px",
              } as React.CSSProperties
            }
          >
            <div
              aria-hidden
              className="absolute top-0 bottom-0"
              style={{
                left: "var(--timeline-x)",
                width: 1,
                background: "var(--border)",
              }}
            />

            {ROWS.map((row, idx) => {
              const Icon = row.icon;
              const isLast = idx === ROWS.length - 1;
              return (
                <li
                  key={row.key}
                  className="relative grid gap-5 pl-0 pr-0 mb-6 last:mb-0"
                  style={{
                    gridTemplateColumns: "28px 88px 1fr 260px",
                    alignItems: "start",
                  }}
                >
                  <div className="flex items-center justify-center" style={{ zIndex: 1 }}>
                    <StepBadge n={row.step} />
                  </div>

                  <StageIcon Icon={Icon} />

                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                      <h3
                        className="font-serif font-medium m-0"
                        style={{ fontSize: 19, letterSpacing: "-0.005em" }}
                      >
                        {row.label}
                      </h3>
                      <span
                        className="font-mono uppercase tracking-[0.1em] text-muted-foreground"
                        style={{ fontSize: 9.5 }}
                      >
                        pasek: {row.bucket}
                      </span>
                    </div>
                    <p className="font-sans text-[13px] text-muted-foreground italic m-0 mb-2">
                      {row.blurb}
                    </p>
                    <p
                      className="font-serif text-secondary-foreground m-0"
                      style={{
                        fontSize: 14,
                        lineHeight: 1.6,
                        textWrap: "pretty" as never,
                      }}
                    >
                      {row.detail}
                    </p>
                  </div>

                  {row.branches.length > 0 ? (
                    <div
                      className="rounded-md p-4 self-start"
                      style={{ background: "var(--muted)" }}
                    >
                      <div
                        className="font-mono uppercase tracking-[0.12em] text-muted-foreground mb-3"
                        style={{ fontSize: 10, fontWeight: 600 }}
                      >
                        Co dalej
                      </div>
                      {row.branches.map((b, i) => (
                        <BranchPill key={i} branch={b} />
                      ))}
                    </div>
                  ) : (
                    <div
                      className="rounded-md p-4 self-start text-[12px] italic text-muted-foreground"
                      style={{ background: "var(--muted)" }}
                    >
                      Koniec drogi ustawy — od tej chwili obowiązuje.
                    </div>
                  )}
                </li>
              );
            })}
          </ol>

          <div
            className="mt-8 pt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11.5px] text-muted-foreground font-sans"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <span className="font-mono uppercase tracking-[0.12em]" style={{ fontSize: 10 }}>
              Legenda
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ArrowRight size={12} style={{ color: "var(--secondary-foreground)" }} />
              następny krok
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ArrowLeft size={12} style={{ color: "var(--destructive)" }} />
              możliwość cofnięcia
            </span>
            <span className="inline-flex items-center gap-1.5">
              <X size={12} />
              możliwe zakończenie procesu
            </span>
            <span className="ml-auto">
              Źródło:{" "}
              <a
                href="https://www.sejm.gov.pl/Sejm10.nsf/proces.xsp"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
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
