"use client";

import type { ReactNode } from "react";
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

// Citizen-facing explainer of the Polish legislative pipeline. Text was
// cross-checked against the Constitution (art. 118-123) and the Sejm
// Standing Orders (Regulamin Sejmu, art. 32, 37, 41-50). Each row carries
// a `sources` field with legal citations so a sceptical reader can verify.
//
// Common corrections from the legal review:
//   - "Bezwzględna większość" is NOT "50% obecnych + 1" — that's quorum.
//     It's "więcej ZA niż PRZECIW + WSTRZYMUJĄCYCH razem" (art. 121 ust. 3).
//   - Senate deadline is NOT one number: 30 dni (standard) / 20 dni
//     (budget — can only amend, can't reject) / 14 dni (urgent).
//   - First-reading-on-plenum list is closed and specific (art. 37 ust. 2
//     Reg.): konstytucja, budżet, podatki, wyborcze, ustrojowe, kodeksy.
//   - Presidential 21-day clock STOPS when the bill is referred to the
//     Constitutional Tribunal; resumes on judgment. Urgent track: 7 dni.
//   - Withdrawal is allowed up to the END OF SECOND READING, not only in
//     committee (art. 119 ust. 4 Konstytucji).

type Branch = {
  kind: "forward" | "back" | "terminal";
  label: string;
  detail?: string;
};

type StageRow = {
  key: string;
  label: string;
  bucket: string;
  blurb: string;
  detail: ReactNode;
  icon: LucideIcon;
  branches: Branch[];
  sources: string[];
};

const ROWS: StageRow[] = [
  {
    key: "intake",
    label: "Wpłynęło",
    bucket: "WPŁYNĘŁO",
    blurb: "Projekt trafia do Sejmu.",
    detail: (
      <>
        Ustawę może zgłosić <strong>rząd</strong>, <strong>posłowie</strong>{" "}
        (klub poselski albo grupa <strong>co najmniej 15 posłów</strong>),{" "}
        <strong>Senat</strong>, <strong>Prezydent</strong>,{" "}
        <strong>komisja sejmowa</strong> albo{" "}
        <strong>100 tysięcy obywateli</strong> przez inicjatywę obywatelską.
        Każdy wnioskodawca musi przedstawić skutki finansowe projektu. To
        początek — projekt zostaje zarejestrowany i czeka na pierwsze omówienie.
      </>
    ),
    icon: ScrollText,
    branches: [{ kind: "forward", label: "I czytanie", detail: "Zawsze następny krok." }],
    sources: ["Art. 118 Konstytucji RP", "Art. 32 ust. 2 Regulaminu Sejmu"],
  },
  {
    key: "first_reading",
    label: "I czytanie",
    bucket: "I CZYTANIE",
    blurb: "Pierwsze formalne omówienie.",
    detail: (
      <>
        Marszałek Sejmu decyduje, gdzie trafi projekt: na{" "}
        <strong>salę plenarną</strong> (cały Sejm) albo bezpośrednio do{" "}
        <strong>komisji branżowej</strong>. Na salę plenarną idą{" "}
        <strong>zawsze</strong>: zmiany Konstytucji, ustawy budżetowe i
        podatkowe, ustawy wyborcze (Prezydenta, Sejmu, Senatu, samorządu),
        regulujące ustrój i właściwość władz publicznych oraz{" "}
        <strong>kodeksy</strong>. Pozostałe trafiają najpierw do komisji.
        Pierwsze czytanie odbywa się <strong>nie wcześniej niż 7 dni</strong> od
        doręczenia druku posłom.
      </>
    ),
    icon: Megaphone,
    branches: [
      { kind: "forward", label: "Komisja", detail: "Standardowa droga — szczegółowa analiza." },
      { kind: "terminal", label: "Odrzucenie", detail: "Sejm może odrzucić projekt w I czytaniu." },
    ],
    sources: ["Art. 37 ust. 2 i 4 Regulaminu Sejmu", "Art. 39 Regulaminu Sejmu"],
  },
  {
    key: "committee_work",
    label: "Praca w komisji",
    bucket: "KOMISJA",
    blurb: "Branżowi eksperci analizują szczegóły.",
    detail: (
      <>
        Komisje sejmowe (np. zdrowia, finansów, kultury, sprawiedliwości)
        czytają projekt linijka po linijce, słuchają opinii ekspertów,
        organizacji społecznych, strony rządowej. Mogą wprowadzać poprawki. To
        zwykle <strong>najdłuższy etap</strong> — tygodnie albo miesiące. Tu
        zapada większość konkretnych decyzji o ostatecznym kształcie ustawy.{" "}
        <strong>Wnioskodawca może wycofać projekt do końca II czytania.</strong>
      </>
    ),
    icon: FileSearch,
    branches: [
      { kind: "forward", label: "Sprawozdanie komisji", detail: "Komisja kończy pracę i przedstawia stanowisko Sejmowi." },
      { kind: "terminal", label: "Wycofanie", detail: "Wnioskodawca może wycofać projekt do końca II czytania." },
    ],
    sources: ["Art. 41-46 Regulaminu Sejmu", "Art. 119 ust. 4 Konstytucji RP"],
  },
  {
    key: "committee_report",
    label: "Sprawozdanie komisji",
    bucket: "KOMISJA",
    blurb: "Komisja przedstawia stanowisko.",
    detail: (
      <>
        Komisja głosuje nad treścią projektu i przekazuje sprawozdanie Sejmowi.
        W sprawozdaniu wskazuje <strong>wszystkie wprowadzone poprawki</strong>{" "}
        oraz proponowane stanowisko: za przyjęciem, za odrzuceniem albo z
        dodatkowymi zmianami. Wyznaczany jest <strong>poseł-sprawozdawca</strong>,
        który przedstawi raport na sali.
      </>
    ),
    icon: FileSignature,
    branches: [
      { kind: "forward", label: "II czytanie", detail: "Plenum debatuje nad sprawozdaniem komisji." },
    ],
    sources: ["Art. 43 Regulaminu Sejmu"],
  },
  {
    key: "second_reading",
    label: "II czytanie",
    bucket: "PLENUM",
    blurb: "Debata plenarna nad sprawozdaniem.",
    detail: (
      <>
        Wszyscy posłowie debatują nad projektem w wersji proponowanej przez
        komisję. Każdy klub przedstawia stanowisko. Można zgłaszać{" "}
        <strong>nowe poprawki</strong> ALBO złożyć{" "}
        <strong>wniosek o odrzucenie projektu w całości</strong>. Jeśli pojawią
        się świeże poprawki, projekt zazwyczaj wraca do komisji — to{" "}
        <strong>NORMALNE, a nie cofanie procesu</strong>. To również{" "}
        <strong>ostatni moment</strong>, w którym wnioskodawca może wycofać
        projekt.
      </>
    ),
    icon: Users,
    branches: [
      { kind: "forward", label: "III czytanie", detail: "Jeśli nie ma nowych poprawek do analizy." },
      { kind: "back", label: "Komisja (poprawki)", detail: "Komisja analizuje świeże poprawki z plenum." },
      { kind: "terminal", label: "Odrzucenie", detail: "Sejm może odrzucić projekt na wniosek złożony w II czytaniu." },
    ],
    sources: ["Art. 44 i 47 Regulaminu Sejmu", "Art. 119 ust. 4 Konstytucji RP"],
  },
  {
    key: "third_reading",
    label: "III czytanie",
    bucket: "PLENUM",
    blurb: "Finałowa debata i głosowania nad poprawkami.",
    detail: (
      <>
        Posłowie głosują nad <strong>pojedynczymi poprawkami</strong> (przyjąć
        / odrzucić), a potem nad <strong>CAŁOŚCIĄ ustawy</strong>. Sprawozdawca
        komisji może rekomendować, jak głosować. To moment, w którym ustala się
        ostateczna treść projektu — każda poprawka albo wchodzi, albo wypada.
      </>
    ),
    icon: Vote,
    branches: [
      { kind: "forward", label: "Głosowanie nad całością", detail: "Po przegłosowaniu wszystkich poprawek." },
    ],
    sources: ["Art. 48-50 Regulaminu Sejmu"],
  },
  {
    key: "final_vote",
    label: "Głosowanie nad ustawą",
    bucket: "GŁOSOWANIE",
    blurb: "Finałowy głos w Sejmie.",
    detail: (
      <>
        Posłowie głosują nad PEŁNĄ wersją projektu po poprawkach. Wymagana{" "}
        <strong>zwykła większość</strong> — więcej głosów ZA niż PRZECIW (głosy
        wstrzymujące się nie liczą), przy obecności co najmniej{" "}
        <strong>połowy posłów</strong> (<strong>kworum 230</strong> z 460).
        Wynik głosowania jest publikowany imiennie — można sprawdzić, jak
        głosował każdy poseł.
      </>
    ),
    icon: Vote,
    branches: [
      { kind: "forward", label: "Senat", detail: "Marszałek przekazuje uchwaloną ustawę do Senatu w 3 dni." },
      { kind: "terminal", label: "Odrzucenie", detail: "Za mało głosów ZA — proces się kończy." },
    ],
    sources: ["Art. 120 Konstytucji RP"],
  },
  {
    key: "senate",
    label: "Senat",
    bucket: "SENAT",
    blurb: "Stanowisko izby wyższej.",
    detail: (
      <>
        Senat ma trzy opcje: <strong>przyjąć ustawę bez zmian</strong> (idzie
        prosto do Prezydenta), <strong>wnieść poprawki</strong> (wraca do
        Sejmu), albo <strong>odrzucić w całości</strong> (wraca do Sejmu).
        Jeśli Senat milczy — ustawa idzie dalej automatycznie. Termin zależy od
        trybu: <strong>30 dni</strong> dla zwykłej ustawy,{" "}
        <strong>20 dni</strong> dla budżetu (przy czym Senat{" "}
        <strong>nie może odrzucić budżetu w całości</strong> — tylko zgłosić
        poprawki), <strong>14 dni</strong> dla ustaw w trybie pilnym.
      </>
    ),
    icon: Landmark,
    branches: [
      { kind: "forward", label: "Prezydent", detail: "Bez zmian albo po rozpatrzeniu poprawek senackich." },
      { kind: "back", label: "Sejm głosuje znowu", detail: "Jeśli Senat zgłosił poprawki lub odrzucił ustawę." },
    ],
    sources: [
      "Art. 121 Konstytucji RP",
      "Art. 123 ust. 3 Konstytucji RP (tryb pilny)",
      "Art. 223 Konstytucji RP (budżet)",
    ],
  },
  {
    key: "senate_consideration",
    label: "Rozpatrzenie poprawek Senatu",
    bucket: "SENAT",
    blurb: "Sejm reaguje na zmiany izby wyższej.",
    detail: (
      <>
        Jeśli Senat zgłosił poprawki lub odrzucił ustawę w całości, Sejm głosuje
        nad każdą poprawką osobno. Aby ODRZUCIĆ stanowisko Senatu, potrzeba{" "}
        <strong>bezwzględnej większości</strong> — więcej głosów ZA odrzuceniem
        niż <strong>PRZECIW i WSTRZYMUJĄCYCH razem</strong>, przy obecności co
        najmniej połowy posłów. Jeśli Sejmowi nie uda się zebrać tej większości
        — stanowisko Senatu wchodzi do ustawy.
      </>
    ),
    icon: Users,
    branches: [
      { kind: "forward", label: "Prezydent", detail: "Po rozstrzygnięciu wszystkich poprawek Senatu." },
    ],
    sources: ["Art. 121 ust. 3 Konstytucji RP"],
  },
  {
    key: "president",
    label: "Prezydent",
    bucket: "PREZYDENT",
    blurb: "Decyzja głowy państwa.",
    detail: (
      <>
        Prezydent ma trzy opcje: <strong>PODPISAĆ</strong> (ustawa po publikacji
        w Dzienniku Ustaw zaczyna obowiązywać), <strong>ZAWETOWAĆ</strong>{" "}
        (Sejm może obalić weto większością <strong>3/5 głosów</strong> przy
        obecności co najmniej połowy posłów), albo{" "}
        <strong>skierować do Trybunału Konstytucyjnego</strong> — wtedy bieg
        terminu jest <strong>wstrzymany</strong> do orzeczenia TK. Standardowy
        termin to <strong>21 dni</strong>, ale tylko <strong>7 dni</strong> w
        trybie pilnym i również <strong>7 dni</strong> po obaleniu weta przez
        Sejm. Po wcześniejszym wecie Prezydent nie może już ponownie wetować ani
        kierować ustawy do TK.
      </>
    ),
    icon: PenTool,
    branches: [
      { kind: "forward", label: "Dziennik Ustaw", detail: "Po podpisie ustawa wchodzi w życie." },
      { kind: "back", label: "Sejm obala weto", detail: "Większością 3/5 głosów Sejm odrzuca weto Prezydenta." },
      { kind: "terminal", label: "Trybunał Konstytucyjny", detail: "Prezydent kieruje ustawę do oceny zgodności z konstytucją." },
    ],
    sources: [
      "Art. 122 Konstytucji RP",
      "Art. 123 ust. 3 Konstytucji RP (tryb pilny)",
    ],
  },
  {
    key: "promulgation",
    label: "Publikacja w Dz.U.",
    bucket: "PREZYDENT",
    blurb: "Ustawa wchodzi w życie.",
    detail: (
      <>
        Po podpisie Prezydenta ustawa jest publikowana w{" "}
        <strong>Dzienniku Ustaw RP</strong>. Tekst zawiera datę wejścia w życie
        — standardowo <strong>14 dni od ogłoszenia</strong> (tzw.{" "}
        <strong>vacatio legis</strong>), ale ustawa może określać własny termin
        (krótszy lub dłuższy). Od tego momentu ustawa obowiązuje wszystkich.
      </>
    ),
    icon: Crown,
    branches: [],
    sources: [
      "Art. 122 ust. 2 Konstytucji RP",
      "Art. 4 ust. 1 ustawy o ogłaszaniu aktów normatywnych",
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
      className="flex items-center justify-center rounded-full shrink-0 relative"
      style={{
        width: 72,
        height: 72,
        background: "var(--muted)",
        color: "var(--secondary-foreground)",
        // Sits above the timeline line — without an explicit z-index the
        // dashed line shows through the disc and breaks the visual.
        zIndex: 1,
      }}
    >
      <Icon size={32} strokeWidth={1.5} />
    </div>
  );
}

function LegalSources({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div
      className="mt-3 pt-2 font-mono text-[10px] text-muted-foreground leading-snug"
      style={{ borderTop: "1px dashed var(--border)", letterSpacing: "0.02em" }}
    >
      <span
        className="uppercase tracking-[0.12em] mr-2"
        style={{ fontSize: 9, fontWeight: 600 }}
      >
        Podstawa prawna
      </span>
      {items.map((s, i) => (
        <span key={i}>
          {i > 0 && <span aria-hidden> · </span>}
          {s}
        </span>
      ))}
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

      <DialogContent className="max-w-[calc(100%-1rem)] sm:max-w-6xl lg:max-w-[1280px] max-h-[92vh] overflow-y-auto p-0">
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
              pokazuje, na którym etapie jest konkretna sprawa. Pod każdym
              etapem podana jest <strong>podstawa prawna</strong> z Konstytucji
              RP albo Regulaminu Sejmu.
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

          <ol className="list-none p-0 m-0 relative">
            {/* Vertical timeline runs through the centre of each icon disc.
                Icon column is 88px wide → centre at 44px from left edge. */}
            <div
              aria-hidden
              className="absolute top-10 bottom-10"
              style={{
                left: 44,
                width: 1,
                background: "var(--border)",
              }}
            />

            {ROWS.map((row) => {
              const Icon = row.icon;
              return (
                <li
                  key={row.key}
                  className="relative grid gap-6 pl-0 pr-0 mb-7 last:mb-0"
                  style={{
                    gridTemplateColumns: "88px 1fr 300px",
                    alignItems: "start",
                  }}
                >
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
                    <div
                      className="font-serif text-secondary-foreground m-0"
                      style={{
                        fontSize: 14,
                        lineHeight: 1.6,
                        textWrap: "pretty" as never,
                      }}
                    >
                      {row.detail}
                    </div>
                    <LegalSources items={row.sources} />
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
              Źródła:{" "}
              <a
                href="https://www.sejm.gov.pl/prawo/konst/polski/4.htm"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                Konstytucja RP
              </a>
              {" · "}
              <a
                href="https://www.sejm.gov.pl/prawo/regulamin/kon7.htm"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                Regulamin Sejmu
              </a>
            </span>
          </div>
        </div>

        <DialogClose className="sr-only">Zamknij</DialogClose>
      </DialogContent>
    </Dialog>
  );
}
