"use client";

import { HelpCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function BopInfoDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="Jak działają sprawozdania wydatków biur poselskich?"
          className="inline-flex shrink-0 items-center justify-center w-5 h-5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        >
          <HelpCircle size={16} strokeWidth={1.5} />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-medium text-xl tracking-[-0.015em]">
            Sprawozdania wydatków biur poselskich
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Jak działa ryczałt na biuro i co kontrolujemy.
          </DialogDescription>
        </DialogHeader>

        <div className="text-[14px] leading-[1.6] space-y-4 text-foreground">
          <section>
            <h3 className="text-[11px] text-muted-foreground mb-1.5 font-medium">
              Skąd pieniądze
            </h3>
            <p>
              Każdy poseł dostaje od Kancelarii Sejmu miesięczny <strong>ryczałt</strong> na
              prowadzenie biura poselskiego. W 2025 r. wynosi <strong>23 310 zł/miesiąc</strong>
              {" "}(czyli <strong>279 720 zł/rok</strong>). Posłowie z orzeczeniem o znacznym
              stopniu niepełnosprawności mogą wystąpić o podwyższenie do 50 %. Środki
              niewykorzystane z poprzedniego okresu przechodzą na kolejny rok.
            </p>
          </section>

          <section>
            <h3 className="text-[11px] text-muted-foreground mb-1.5 font-medium">
              Na co można wydać
            </h3>
            <p>
              Tylko na koszty związane z prowadzeniem biura, wymienione w 23 stałych
              kategoriach (najem lokalu, wynagrodzenia pracowników, przejazdy własnym
              samochodem, taksówki, materiały biurowe, telekomunikacja, korespondencja itd.).
              <br />
              <span className="text-muted-foreground">
                Wprost <strong>zabronione</strong>: finansowanie partii politycznych,
                organizacji społecznych, fundacji, klubów poselskich, działalności
                charytatywnej i kampanii wyborczych.
              </span>
            </p>
          </section>

          <section>
            <h3 className="text-[11px] text-muted-foreground mb-1.5 font-medium">
              Twarde limity per kategoria
            </h3>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong>Kilometrówki</strong> (przejazdy własnym samochodem){" "}
                w 2025 r.: do{" "}
                <strong>3 500 km/miesiąc × 1,15 zł/km = 48 300 zł/rok</strong>
                {" "}(stawka wg rozporządzenia Ministra Infrastruktury).
                Od stycznia 2026 r. limit obniżony do 1 500 km/miesiąc (~20 700 zł/rok).
              </li>
              <li>
                <strong>Taksówki</strong>: brak twardego limitu kwotowego — w praktyce
                empirycznie obserwujemy do ~30–40 tys. zł rocznie.
              </li>
              <li>
                <strong>Abonament RTV</strong>: ustawowo ok. 300 zł/rok per odbiornik
                (wyjątkowo wyższe gdy biuro ma kilka odbiorników).
              </li>
              <li>
                <strong>ZFŚS, świadczenia urlopowe</strong>: proporcjonalne do liczby
                zatrudnionych pracowników biura.
              </li>
              <li>
                <strong>Pozostałe kategorie</strong>: brak ustawowych pułapów per kategoria,
                ale suma 23 pozycji nie może przekroczyć ryczałtu + przeniesionych środków
                + odsetek.
              </li>
            </ul>
          </section>

          <section>
            <h3 className="text-[11px] text-muted-foreground mb-1.5 font-medium">
              Jak to się rozlicza
            </h3>
            <p>
              Do <strong>31 stycznia</strong> każdego roku poseł musi przekazać Kancelarii
              Sejmu sprawozdanie z wydatkowania ryczałtu za rok poprzedni — na
              ustandaryzowanym formularzu (Załącznik nr 1 do zarz. Marszałka Sejmu nr 2
              z 31 III 2017 r.).
            </p>
            <p>
              Sprawozdania zatwierdza <strong>Prezydium Sejmu</strong> i{" "}
              <strong>Komisja Regulaminowa i Spraw Poselskich</strong>; brak korekty w 30 dni
              od otrzymania uwag wstrzymuje wypłatę ryczałtu.
            </p>
            <p className="text-muted-foreground">
              Posłowie <strong>nie muszą</strong> przedstawiać faktur ani paragonów —
              sprawozdania to deklaracje.
            </p>
          </section>

          <section>
            <h3 className="text-[11px] text-muted-foreground mb-1.5 font-medium">
              Skąd te dane
            </h3>
            <p>
              Dane na profilu posła to bezpośredni odczyt opublikowanych skanów PDF z
              <a
                href="https://orka.sejm.gov.pl/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground mx-1"
              >
                orka.sejm.gov.pl
              </a>
              . Odczyt maszynowy (OCR) skanu ręcznie wypełnianego formularza może mieć
              drobne nieścisłości — <strong>wiążący jest oryginalny PDF</strong>, link
              do niego zawsze znajdziesz pod tabelą wydatków.
            </p>
            <p className="text-muted-foreground text-[12.5px]">
              Walidator odrzuca raporty, w których odczyt wygląda na uszkodzony (np. ujemne
              kwoty, sumy poniżej 30 tys. zł, kwoty w kategorii przekraczające ustawowy
              limit kilometrówki).
            </p>
          </section>

          <section>
            <h3 className="text-[11px] text-muted-foreground mb-1.5 font-medium">
              Podstawa prawna
            </h3>
            <ul className="list-disc pl-5 space-y-1 text-[12.5px] text-muted-foreground">
              <li>
                Art. 23 ust. 3 ustawy z 9 V 1996 r. o wykonywaniu mandatu posła i
                senatora (Dz.U. 2024 poz. 907 t.j.)
              </li>
              <li>
                Zarządzenie Marszałka Sejmu nr 8 z 25 IX 2001 r. w sprawie warunków
                organizacyjno-technicznych tworzenia, funkcjonowania i znoszenia biur
                poselskich (tekst jednolity ze zmianami).
              </li>
              <li>
                Zarządzenie Marszałka Sejmu nr 2 z 31 III 2017 r. — wzór formularza
                sprawozdania.
              </li>
              <li>
                Rozporządzenie Ministra Infrastruktury w sprawie warunków ustalania oraz
                sposobu dokonywania zwrotu kosztów używania samochodów osobowych do celów
                służbowych (stawki kilometrowe).
              </li>
            </ul>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
