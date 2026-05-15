import type { Metadata } from "next";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
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
} from "lucide-react";
import { PageBreadcrumb } from "@/components/chrome/PageBreadcrumb";

// Standalone, SEO-targeted page covering the Polish legislative process.
// Same 11-stage skeleton as ProcessStagesExplainer but with expanded prose
// (~3× density), an FAQ block, glossary, and a JSON-LD WebPage+FAQPage
// schema so Google can surface rich results.
//
// Slug "/jak-powstaje-ustawa" matches the dialog title and aligns with the
// dominant Polish search query for this topic ("jak powstaje ustawa
// w Polsce"). Lead H1 is the same question form.

const PAGE_URL = "https://tygodniksejmowy.pl/jak-powstaje-ustawa";

export const metadata: Metadata = {
  title: "Jak powstaje ustawa w Sejmie? 11 etapów krok po kroku",
  description:
    "Pełne wyjaśnienie procesu legislacyjnego w Polsce — od wpłynięcia projektu do publikacji w Dzienniku Ustaw. Prostym językiem, z podstawą prawną z Konstytucji RP i Regulaminu Sejmu.",
  keywords: [
    "proces legislacyjny",
    "jak powstaje ustawa",
    "ustawa Sejm",
    "I czytanie",
    "II czytanie",
    "III czytanie",
    "weto prezydenckie",
    "Senat",
    "Trybunał Konstytucyjny",
    "vacatio legis",
    "bezwzględna większość",
    "kworum",
    "tryb pilny",
    "inicjatywa obywatelska",
    "Konstytucja RP",
    "Regulamin Sejmu",
  ],
  alternates: { canonical: "/jak-powstaje-ustawa" },
  openGraph: {
    title: "Jak powstaje ustawa w Sejmie? 11 etapów krok po kroku",
    description:
      "Pełne wyjaśnienie procesu legislacyjnego w Polsce — od wpłynięcia projektu do publikacji w Dzienniku Ustaw. Prostym językiem, z podstawą prawną.",
    url: PAGE_URL,
    type: "article",
  },
  twitter: {
    card: "summary_large_image",
    title: "Jak powstaje ustawa w Sejmie? 11 etapów",
    description: "Pełne wyjaśnienie procesu legislacyjnego w Polsce.",
  },
};

// ---------------------------------------------------------------------------
// Content — long-form. Each stage gets a slug for in-page anchor links and
// JSON-LD pillarpage navigation.
// ---------------------------------------------------------------------------

type Branch = {
  kind: "forward" | "back" | "terminal";
  label: string;
  detail: string;
};

// Phase groups the 11 stages into thematic blocks, each with its own accent
// colour. Helps the reader see "where are we in the process" at a glance
// without reading the full text. Colour values come from globals.css tokens.
type PhaseKey = "wnioskodawca" | "komisja" | "plenum" | "senat" | "prezydent";

type Phase = {
  key: PhaseKey;
  label: string;
  accent: string; // CSS custom property reference
  accentSoft: string; // for backgrounds
};

const PHASES: Record<PhaseKey, Phase> = {
  wnioskodawca: {
    key: "wnioskodawca",
    label: "Wpłynięcie i I czytanie",
    accent: "var(--muted-foreground)",
    accentSoft: "color-mix(in srgb, var(--muted-foreground) 12%, var(--background))",
  },
  komisja: {
    key: "komisja",
    label: "Komisja",
    accent: "var(--warning)",
    accentSoft: "color-mix(in srgb, var(--warning) 14%, var(--background))",
  },
  plenum: {
    key: "plenum",
    label: "Plenum Sejmu",
    accent: "var(--destructive)",
    accentSoft: "color-mix(in srgb, var(--destructive) 10%, var(--background))",
  },
  senat: {
    key: "senat",
    label: "Senat",
    accent: "var(--success)",
    accentSoft: "color-mix(in srgb, var(--success) 13%, var(--background))",
  },
  prezydent: {
    key: "prezydent",
    label: "Prezydent",
    accent: "var(--destructive-deep)",
    accentSoft: "color-mix(in srgb, var(--destructive-deep) 12%, var(--background))",
  },
};

type Stage = {
  slug: string;
  num: string;
  label: string;
  bucket: string;
  phase: PhaseKey;
  icon: LucideIcon;
  blurb: string;
  paragraphs: React.ReactNode[];
  branches: Branch[];
  sources: string[];
};

const STAGES: Stage[] = [
  {
    slug: "wplynelo",
    num: "01",
    label: "Wpłynęło — projekt trafia do Sejmu",
    bucket: "WPŁYNĘŁO",
    phase: "wnioskodawca",
    icon: ScrollText,
    blurb: "Każda ustawa zaczyna się od kogoś, kto ma prawo wnieść projekt.",
    paragraphs: [
      <>
        Prawo wniesienia projektu ustawy do Sejmu — tzw.{" "}
        <strong>inicjatywa ustawodawcza</strong> — przysługuje pięciu podmiotom
        wprost wymienionym w Konstytucji: <strong>Radzie Ministrów</strong>{" "}
        (czyli rządowi), <strong>Prezydentowi RP</strong>,{" "}
        <strong>Senatowi</strong>, <strong>posłom</strong> oraz{" "}
        <strong>grupie co najmniej 100 tysięcy obywateli</strong> mających prawo
        wybierania do Sejmu. To ostatnie nazywa się{" "}
        <strong>inicjatywą obywatelską</strong> — droga, którą bardzo niewiele
        ustaw faktycznie pokonuje (kilka rocznie), ale formalnie istnieje od
        1999 roku.
      </>,
      <>
        W praktyce po stronie posłów projekt może wnieść <strong>klub poselski</strong>{" "}
        (każdy poseł zrzeszony w klubie automatycznie podpisuje) albo{" "}
        <strong>grupa co najmniej 15 posłów</strong> niezależnie od przynależności.
        Komisje sejmowe również mają prawo inicjatywy — wnosi je przewodniczący
        komisji w imieniu jej członków. To wszystko reguluje Regulamin Sejmu,
        nie sama Konstytucja.
      </>,
      <>
        Każdy projekt musi zawierać <strong>uzasadnienie</strong> oraz{" "}
        <strong>ocenę skutków finansowych</strong> — to wymóg konstytucyjny.
        Marszałek Sejmu nadaje projektowi numer druku (np. „druk nr 1650")
        i publikuje go w Systemie Informacyjnym Sejmu. Od tej chwili każdy
        obywatel może przeczytać pełną treść projektu wraz z uzasadnieniem.
        Sam moment „wpłynięcia" niczego nie rozstrzyga — projekt po prostu
        wchodzi do kalendarza prac Sejmu.
      </>,
    ],
    branches: [{ kind: "forward", label: "I czytanie", detail: "Zawsze następny krok." }],
    sources: ["Art. 118 Konstytucji RP", "Art. 32 ust. 2 Regulaminu Sejmu"],
  },
  {
    slug: "pierwsze-czytanie",
    num: "02",
    label: "I czytanie — pierwsze formalne omówienie",
    bucket: "I CZYTANIE",
    phase: "wnioskodawca",
    icon: Megaphone,
    blurb:
      "Marszałek decyduje, gdzie projekt trafi: na salę plenarną czy do komisji.",
    paragraphs: [
      <>
        Regulamin Sejmu w artykule 37 ust. 2 określa{" "}
        <strong>zamkniętą listę ustaw</strong>, których pierwsze czytanie ZAWSZE
        musi odbyć się na sali plenarnej — przed wszystkimi 460 posłami.
        Należą do niej: <strong>zmiany Konstytucji</strong>,{" "}
        <strong>ustawy budżetowe i podatkowe</strong>, ustawy{" "}
        <strong>wyborcze</strong> (dotyczące wyboru Prezydenta, Sejmu, Senatu
        i organów samorządu), ustawy regulujące{" "}
        <strong>ustrój i właściwość władz publicznych</strong>, a także{" "}
        <strong>kodeksy</strong>. Pozostałe projekty trafiają najpierw do
        komisji branżowej, a Marszałek może w drodze wyjątku skierować
        konkretny projekt na salę, jeśli „uzasadniają to ważne względy".
      </>,
      <>
        Pierwsze czytanie nie może odbyć się{" "}
        <strong>wcześniej niż 7 dni od doręczenia druku posłom</strong>. Ten
        termin daje opozycji i mediom czas na zapoznanie się z treścią. W
        czytaniu projekt przedstawia jego autor (np. minister, jeśli to projekt
        rządowy) lub jego reprezentant — to nazywa się{" "}
        <strong>uzasadnieniem projektu</strong>. Po nim posłowie zadają pytania,
        kluby przedstawiają wstępne stanowiska.
      </>,
      <>
        Na zakończenie I czytania można złożyć wniosek o{" "}
        <strong>odrzucenie projektu w całości</strong> — jeśli Sejm większością
        głosów go odrzuci, proces się tu kończy. W praktyce wnioski o
        odrzucenie są rzadko skuteczne dla projektów rządowych (rząd ma
        zazwyczaj większość), ale dla projektów obywatelskich albo opozycyjnych
        bywają zaporą.
      </>,
    ],
    branches: [
      {
        kind: "forward",
        label: "Komisja",
        detail: "Standardowa droga — szczegółowa analiza.",
      },
      {
        kind: "terminal",
        label: "Odrzucenie",
        detail: "Sejm może odrzucić projekt w I czytaniu.",
      },
    ],
    sources: ["Art. 37 ust. 2 i 4 Regulaminu Sejmu", "Art. 39 Regulaminu Sejmu"],
  },
  {
    slug: "praca-w-komisji",
    num: "03",
    label: "Praca w komisji — szczegółowa analiza",
    bucket: "KOMISJA",
    phase: "komisja",
    icon: FileSearch,
    blurb:
      "Najdłuższy etap całego procesu. To tu zapadają konkretne decyzje.",
    paragraphs: [
      <>
        Komisje sejmowe to wyspecjalizowane organy parlamentu — istnieją
        komisje zdrowia, finansów, kultury, sprawiedliwości, ochrony
        środowiska, infrastruktury, polityki społecznej i wiele innych.
        Skierowanie projektu do konkretnej komisji decyduje, kto będzie nad
        nim pracował przez najbliższe tygodnie albo miesiące. To czynność
        Marszałka, ale nieformalnie wpływ mają też kluby (gdy projekt
        teoretycznie mógłby trafić do dwóch komisji).
      </>,
      <>
        Komisja czyta projekt <strong>linijka po linijce</strong>, mając do
        dyspozycji ekspertyzy Biura Analiz Sejmowych, opinie strony rządowej,
        głosy organizacji społecznych, stanowiska samorządów i — coraz
        częściej — opinie obywatelskie wpływające przez stronę Sejmu.
        Komisja może <strong>wprowadzać poprawki</strong>, łączyć projekt
        z innymi pokrewnymi, a nawet przepisać go w całości, jeśli uzna
        pierwotną treść za nieudaną.
      </>,
      <>
        To zwykle <strong>najdłuższy etap całego procesu</strong> — tygodnie
        albo miesiące. Dla skomplikowanych ustaw potrafią to być lata. Wnioskodawca
        ma prawo <strong>wycofać projekt</strong> w każdej chwili aż do końca
        II czytania (art. 119 ust. 4 Konstytucji); robi się to czasem, gdy
        rząd widzi że ustawa nie ma szans przejść w pierwotnej formie.
      </>,
    ],
    branches: [
      {
        kind: "forward",
        label: "Sprawozdanie komisji",
        detail: "Komisja kończy pracę i przedstawia stanowisko Sejmowi.",
      },
      {
        kind: "terminal",
        label: "Wycofanie",
        detail: "Wnioskodawca może wycofać projekt do końca II czytania.",
      },
    ],
    sources: ["Art. 41-46 Regulaminu Sejmu", "Art. 119 ust. 4 Konstytucji RP"],
  },
  {
    slug: "sprawozdanie-komisji",
    num: "04",
    label: "Sprawozdanie komisji — wynik prac",
    bucket: "KOMISJA",
    phase: "komisja",
    icon: FileSignature,
    blurb: "Komisja głosuje nad finalną wersją i wyznacza sprawozdawcę.",
    paragraphs: [
      <>
        Po zakończeniu prac komisja głosuje nad treścią projektu z wszystkimi
        wprowadzonymi poprawkami. Tworzy się <strong>sprawozdanie komisji</strong>{" "}
        — odrębny dokument publikowany jako kolejny druk sejmowy (zazwyczaj z
        sufiksem „-A", np. „druk 1234-A"). Sprawozdanie zawiera{" "}
        <strong>pełną listę poprawek</strong>, proponowane stanowisko (za
        przyjęciem, za odrzuceniem albo z dalszymi zmianami) oraz informacje o
        głosach mniejszości.
      </>,
      <>
        Komisja wyznacza <strong>posła-sprawozdawcę</strong> — jednego ze swoich
        członków, który podczas II czytania na sali plenarnej przedstawi raport
        z prac. Sprawozdawca staje się publiczną „twarzą" projektu na tym
        etapie — to jego nazwisko pojawia się w mediach gdy ustawa wchodzi do
        debaty.
      </>,
    ],
    branches: [
      {
        kind: "forward",
        label: "II czytanie",
        detail: "Plenum debatuje nad sprawozdaniem komisji.",
      },
    ],
    sources: ["Art. 43 Regulaminu Sejmu"],
  },
  {
    slug: "drugie-czytanie",
    num: "05",
    label: "II czytanie — debata plenarna",
    bucket: "PLENUM",
    phase: "plenum",
    icon: Users,
    blurb:
      "Cały Sejm debatuje nad projektem w wersji zaproponowanej przez komisję.",
    paragraphs: [
      <>
        II czytanie odbywa się na sali plenarnej. Otwiera je{" "}
        <strong>poseł-sprawozdawca</strong>, który przedstawia raport z prac
        komisji. Następnie kluby poselskie wygłaszają stanowiska — każdy klub
        ma określony czas wystąpienia (zwykle 5-10 minut, zależnie od długości
        debaty), proporcjonalny do liczby posłów.
      </>,
      <>
        Na tym etapie posłowie mogą zgłaszać <strong>nowe poprawki</strong> —
        takie, które nie były rozpatrywane przez komisję. Mogą też złożyć{" "}
        <strong>wniosek o odrzucenie projektu w całości</strong>. Jeśli w toku
        II czytania zostaną zgłoszone nowe poprawki lub wnioski, projekt
        zazwyczaj wraca do komisji w celu ich analizy — to jest tzw.{" "}
        <strong>powrót do komisji</strong>. Ten ruch wstecz NIE oznacza, że
        proces się cofnął — to standardowa procedura, której celem jest
        zachowanie jakości legislacyjnej. Komisja analizuje, opiniuje, a Sejm
        wraca do projektu w III czytaniu.
      </>,
      <>
        To <strong>ostatni moment</strong>, w którym wnioskodawca może
        formalnie wycofać projekt (art. 119 ust. 4 Konstytucji). Po II
        czytaniu już tylko głosowanie nad całością może projekt zatrzymać.
      </>,
    ],
    branches: [
      {
        kind: "forward",
        label: "III czytanie",
        detail: "Jeśli nie ma nowych poprawek do analizy.",
      },
      {
        kind: "back",
        label: "Komisja (poprawki)",
        detail: "Komisja analizuje świeże poprawki z plenum.",
      },
      {
        kind: "terminal",
        label: "Odrzucenie",
        detail: "Sejm może odrzucić projekt na wniosek złożony w II czytaniu.",
      },
    ],
    sources: ["Art. 44 i 47 Regulaminu Sejmu", "Art. 119 ust. 4 Konstytucji RP"],
  },
  {
    slug: "trzecie-czytanie",
    num: "06",
    label: "III czytanie — głosowanie nad poprawkami",
    bucket: "PLENUM",
    phase: "plenum",
    icon: Vote,
    blurb: "Sejm głosuje nad pojedynczymi poprawkami, ustalając finalną treść.",
    paragraphs: [
      <>
        III czytanie to <strong>etap głosowań technicznych</strong>. Sejm
        kolejno przegłosowuje każdą zgłoszoną poprawkę osobno: przyjąć czy
        odrzucić. Sprawozdawca komisji może rekomendować, jak głosować — jego
        rekomendacja nie jest wiążąca, ale ma wagę dla posłów własnego klubu.
      </>,
      <>
        Po przegłosowaniu wszystkich poprawek <strong>ostateczna treść
        projektu jest ustalona</strong>. Każda poprawka, która zebrała większość
        — wchodzi do tekstu. Każda, która nie zebrała — wypada. To moment, w
        którym ustawa w wersji „gotowej do głosowania" przybiera ostateczny
        kształt.
      </>,
    ],
    branches: [
      {
        kind: "forward",
        label: "Głosowanie nad całością",
        detail: "Po przegłosowaniu wszystkich poprawek.",
      },
    ],
    sources: ["Art. 48-50 Regulaminu Sejmu"],
  },
  {
    slug: "glosowanie",
    num: "07",
    label: "Głosowanie nad ustawą — finałowy głos",
    bucket: "GŁOSOWANIE",
    phase: "plenum",
    icon: CheckCircle2,
    blurb: "Cały Sejm głosuje nad pełną ustawą po wszystkich poprawkach.",
    paragraphs: [
      <>
        To pojedyncze głosowanie nad <strong>pełną wersją ustawy</strong> ze
        wszystkimi przyjętymi poprawkami. Wymagana jest{" "}
        <strong>zwykła większość</strong> — więcej głosów ZA niż PRZECIW, przy
        obecności co najmniej połowy ustawowej liczby posłów. Praktycznie:{" "}
        <strong>kworum to 230 posłów z 460</strong>. Głosy wstrzymujące się
        nie liczą do większości — tylko ZA i PRZECIW decydują.
      </>,
      <>
        Głosowanie odbywa się <strong>imiennie</strong> — każdy poseł
        elektronicznie głosuje „za", „przeciw" lub „wstrzymuję się", a wynik
        publikowany jest natychmiast wraz z nazwiskami. Można sprawdzić, jak
        głosował konkretny poseł. To kluczowy moment dla obywatelskiej
        kontroli władzy.
      </>,
      <>
        Jeśli ustawa przejdzie, Marszałek Sejmu w ciągu <strong>3 dni</strong>{" "}
        przekazuje ją Senatowi. Jeśli głosy ZA nie zbiorą zwykłej większości —
        proces się kończy, ustawa upada.
      </>,
    ],
    branches: [
      {
        kind: "forward",
        label: "Senat",
        detail: "Marszałek przekazuje uchwaloną ustawę do Senatu w 3 dni.",
      },
      {
        kind: "terminal",
        label: "Odrzucenie",
        detail: "Za mało głosów ZA — proces się kończy.",
      },
    ],
    sources: ["Art. 120 Konstytucji RP"],
  },
  {
    slug: "senat",
    num: "08",
    label: "Senat — izba refleksji",
    bucket: "SENAT",
    phase: "senat",
    icon: Landmark,
    blurb:
      "Senat ma stanowisko co do ustawy. Trzy opcje, trzy różne terminy.",
    paragraphs: [
      <>
        Po przekazaniu ustawy z Sejmu, Senat ma trzy opcje:{" "}
        <strong>przyjąć bez poprawek</strong> (ustawa idzie prosto do Prezydenta),{" "}
        <strong>wnieść poprawki</strong> (wraca do Sejmu) albo{" "}
        <strong>odrzucić ustawę w całości</strong> (też wraca do Sejmu).
        Jeśli Senat milczy w terminie — ustawa idzie dalej automatycznie, w
        wersji uchwalonej przez Sejm.
      </>,
      <>
        Termin zależy od trybu, w jakim ustawa jest procedowana:
      </>,
      <ul className="list-disc pl-6 space-y-1 my-3">
        <li>
          <strong>30 dni</strong> — standardowy termin dla zwykłej ustawy
          (art. 121 ust. 2 Konstytucji)
        </li>
        <li>
          <strong>20 dni</strong> — dla ustawy budżetowej. Senat{" "}
          <strong>nie może odrzucić budżetu w całości</strong> — może tylko
          zgłosić poprawki (art. 223 Konstytucji)
        </li>
        <li>
          <strong>14 dni</strong> — dla ustaw uchwalanych w trybie pilnym
          (art. 123 ust. 3 Konstytucji)
        </li>
      </ul>,
      <>
        Senat pracuje przez swoje komisje, podobnie jak Sejm. Pełna sala Senatu
        głosuje nad stanowiskiem — Senat liczy 100 senatorów. Senacka praca to
        nie tylko techniczna kontrola tekstu — to też okazja, żeby zwrócić
        uwagę na konsekwencje ustawy, które uciekły posłom podczas szybkiego
        procedowania.
      </>,
    ],
    branches: [
      {
        kind: "forward",
        label: "Prezydent",
        detail: "Bez zmian albo po rozpatrzeniu poprawek senackich.",
      },
      {
        kind: "back",
        label: "Sejm głosuje znowu",
        detail: "Jeśli Senat zgłosił poprawki lub odrzucił ustawę.",
      },
    ],
    sources: [
      "Art. 121 Konstytucji RP",
      "Art. 123 ust. 3 Konstytucji RP (tryb pilny)",
      "Art. 223 Konstytucji RP (budżet)",
    ],
  },
  {
    slug: "rozpatrzenie-poprawek-senatu",
    num: "09",
    label: "Rozpatrzenie poprawek Senatu — drugi głos Sejmu",
    bucket: "SENAT",
    phase: "senat",
    icon: Users,
    blurb:
      "Sejm głosuje czy odrzucić senackie zmiany. Tu wchodzi bezwzględna większość.",
    paragraphs: [
      <>
        Jeśli Senat zgłosił poprawki lub odrzucił ustawę w całości, sprawa
        wraca do Sejmu. Sejm głosuje <strong>nad każdą poprawką osobno</strong>{" "}
        — może je odrzucać selektywnie, jedne przyjmując a inne odrzucając.
        Aby ODRZUCIĆ stanowisko Senatu, Sejm musi zebrać{" "}
        <strong>bezwzględną większość</strong>.
      </>,
      <>
        <strong>UWAGA — częsta pomyłka.</strong>{" "}
        Bezwzględna większość TO NIE JEST „50% obecnych + 1". To wymaganie
        kworum, czyli czegoś innego. Bezwzględna większość oznacza, że głosów
        ZA musi być <strong>więcej niż PRZECIW i WSTRZYMUJĄCYCH RAZEM</strong>{" "}
        — czyli ponad połowa wszystkich głosów oddanych w danym głosowaniu.
        Wstrzymujący się NIE są neutralni — działają jak głosy „przeciw" w tym
        progu.
      </>,
      <>
        Jeśli Sejm nie zbierze bezwzględnej większości — stanowisko Senatu
        wchodzi do ustawy. To oznacza, że senackie poprawki (lub odrzucenie
        całej ustawy) stają się skuteczne, mimo że Sejm tego nie chciał.
        Wymagany próg bezwzględnej większości daje Senatowi realną siłę
        veta — w praktyce mniejszościowy rząd często nie ma głosów, żeby
        senackie poprawki obalić.
      </>,
    ],
    branches: [
      {
        kind: "forward",
        label: "Prezydent",
        detail: "Po rozstrzygnięciu wszystkich poprawek Senatu.",
      },
    ],
    sources: ["Art. 121 ust. 3 Konstytucji RP"],
  },
  {
    slug: "prezydent",
    num: "10",
    label: "Prezydent — podpis, weto albo TK",
    bucket: "PREZYDENT",
    phase: "prezydent",
    icon: PenTool,
    blurb: "Głowa państwa ma trzy opcje i kilka różnych terminów.",
    paragraphs: [
      <>
        Po przejściu Sejmu i Senatu ustawa trafia do Prezydenta. Prezydent ma
        trzy opcje konstytucyjne:
      </>,
      <ol className="list-decimal pl-6 space-y-2 my-3">
        <li>
          <strong>PODPISAĆ</strong> — ustawa zostaje promulgowana (zarządza jej
          publikację w Dzienniku Ustaw). Po publikacji zaczyna obowiązywać.
        </li>
        <li>
          <strong>ZAWETOWAĆ</strong> — odmówić podpisania i przekazać ustawę
          Sejmowi do ponownego rozpatrzenia z uzasadnieniem (tzw.{" "}
          <em>weto zawieszające</em>). Sejm może obalić weto większością{" "}
          <strong>3/5 głosów</strong> przy obecności co najmniej połowy posłów.
          Jeśli się to uda — Prezydent ma obowiązek podpisać w ciągu{" "}
          <strong>7 dni</strong> i nie może już ponownie wetować ani kierować
          do TK.
        </li>
        <li>
          <strong>Skierować do Trybunału Konstytucyjnego</strong> — żądać
          zbadania zgodności ustawy z Konstytucją. <strong>Bieg 21-dniowego
          terminu jest wstrzymany</strong> do orzeczenia TK. Po wyroku TK
          Prezydent musi podpisać (jeśli TK potwierdził zgodność) albo odmówić
          (jeśli TK uznał za niezgodną).
        </li>
      </ol>,
      <>
        Standardowy termin to <strong>21 dni</strong>. Ale są wyjątki:
      </>,
      <ul className="list-disc pl-6 space-y-1 my-3">
        <li>
          <strong>7 dni</strong> dla ustaw uchwalanych w trybie pilnym
        </li>
        <li>
          <strong>7 dni</strong> po obaleniu weta przez Sejm
        </li>
        <li>
          Termin <strong>wstrzymany</strong> przez skierowanie do TK
        </li>
      </ul>,
      <>
        Weto jest najmocniejszą bronią Prezydenta wobec parlamentu. Skutecznie
        zatrzymuje ustawę, jeśli rząd nie ma większości 3/5 (276 posłów).
        Skierowanie do TK jest narzędziem subtelniejszym — pozwala Prezydentowi
        nie blokować ustawy w pełni, ale poddać ją niezależnej kontroli.
      </>,
    ],
    branches: [
      {
        kind: "forward",
        label: "Dziennik Ustaw",
        detail: "Po podpisie ustawa wchodzi w życie.",
      },
      {
        kind: "back",
        label: "Sejm obala weto",
        detail: "Większością 3/5 głosów Sejm odrzuca weto Prezydenta.",
      },
      {
        kind: "terminal",
        label: "Trybunał Konstytucyjny",
        detail: "Prezydent kieruje ustawę do oceny zgodności z konstytucją.",
      },
    ],
    sources: [
      "Art. 122 Konstytucji RP",
      "Art. 123 ust. 3 Konstytucji RP (tryb pilny)",
    ],
  },
  {
    slug: "publikacja",
    num: "11",
    label: "Publikacja w Dzienniku Ustaw — ustawa wchodzi w życie",
    bucket: "PREZYDENT",
    phase: "prezydent",
    icon: Crown,
    blurb: "Ostatni krok. Od tej chwili ustawa obowiązuje wszystkich.",
    paragraphs: [
      <>
        Po podpisaniu przez Prezydenta ustawa jest publikowana w{" "}
        <strong>Dzienniku Ustaw Rzeczypospolitej Polskiej</strong> (Dz.U.). To
        oficjalny dziennik urzędowy, w którym ogłaszane są akty prawne
        powszechnie obowiązujące — ustawy, rozporządzenia, ratyfikowane umowy
        międzynarodowe. Publikacja jest <strong>warunkiem koniecznym</strong> —
        ustawa, która nie została opublikowana, formalnie nie obowiązuje, nawet
        jeśli została podpisana.
      </>,
      <>
        Tekst opublikowanej ustawy zawiera datę wejścia w życie. Standardowo
        ustawa wchodzi w życie po <strong>14 dniach od dnia ogłoszenia</strong>{" "}
        — to nazywa się <strong>vacatio legis</strong> (po polsku „spoczynek
        ustawy"). Ten okres daje adresatom czas, by zapoznać się z nowymi
        regulacjami i przygotować do ich stosowania. Ustawa może jednak
        określić własny termin — krótszy lub dłuższy. Przykład krótkiego: ustawa
        wchodzi w życie z dniem ogłoszenia. Przykład dłuższego: ustawa wchodzi
        w życie po 6 miesiącach od ogłoszenia (typowe dla skomplikowanych reform
        wymagających przygotowania urzędów).
      </>,
      <>
        Od momentu wejścia w życie ustawa <strong>obowiązuje wszystkich</strong>{" "}
        — obywateli, firmy, organy państwa, sądy. Nieznajomość prawa nie
        zwalnia z odpowiedzialności (znana łacińska zasada{" "}
        <em>ignorantia iuris nocet</em>). Jeśli ktoś uważa ustawę za niezgodną
        z Konstytucją, może po jej wejściu w życie wystąpić z wnioskiem do TK
        za pośrednictwem skargi konstytucyjnej albo wystąpienia uprawnionego
        podmiotu (np. Rzecznik Praw Obywatelskich, grupa 50 posłów, 30
        senatorów).
      </>,
    ],
    branches: [],
    sources: [
      "Art. 122 ust. 2 Konstytucji RP",
      "Art. 4 ust. 1 ustawy o ogłaszaniu aktów normatywnych",
    ],
  },
];

type FaqItem = { q: string; a: React.ReactNode; aText: string };

const FAQ: FaqItem[] = [
  {
    q: "Ile czasu trwa cały proces legislacyjny?",
    aText:
      "Od kilku tygodni dla ustaw w trybie pilnym do kilku lat dla skomplikowanych reform. Standardowo: 3-6 miesięcy.",
    a: (
      <>
        Konstytucja nie określa maksymalnego czasu — proces może trwać tak
        długo, jak komisja sejmowa nad nim pracuje. W praktyce:{" "}
        <strong>od kilku tygodni</strong> (tryb pilny, prosta ustawa) do{" "}
        <strong>kilku lat</strong> (kompleksowe reformy, kodeksy).
        Standardowo: <strong>3-6 miesięcy</strong> od wpłynięcia projektu
        do podpisu Prezydenta. Ustawy nieuchwalone w danej kadencji Sejmu
        wygasają (zasada <em>dyskontynuacji</em>) i muszą być ponownie
        wniesione w nowej kadencji.
      </>
    ),
  },
  {
    q: "Czym różni się większość zwykła od bezwzględnej i kwalifikowanej?",
    aText:
      "Zwykła: więcej ZA niż PRZECIW. Bezwzględna: więcej ZA niż PRZECIW i wstrzymujących razem. Kwalifikowana: ułamek (np. 3/5).",
    a: (
      <>
        Trzy różne progi głosowania:
        <ul className="list-disc pl-6 space-y-1 mt-2">
          <li>
            <strong>Zwykła większość</strong> — głosów ZA więcej niż PRZECIW
            (wstrzymujący się nie liczą). Domyślny próg dla większości decyzji.
          </li>
          <li>
            <strong>Bezwzględna większość</strong> — głosów ZA więcej niż
            PRZECIW i WSTRZYMUJĄCYCH razem. Czyli ponad połowa wszystkich
            głosów. Wymagana m.in. do odrzucenia stanowiska Senatu.
          </li>
          <li>
            <strong>Większość kwalifikowana</strong> — określony ułamek głosów,
            np. <strong>3/5</strong> (do obalenia weta Prezydenta) albo{" "}
            <strong>2/3</strong> (do zmiany Konstytucji w trybie pełnym).
          </li>
        </ul>
      </>
    ),
  },
  {
    q: "Czym jest tryb pilny? Kiedy się go stosuje?",
    aText:
      "Tryb pilny to skrócona procedura — Senat ma 14 dni zamiast 30, Prezydent 7 zamiast 21. Inicjuje Rada Ministrów.",
    a: (
      <>
        Tryb pilny (art. 123 Konstytucji) to skrócona procedura legislacyjna.{" "}
        <strong>Tylko Rada Ministrów</strong> może uznać swój projekt za
        pilny — ani posłowie, ani Senat, ani Prezydent. Skutki: Senat dostaje{" "}
        <strong>14 dni</strong> zamiast 30, Prezydent <strong>7 dni</strong>{" "}
        zamiast 21. Tryb pilny <strong>nie może</strong> dotyczyć ustaw
        podatkowych, kodeksów, ustaw o wyborach Prezydenta lub posłów oraz ustaw
        regulujących ustrój i właściwość władz publicznych.
      </>
    ),
  },
  {
    q: "Czy obywatele naprawdę mogą zgłosić projekt ustawy?",
    aText:
      "Tak. Wymagane 100 tysięcy podpisów obywateli z prawem głosowania. Tryb określa ustawa o wykonywaniu inicjatywy ustawodawczej.",
    a: (
      <>
        Tak — to <strong>inicjatywa ustawodawcza obywateli</strong> z art. 118
        ust. 2 Konstytucji. Wymagane jest zebranie podpisów co najmniej{" "}
        <strong>100 tysięcy obywateli</strong> mających prawo wybierania do
        Sejmu. Komitet inicjatywy obywatelskiej musi spełnić formalne wymogi:
        zarejestrować się u Marszałka, zebrać podpisy w określonym czasie,
        przedstawić projekt z uzasadnieniem i oceną skutków finansowych.
        Praktycznie udaje się to kilka razy rocznie — większość inicjatyw nie
        zbiera wymaganej liczby podpisów. Tryb określa{" "}
        <em>ustawa z dnia 24 czerwca 1999 r. o wykonywaniu inicjatywy
        ustawodawczej przez obywateli</em>.
      </>
    ),
  },
  {
    q: "Co to jest kworum?",
    aText:
      "Minimalna liczba posłów obecnych na sali, żeby Sejm mógł podjąć decyzję. Dla zwykłej ustawy — 230 z 460.",
    a: (
      <>
        Kworum to <strong>minimalna liczba osób</strong> wymagana, by ciało
        kolegialne mogło prawnie podjąć decyzję. Dla Sejmu wynosi ono{" "}
        <strong>połowę ustawowej liczby posłów</strong>, czyli{" "}
        <strong>230 z 460</strong>. Jeśli na sali jest mniej posłów, każda
        próba głosowania jest nieważna. Marszałek sprawdza kworum przez
        elektroniczne głosowanie obecności przed istotnymi punktami.
      </>
    ),
  },
  {
    q: "Czym różni się Dziennik Ustaw od Monitora Polskiego?",
    aText:
      "Dz.U. publikuje powszechnie obowiązujące akty (ustawy, rozporządzenia). M.P. — akty wewnętrzne (uchwały Sejmu, zarządzenia ministrów).",
    a: (
      <>
        <strong>Dziennik Ustaw RP (Dz.U.)</strong> publikuje akty prawa
        powszechnie obowiązującego — Konstytucję, ustawy, rozporządzenia,
        ratyfikowane umowy międzynarodowe. To podstawowy dziennik publikacyjny.
        <br />
        <strong>Monitor Polski (M.P.)</strong> publikuje akty o charakterze
        wewnętrznym i nie-normatywnym — uchwały Sejmu i Senatu (niebędące
        ustawami), zarządzenia Prezesa Rady Ministrów i ministrów, akty
        wewnętrznego kierownictwa. Obie publikacje wydaje Rządowe Centrum
        Legislacji.
      </>
    ),
  },
  {
    q: "Co się stanie, jeśli Prezydent zignoruje termin?",
    aText:
      "Konstytucja nie reguluje tej sytuacji wprost. W doktrynie są różne interpretacje, a w praktyce taki przypadek nie wystąpił.",
    a: (
      <>
        Konstytucja nie reguluje wprost sytuacji, w której Prezydent nie
        podpisze ani nie zawetuje ustawy w terminie 21 dni. W literaturze
        prawniczej spotyka się różne interpretacje — najczęściej przyjmuje
        się, że Marszałek Sejmu może wydać akt zastępczy (analogicznie do
        sytuacji niemożności pełnienia funkcji przez Prezydenta). W praktyce
        polskiej takiej sytuacji nie było — Prezydenci dotrzymywali terminu
        albo wnosili weto/skargę do TK.
      </>
    ),
  },
];

type Term = { term: string; def: React.ReactNode };

const GLOSSARY: Term[] = [
  {
    term: "Bezwzględna większość",
    def: (
      <>
        Głosów ZA musi być więcej niż PRZECIW i WSTRZYMUJĄCYCH razem — czyli
        ponad 50% wszystkich oddanych głosów. Nie myl z „50% obecnych + 1".
      </>
    ),
  },
  {
    term: "Druk sejmowy",
    def: <>Numerowany dokument wniesiony do Sejmu — projekt ustawy, sprawozdanie komisji, opinia, autopoprawka. Każdy ma unikalny numer (np. „druk 1650").</>,
  },
  {
    term: "Dziennik Ustaw (Dz.U.)",
    def: <>Oficjalna publikacja Rządowego Centrum Legislacji, w której ogłaszane są ustawy i rozporządzenia. Bez publikacji ustawa nie obowiązuje.</>,
  },
  {
    term: "Inicjatywa ustawodawcza",
    def: (
      <>
        Prawo wniesienia projektu ustawy do Sejmu. Przysługuje: posłom (15+),
        Senatowi, Prezydentowi, Radzie Ministrów, komisjom sejmowym oraz
        grupie 100 tys. obywateli.
      </>
    ),
  },
  {
    term: "Klub poselski",
    def: <>Zorganizowana grupa posłów reprezentująca tę samą partię. Każdy klub musi liczyć co najmniej 15 posłów (lub 3 dla koła).</>,
  },
  {
    term: "Komisja sejmowa",
    def: <>Stały lub nadzwyczajny organ Sejmu zajmujący się określoną dziedziną (zdrowie, finanse, sprawiedliwość). Komisje wykonują główną pracę legislacyjną.</>,
  },
  {
    term: "Kworum",
    def: <>Minimalna liczba posłów obecnych na sali wymagana do podjęcia decyzji. W Sejmie: 230 z 460. Bez kworum każde głosowanie jest nieważne.</>,
  },
  {
    term: "Monitor Polski (M.P.)",
    def: <>Dziennik urzędowy publikujący akty wewnętrzne — uchwały Sejmu i Senatu, zarządzenia Prezesa RM, akty wewnętrzne resortów.</>,
  },
  {
    term: "Tryb pilny",
    def: <>Skrócona procedura legislacyjna — tylko dla projektów rządowych. Senat ma 14 dni (zamiast 30), Prezydent 7 dni (zamiast 21).</>,
  },
  {
    term: "Trybunał Konstytucyjny (TK)",
    def: <>Sąd badający zgodność ustaw z Konstytucją. Prezydent może skierować do TK ustawę przed podpisem; po wejściu w życie ustawy zaskarżyć ją mogą m.in. RPO, grupa 50 posłów, 30 senatorów.</>,
  },
  {
    term: "Vacatio legis",
    def: <>Łac. „spoczynek ustawy" — okres między ogłoszeniem ustawy w Dz.U. a jej wejściem w życie. Standardowo 14 dni, ale ustawa może określić własny termin.</>,
  },
  {
    term: "Weto prezydenckie",
    def: <>Odmowa podpisania ustawy. Prezydent zwraca ją Sejmowi z uzasadnieniem. Sejm może obalić weto większością 3/5 głosów.</>,
  },
  {
    term: "Zwykła większość",
    def: <>Głosów ZA więcej niż PRZECIW (wstrzymujący się nie liczą). Standardowy próg dla uchwalenia ustawy.</>,
  },
];

// ---------------------------------------------------------------------------
// Visual subcomponents — hero infographic, quick stats, phase badge.
// ---------------------------------------------------------------------------

// Inline SVG hero graphic — stylized "11 stones along a path" representing
// the 11 legislative steps, with one diverging branch (II czytanie → komisja
// → III czytanie) hinting at the non-linear nature explained in body text.
// Pure CSS-variable colours so it picks up dark/light theme automatically.
function HeroInfographic() {
  // 11 dots positioned on an asymmetric curve. Coords picked manually for
  // visual rhythm — not derived from the data array so the layout can
  // emphasise key turning points (komisja loop at 4-5, Senate-back at 9).
  const dots: Array<{ cx: number; cy: number; phase: PhaseKey }> = [
    { cx: 30, cy: 175, phase: "wnioskodawca" },
    { cx: 75, cy: 155, phase: "wnioskodawca" },
    { cx: 120, cy: 130, phase: "komisja" },
    { cx: 165, cy: 110, phase: "komisja" },
    { cx: 210, cy: 88, phase: "plenum" },
    { cx: 165, cy: 60, phase: "komisja" }, // loop-back illustration
    { cx: 210, cy: 88, phase: "plenum" }, // hidden — same coord as #5
    { cx: 255, cy: 66, phase: "plenum" },
    { cx: 300, cy: 50, phase: "senat" },
    { cx: 345, cy: 70, phase: "senat" },
    { cx: 390, cy: 50, phase: "prezydent" },
    { cx: 435, cy: 35, phase: "prezydent" },
  ];
  // We render only unique positions; index 6 overlaps with 4 for the loop-back.
  return (
    <svg
      viewBox="0 0 480 220"
      role="img"
      aria-label="Wizualizacja 11 etapów procesu legislacyjnego"
      className="w-full h-auto"
      style={{ maxWidth: 480 }}
    >
      {/* Main path */}
      <path
        d="M 30 175 Q 90 165 120 130 T 210 88 Q 255 60 300 50 T 390 50 L 435 35"
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.5"
        strokeDasharray="3 5"
      />
      {/* Loop-back curve (II czytanie → komisja → III czytanie) */}
      <path
        d="M 210 88 Q 180 60 165 60 Q 195 70 210 88"
        fill="none"
        stroke="var(--destructive)"
        strokeWidth="1"
        strokeDasharray="2 3"
        opacity="0.6"
      />
      {dots.slice(0, 11).map((d, i) => {
        const phase = PHASES[d.phase];
        const r = i === 0 ? 5 : i === 10 ? 7 : 4;
        return (
          <g key={i}>
            <circle cx={d.cx} cy={d.cy} r={r + 2} fill="var(--background)" />
            <circle
              cx={d.cx}
              cy={d.cy}
              r={r}
              fill={phase.accent}
              stroke="var(--background)"
              strokeWidth="1.5"
            />
          </g>
        );
      })}
      {/* End marker — "Dz.U." */}
      <text
        x="435"
        y="20"
        fontSize="9"
        fill="var(--muted-foreground)"
        fontFamily="var(--font-mono)"
        textAnchor="middle"
        letterSpacing="0.12em"
      >
        DZ.U.
      </text>
      <text
        x="30"
        y="200"
        fontSize="9"
        fill="var(--muted-foreground)"
        fontFamily="var(--font-mono)"
        textAnchor="middle"
        letterSpacing="0.12em"
      >
        START
      </text>
    </svg>
  );
}

// Quick-facts strip — chunky stat cells priming the reader. On desktop
// all 8 stats are visible. On mobile we ship only the top 4 to keep the
// hero compact; the rest live in the body where they're more contextual
// anyway. `hidden md:block` on the secondary group.
function QuickStats() {
  const primaryStats: Array<{ num: string; unit?: string; label: string }> = [
    { num: "11", label: "etapów" },
    { num: "460", label: "posłów" },
    { num: "100", label: "senatorów" },
    { num: "21", unit: "dni", label: "Prezydent" },
  ];
  const secondaryStats: Array<{ num: string; unit?: string; label: string }> = [
    { num: "230", label: "kworum — minimum na sali" },
    { num: "30", unit: "dni", label: "Senat na stanowisko" },
    { num: "3/5", label: "głosów obala weto" },
    { num: "14", unit: "dni", label: "vacatio legis" },
  ];
  return (
    <div className="my-8 md:my-10">
      <div
        className="grid gap-px"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(min(120px, 50%), 1fr))",
          background: "var(--border)",
          border: "1px solid var(--border)",
        }}
      >
        {primaryStats.map((s) => (
          <StatCell key={s.label} s={s} />
        ))}
        {/* Secondary stats — desktop only */}
        <div className="hidden md:contents">
          {secondaryStats.map((s) => (
            <StatCell key={s.label} s={s} />
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCell({
  s,
}: {
  s: { num: string; unit?: string; label: string };
}) {
  return (
    <div className="p-3 md:p-4" style={{ background: "var(--background)" }}>
      <div className="flex items-baseline gap-1">
        <span
          className="font-serif font-medium tabular-nums"
          style={{
            fontSize: "clamp(22px, 5vw, 32px)",
            lineHeight: 1,
            color: "var(--destructive)",
            letterSpacing: "-0.02em",
          }}
        >
          {s.num}
        </span>
        {s.unit && (
          <span
            className="font-sans text-muted-foreground"
            style={{ fontSize: 11 }}
          >
            {s.unit}
          </span>
        )}
      </div>
      <div
        className="font-sans text-muted-foreground mt-1"
        style={{ fontSize: 11, lineHeight: 1.35 }}
      >
        {s.label}
      </div>
    </div>
  );
}

// Legend keyed to the phase colours used on stage cards.
function PhaseLegend() {
  return (
    <div className="mt-8 mb-2 hidden md:flex flex-wrap items-center gap-x-4 gap-y-2">
      <span
        className="font-mono uppercase tracking-[0.14em] text-muted-foreground"
        style={{ fontSize: 10 }}
      >
        Fazy procesu
      </span>
      {Object.values(PHASES).map((p) => (
        <span
          key={p.key}
          className="inline-flex items-center gap-1.5 font-sans text-[11.5px] text-secondary-foreground"
        >
          <span
            aria-hidden
            className="inline-block rounded-full"
            style={{ width: 10, height: 10, background: p.accent }}
          />
          {p.label}
        </span>
      ))}
    </div>
  );
}

// Pill rendered next to each stage heading, colour-coded by phase.
function PhasePill({ phase }: { phase: PhaseKey }) {
  const p = PHASES[phase];
  return (
    <span
      className="inline-flex items-center gap-1.5 font-mono uppercase tracking-[0.1em] shrink-0"
      style={{
        fontSize: 10,
        color: p.accent,
        background: p.accentSoft,
        padding: "3px 8px",
        borderRadius: 3,
        fontWeight: 600,
      }}
    >
      <span
        aria-hidden
        className="inline-block rounded-full"
        style={{ width: 6, height: 6, background: p.accent }}
      />
      {p.label}
    </span>
  );
}

// Big icon disc shown on each stage card — phase-coloured ring.
function StageIconDisc({ Icon, phase }: { Icon: LucideIcon; phase: PhaseKey }) {
  const p = PHASES[phase];
  return (
    <div
      className="flex items-center justify-center rounded-full shrink-0"
      style={{
        width: 64,
        height: 64,
        background: p.accentSoft,
        color: p.accent,
        boxShadow: `0 0 0 2px ${p.accent}`,
      }}
    >
      <Icon size={26} strokeWidth={1.5} />
    </div>
  );
}

function BranchLine({ branch }: { branch: Branch }) {
  const color =
    branch.kind === "forward"
      ? "var(--secondary-foreground)"
      : branch.kind === "back"
      ? "var(--destructive)"
      : "var(--muted-foreground)";
  const Icon =
    branch.kind === "back" ? ArrowLeft : branch.kind === "terminal" ? X : ArrowRight;
  return (
    <li className="flex items-start gap-2 mb-1.5 last:mb-0">
      <Icon size={12} strokeWidth={2.5} style={{ color, marginTop: 4, flexShrink: 0 }} />
      <div className="text-[13.5px] leading-snug">
        <span className="font-mono uppercase tracking-[0.06em] font-semibold" style={{ color }}>
          {branch.label}
        </span>
        <span className="text-muted-foreground"> — {branch.detail}</span>
      </div>
    </li>
  );
}

function SourcesLine({ items }: { items: string[] }) {
  return (
    <p
      className="mt-4 pt-3 font-mono text-[11px] text-muted-foreground leading-snug"
      style={{ borderTop: "1px dashed var(--border)", letterSpacing: "0.02em" }}
    >
      <span
        className="uppercase tracking-[0.12em] mr-2"
        style={{ fontSize: 10, fontWeight: 600 }}
      >
        Podstawa prawna
      </span>
      {items.map((s, i) => (
        <span key={i}>
          {i > 0 && <span aria-hidden> · </span>}
          {s}
        </span>
      ))}
    </p>
  );
}

// ---------------------------------------------------------------------------
// JSON-LD structured data — WebPage + FAQPage. Lets Google surface the FAQ
// answers as rich results and the page itself with breadcrumbs.
// ---------------------------------------------------------------------------

function StructuredData() {
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": PAGE_URL,
        url: PAGE_URL,
        name: "Jak powstaje ustawa w Sejmie? 11 etapów krok po kroku",
        description:
          "Pełne wyjaśnienie procesu legislacyjnego w Polsce — od wpłynięcia projektu do publikacji w Dzienniku Ustaw.",
        inLanguage: "pl-PL",
        breadcrumb: {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Tygodnik Sejmowy", item: "https://tygodniksejmowy.pl/" },
            { "@type": "ListItem", position: 2, name: "Jak powstaje ustawa" },
          ],
        },
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQ.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.aText },
        })),
      },
    ],
  };
  // Escape `<` to `<` so a future writer who adds dynamic text to
  // any FAQ answer can't accidentally inject `</script>` and break out
  // of the JSON-LD block. Content is static today; this is defensive.
  const serialized = JSON.stringify(ld).replace(/</g, "\\u003c");
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serialized }}
    />
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function JakPowstajeUstawaPage() {
  return (
    <>
      <StructuredData />

      <section className="py-8 px-3 md:px-4 lg:px-5 border-b border-border">
        <div className="max-w-[1100px] mx-auto">
          <PageBreadcrumb
            items={[{ label: "Jak powstaje ustawa" }]}
            subtitle="11 etapów procesu legislacyjnego — od wpłynięcia projektu do publikacji w Dzienniku Ustaw."
          />
        </div>
      </section>

      <article className="py-10 px-3 md:px-4 lg:px-5">
        <div className="max-w-[1100px] mx-auto">
          {/* Hero — single column on mobile, two-column on desktop with
              the inline SVG infographic on the right. */}
          <div className="grid gap-6 md:gap-8 items-center mb-8 md:mb-10 md:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
            <div>
              <span
                className="font-mono uppercase tracking-[0.18em] text-destructive"
                style={{ fontSize: 11, fontWeight: 600 }}
              >
                Przewodnik
              </span>
              <h1
                className="font-serif font-medium m-0 mt-3 mb-4 md:mb-5"
                style={{ fontSize: "clamp(28px, 6vw, 56px)", letterSpacing: "-0.025em", lineHeight: 1.05 }}
              >
                Jak powstaje{" "}
                <span className="italic text-destructive">ustawa</span> w Sejmie
              </h1>
              <p
                className="font-serif text-secondary-foreground m-0 mb-4 md:mb-5"
                style={{ fontSize: "clamp(15px, 4vw, 18px)", lineHeight: 1.55 }}
              >
                Każda ustawa w Polsce przechodzi przez{" "}
                <strong>11 proceduralnych etapów</strong> — od wniesienia
                projektu przez uprawniony podmiot, przez prace komisji i
                głosowania w Sejmie i Senacie, aż po podpis Prezydenta i
                publikację w Dzienniku Ustaw.
              </p>
              {/* Secondary lead — desktop only. On mobile the first paragraph
                  carries enough; meta-commentary about citations would push
                  the user-facing stats too far down. */}
              <p
                className="hidden md:block font-sans text-muted-foreground m-0"
                style={{ fontSize: 14, lineHeight: 1.55 }}
              >
                Ten przewodnik tłumaczy każdy etap{" "}
                <strong className="text-foreground">prostym językiem</strong>{" "}
                i wskazuje{" "}
                <strong className="text-foreground">podstawę prawną</strong>{" "}
                w Konstytucji RP albo Regulaminie Sejmu, żeby każde
                stwierdzenie można było zweryfikować.
              </p>
            </div>
            <div className="hidden md:block">
              <HeroInfographic />
            </div>
          </div>

          {/* Quick-facts strip — 8 chunky stat cells */}
          <QuickStats />

          {/* Info callout — non-linearity */}
          <div
            className="rounded-md flex items-start gap-3 p-4 mb-6 mt-8"
            style={{ background: "var(--muted)" }}
          >
            <div
              className="rounded-full flex items-center justify-center shrink-0"
              style={{ width: 36, height: 36, background: "var(--destructive)" }}
            >
              <Info size={18} color="white" strokeWidth={2} />
            </div>
            <div className="text-[14px] leading-relaxed pt-1">
              <strong className="font-medium">Proces nie zawsze idzie do przodu.</strong>{" "}
              Projekt może wrócić do komisji po poprawkach, Senat może zawrócić
              ustawę, Sejm może odrzucić prezydenckie weto. Każde
              &quot;cofnięcie&quot; to szansa na dopracowanie albo zatrzymanie
              ustawy — a nie porażka.
            </div>
          </div>

          <PhaseLegend />

          {/* Table of contents */}
          <nav
            aria-label="Spis treści"
            className="mb-12 p-5 rounded-md"
            style={{ background: "var(--muted)" }}
          >
            <h2
              className="font-mono uppercase tracking-[0.12em] m-0 mb-3 text-muted-foreground"
              style={{ fontSize: 11, fontWeight: 600 }}
            >
              Spis treści
            </h2>
            <ol
              className="list-none p-0 m-0 grid gap-x-6 gap-y-1.5"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(260px, 100%), 1fr))" }}
            >
              {STAGES.map((s) => (
                <li key={s.slug} className="flex gap-2 text-[13.5px]">
                  <span className="font-mono text-muted-foreground tabular-nums shrink-0" style={{ width: 24 }}>
                    {s.num}
                  </span>
                  <Link
                    href={`#${s.slug}`}
                    className="font-serif hover:text-foreground underline-offset-2 hover:underline"
                  >
                    {s.label.split(" — ")[0]}
                  </Link>
                </li>
              ))}
              <li className="flex gap-2 text-[13.5px] mt-2 pt-2 col-span-full border-t" style={{ borderColor: "var(--border)" }}>
                <span className="font-mono text-muted-foreground tabular-nums shrink-0" style={{ width: 24 }}>
                  →
                </span>
                <Link href="#faq" className="font-serif hover:text-foreground underline-offset-2 hover:underline">
                  Najczęstsze pytania
                </Link>
              </li>
              <li className="flex gap-2 text-[13.5px]">
                <span className="font-mono text-muted-foreground tabular-nums shrink-0" style={{ width: 24 }}>
                  →
                </span>
                <Link href="#slowniczek" className="font-serif hover:text-foreground underline-offset-2 hover:underline">
                  Słowniczek pojęć
                </Link>
              </li>
            </ol>
          </nav>

          {/* Stages — phase-coloured cards with icon disc + accent border */}
          {STAGES.map((stage) => {
            const phase = PHASES[stage.phase];
            return (
              <section
                key={stage.slug}
                id={stage.slug}
                className="mb-8 md:mb-10 scroll-mt-20 relative pl-4 md:pl-6 py-1"
                aria-labelledby={`heading-${stage.slug}`}
                style={{ borderLeft: `3px solid ${phase.accent}` }}
              >
                <div className="flex items-start gap-3 md:gap-5 mb-3 md:mb-4">
                  {/* Icon disc — desktop only. On mobile the phase colour
                      lives on the left border + PhasePill so the disc would
                      duplicate signal at the cost of vertical space. */}
                  <div className="hidden md:block">
                    <StageIconDisc Icon={stage.icon} phase={stage.phase} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 md:gap-3 mb-1.5 md:mb-2 flex-wrap">
                      <span
                        className="font-serif font-medium tabular-nums"
                        style={{
                          fontSize: "clamp(22px, 4vw, 28px)",
                          color: phase.accent,
                          lineHeight: 1,
                          letterSpacing: "-0.02em",
                        }}
                      >
                        {stage.num}
                      </span>
                      <h2
                        id={`heading-${stage.slug}`}
                        className="font-serif font-medium m-0"
                        style={{
                          fontSize: "clamp(18px, 4.5vw, 28px)",
                          letterSpacing: "-0.01em",
                          lineHeight: 1.2,
                        }}
                      >
                        {stage.label}
                      </h2>
                    </div>
                    <div className="flex items-center gap-2 md:gap-3 flex-wrap">
                      <PhasePill phase={stage.phase} />
                      <span
                        className="hidden md:inline font-mono uppercase tracking-[0.12em] text-muted-foreground"
                        style={{ fontSize: 9.5 }}
                      >
                        pasek: {stage.bucket}
                      </span>
                    </div>
                    <p
                      className="font-sans text-muted-foreground italic m-0 mt-2"
                      style={{ fontSize: "clamp(13px, 3.5vw, 14.5px)" }}
                    >
                      {stage.blurb}
                    </p>
                  </div>
                </div>

                <div
                  className="font-serif text-secondary-foreground space-y-4"
                  style={{ fontSize: 16, lineHeight: 1.65, textWrap: "pretty" as never }}
                >
                  {stage.paragraphs.map((p, i) => (
                    <div key={i}>{p}</div>
                  ))}
                </div>

                {stage.branches.length > 0 && (
                  <div
                    className="mt-6 p-4 rounded-md"
                    style={{ background: phase.accentSoft, borderLeft: `2px solid ${phase.accent}` }}
                  >
                    <h3
                      className="font-mono uppercase tracking-[0.12em] m-0 mb-3"
                      style={{ fontSize: 11, fontWeight: 600, color: phase.accent }}
                    >
                      Co dalej
                    </h3>
                    <ul className="list-none p-0 m-0">
                      {stage.branches.map((b, i) => (
                        <BranchLine key={i} branch={b} />
                      ))}
                    </ul>
                  </div>
                )}

                <SourcesLine items={stage.sources} />
              </section>
            );
          })}

          {/* FAQ */}
          <section id="faq" className="mb-14 scroll-mt-20 mt-20 pt-10" style={{ borderTop: "1px solid var(--border)" }}>
            <h2
              className="font-serif font-medium m-0 mb-6"
              style={{ fontSize: "clamp(26px, 4vw, 36px)", letterSpacing: "-0.015em", lineHeight: 1.15 }}
            >
              Najczęstsze pytania
            </h2>
            <div className="space-y-6">
              {FAQ.map((f, i) => (
                <div key={i} className="pb-6 border-b border-border last:border-b-0">
                  <h3
                    className="font-serif font-medium m-0 mb-2"
                    style={{ fontSize: 18, letterSpacing: "-0.005em", lineHeight: 1.3 }}
                  >
                    {f.q}
                  </h3>
                  <div
                    className="font-serif text-secondary-foreground"
                    style={{ fontSize: 15, lineHeight: 1.6, textWrap: "pretty" as never }}
                  >
                    {f.a}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Glossary */}
          <section id="slowniczek" className="mb-14 scroll-mt-20 mt-20 pt-10" style={{ borderTop: "1px solid var(--border)" }}>
            <h2
              className="font-serif font-medium m-0 mb-6"
              style={{ fontSize: "clamp(26px, 4vw, 36px)", letterSpacing: "-0.015em", lineHeight: 1.15 }}
            >
              Słowniczek pojęć
            </h2>
            <dl
              className="grid gap-x-8 gap-y-5"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))" }}
            >
              {GLOSSARY.map((t) => (
                <div key={t.term}>
                  <dt
                    className="font-serif font-medium mb-1"
                    style={{ fontSize: 15, letterSpacing: "-0.005em" }}
                  >
                    {t.term}
                  </dt>
                  <dd
                    className="font-serif text-secondary-foreground m-0"
                    style={{ fontSize: 14, lineHeight: 1.55 }}
                  >
                    {t.def}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          {/* Footer with sources */}
          <footer
            className="mt-16 pt-6 text-[13px] text-muted-foreground"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <p className="m-0 mb-2">
              <strong className="font-medium text-foreground">Źródła:</strong>{" "}
              <a
                href="https://www.sejm.gov.pl/prawo/konst/polski/4.htm"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                Konstytucja Rzeczypospolitej Polskiej
              </a>
              {" · "}
              <a
                href="https://www.sejm.gov.pl/prawo/regulamin/kon7.htm"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                Regulamin Sejmu RP
              </a>
              {" · "}
              <a
                href="https://www.sejm.gov.pl/Sejm10.nsf/proces.xsp"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                Proces legislacyjny — strona Sejmu
              </a>
            </p>
            <p className="m-0 text-[12px]">
              Treść zweryfikowana z oryginalnym brzmieniem Konstytucji RP
              (art. 118-123) i Regulaminu Sejmu (art. 32, 37, 41-50).
              Stan na dzień publikacji strony.
            </p>
          </footer>
        </div>
      </article>
    </>
  );
}
