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

const STORAGE_KEY = "tsj-proces-legislacyjny-intro-v2";

function PhaseStrip() {
  const steps = [
    "Druk",
    "I czyt.",
    "Komisja",
    "II czyt.",
    "III czyt.",
    "Senat",
    "Prezydent",
    "Dz.U./MP",
  ];
  return (
    <div
      className="flex flex-wrap items-center justify-center gap-x-1 gap-y-2 rounded-lg border border-border bg-muted/35 px-2 py-3 font-sans text-[10px] text-muted-foreground sm:gap-x-0.5 sm:text-[11px]"
      aria-hidden
    >
      {steps.map((label, i) => (
        <span key={label} className="flex items-center">
          <span className="rounded-full bg-background px-2 py-1 ring-1 ring-border tabular-nums">
            {i + 1}. {label}
          </span>
          {i < steps.length - 1 && (
            <span className="mx-0.5 text-muted-foreground/70 sm:mx-1" aria-hidden>
              →
            </span>
          )}
        </span>
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
          className="max-h-[min(92vh,800px)] w-[calc(100%-1.5rem)] max-w-[min(44rem,calc(100vw-1.5rem))] gap-0 overflow-y-auto p-0 sm:max-w-2xl"
          showCloseButton
        >
          <div className="px-5 pt-5 pb-3 sm:px-6 sm:pt-6">
            <DialogHeader className="text-left gap-2 pr-8">
              <DialogTitle className="font-serif text-[1.35rem] leading-snug sm:text-2xl">
                Etapy ustawy w Sejmie i poza nim
              </DialogTitle>
              <DialogDescription className="font-sans text-[13px] leading-relaxed text-muted-foreground">
                Poniżej: po co jest każdy etap, co może wtedy spaść na głosowaniach albo decyzjach organów oraz
                jak czytać to razem z osią czasu na tej stronie (wpisy z Sejmu: typ etapu + nazwa wydarzenia).
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 space-y-4">
              <PhaseStrip />

              <Accordion type="multiple" className="w-full border-t border-border pt-1">
                <AccordionItem value="druk" className="border-b border-border">
                  <AccordionTrigger className="hover:no-underline py-3 text-left">
                    <span className="flex flex-col gap-0.5 pr-2">
                      <span className="font-sans text-[13px] font-semibold text-foreground">Druk i formalny start</span>
                      <span className="font-sans text-[11px] font-normal text-muted-foreground">
                        Numer w kadencji, uzasadnienie — kiedy projekt jeszcze „nie debatuje”
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-3">
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

                <AccordionItem value="i-czytanie" className="border-b border-border">
                  <AccordionTrigger className="hover:no-underline py-3 text-left">
                    <span className="flex flex-col gap-0.5 pr-2">
                      <span className="font-sans text-[13px] font-semibold text-foreground">I czytanie</span>
                      <span className="font-sans text-[11px] font-normal text-muted-foreground">
                        Debata w zarysie: czy ustawa w ogóle ma sens, nie poprawka po poprawce
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-3">
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

                <AccordionItem value="komisja" className="border-b border-border">
                  <AccordionTrigger className="hover:no-underline py-3 text-left">
                    <span className="flex flex-col gap-0.5 pr-2">
                      <span className="font-sans text-[13px] font-semibold text-foreground">Komisja (praca + sprawozdanie)</span>
                      <span className="font-sans text-[11px] font-normal text-muted-foreground">
                        „Warsztat”: opinie, konsultacje, tekst roboczy — stąd osobny druk ze sprawozdaniem
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-3">
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

                <AccordionItem value="ii-czytanie" className="border-b border-border">
                  <AccordionTrigger className="hover:no-underline py-3 text-left">
                    <span className="flex flex-col gap-0.5 pr-2">
                      <span className="font-sans text-[13px] font-semibold text-foreground">II czytanie</span>
                      <span className="font-sans text-[11px] font-normal text-muted-foreground">
                        Plenum: sprawozdawca, debata, zgłaszanie poprawek — ostatnia szansa wycofania przez wnioskodawcę
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-3">
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

                <AccordionItem value="iii-czytanie" className="border-b border-border">
                  <AccordionTrigger className="hover:no-underline py-3 text-left">
                    <span className="flex flex-col gap-0.5 pr-2">
                      <span className="font-sans text-[13px] font-semibold text-foreground">III czytanie</span>
                      <span className="font-sans text-[11px] font-normal text-muted-foreground">
                        Regulaminowa kolej głosowań: najpierw „czy w ogóle”, potem poprawki, na końcu całość
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-3">
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

                <AccordionItem value="senat" className="border-b border-border">
                  <AccordionTrigger className="hover:no-underline py-3 text-left">
                    <span className="flex flex-col gap-0.5 pr-2">
                      <span className="font-sans text-[13px] font-semibold text-foreground">Senat</span>
                      <span className="font-sans text-[11px] font-normal text-muted-foreground">
                        Druga izba: może przyjąć, poprawić albo odrzucić — terminy zależą od rodzaju ustawy
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-3">
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

                <AccordionItem value="prezydent" className="border-b border-border">
                  <AccordionTrigger className="hover:no-underline py-3 text-left">
                    <span className="flex flex-col gap-0.5 pr-2">
                      <span className="font-sans text-[13px] font-semibold text-foreground">Prezydent</span>
                      <span className="font-sans text-[11px] font-normal text-muted-foreground">
                        Podpis, weto albo — w wąskim katalogu spraw — wniosek do Trybunału Konstytucyjnego
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-3">
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

                <AccordionItem value="koniec" className="border-b border-border">
                  <AccordionTrigger className="hover:no-underline py-3 text-left">
                    <span className="flex flex-col gap-0.5 pr-2">
                      <span className="font-sans text-[13px] font-semibold text-foreground">Publikacja i koniec ścieżki</span>
                      <span className="font-sans text-[11px] font-normal text-muted-foreground">
                        Dziennik Ustaw / Monitor, vacatio legis, obowiązywanie — albo przerwanie bez ustawy
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-3">
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

                <AccordionItem value="ui" className="border-b-0">
                  <AccordionTrigger className="hover:no-underline py-3 text-left">
                    <span className="flex flex-col gap-0.5 pr-2">
                      <span className="font-sans text-[13px] font-semibold text-foreground">Co z tego widać na tej stronie</span>
                      <span className="font-sans text-[11px] font-normal text-muted-foreground">
                        Oś czasu, głosowania, dokumenty towarzyszące — jak to łączyć z powyższym
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-2">
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
