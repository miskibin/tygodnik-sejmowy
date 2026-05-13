import Link from "next/link";
import type { Metadata } from "next";
import { PageBreadcrumb } from "@/components/chrome/PageBreadcrumb";

export const metadata: Metadata = {
  title: "Polityka prywatności",
  description:
    "Jak przetwarzamy dane na tygodniksejmowy.pl. W skrócie: cookieless analytics, brak danych osobowych, brak banera zgody.",
  alternates: { canonical: "/polityka-prywatnosci" },
};

const UPDATED_AT = "13 maja 2026";

function Section({ kicker, title, children }: { kicker: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground mb-2">
        {kicker}
      </div>
      <h2 className="font-serif text-[22px] font-medium tracking-[-0.02em] leading-tight text-foreground mt-0 mb-3">
        {title}
      </h2>
      <div className="font-sans text-[14.5px] leading-[1.7] text-secondary-foreground space-y-3">
        {children}
      </div>
    </section>
  );
}

export default function PolitykaPrywatnosciPage() {
  return (
    <main className="bg-background text-foreground px-4 sm:px-8 md:px-14 pt-10 sm:pt-12 pb-24">
      <div className="max-w-[760px] mx-auto">
        <PageBreadcrumb
          items={[{ label: "Polityka prywatności" }]}
          subtitle={`Ostatnia aktualizacja: ${UPDATED_AT}.`}
        />

        <p className="font-serif italic text-[15px] leading-[1.6] text-foreground mb-10 max-w-[640px]">
          Tygodnik Sejmowy to niezarejestrowany projekt open source. Nie używamy plików cookies
          analitycznych ani marketingowych. Nie zbieramy danych osobowych. Nie potrzebujemy banera
          zgody.
        </p>

        <Section kicker="01" title="Administrator danych">
          <p>
            Administratorem danych jest osoba prowadząca projekt Tygodnik Sejmowy. Kontakt
            w sprawach prywatności:{" "}
            <a
              href="mailto:mskibinski109@gmail.com"
              className="text-destructive hover:underline"
            >
              mskibinski109@gmail.com
            </a>
            .
          </p>
        </Section>

        <Section kicker="02" title="Jakie dane zbieramy">
          <p>
            Tylko zagregowane statystyki ruchu: liczba odsłon, kraj, urządzenie, przeglądarka,
            system, strona odsyłająca oraz kliknięcia w wybrane przyciski (np. Wsparcie,
            wyszukiwanie, linki zewnętrzne).
          </p>
          <p>
            Bez identyfikatorów osobowych. Bez profilowania. Bez sprzedaży danych.
            Bez śledzenia między stronami.
          </p>
          <p>
            Narzędzie:{" "}
            <a
              href="https://umami.is"
              target="_blank"
              rel="noopener noreferrer"
              className="text-destructive hover:underline"
            >
              Umami Cloud
            </a>{" "}
            (Umami Software, Inc.). Rozwiązanie cookieless — nie zapisujemy plików cookies
            analitycznych. Adres IP jest haszowany po stronie Umami i nie jest przechowywany
            w formie surowej.
          </p>
        </Section>

        <Section kicker="03" title="Pliki cookies">
          <p>
            Strona zapisuje wyłącznie cookies <strong>niezbędne</strong> do działania
            (np. <code className="font-mono text-[12.5px] bg-muted px-1 rounded">sidebar_state</code>{" "}
            przechowujący stan panelu bocznego). Niezbędne cookies nie wymagają zgody zgodnie
            z art. 398 ust. 2 ustawy Prawo Komunikacji Elektronicznej.
          </p>
        </Section>

        <Section kicker="04" title="Podstawa prawna przetwarzania">
          <p>
            Art. 6 ust. 1 lit. f RODO — prawnie uzasadniony interes administratora (zapewnienie
            działania strony i analiza ruchu w sposób nieidentyfikujący użytkowników).
          </p>
        </Section>

        <Section kicker="05" title="Twoje prawa">
          <p>
            Masz prawo do dostępu, sprostowania, usunięcia, ograniczenia, sprzeciwu wobec
            przetwarzania i przenoszenia danych oraz <strong>skargi do Prezesa UODO</strong>{" "}
            (
            <a
              href="https://uodo.gov.pl"
              target="_blank"
              rel="noopener noreferrer"
              className="text-destructive hover:underline"
            >
              uodo.gov.pl
            </a>
            ).
          </p>
          <p>
            Ponieważ nie przechowujemy danych osobowych, w praktyce każde żądanie sprowadza się
            do informacji „nie mamy nic do udostępnienia ani usunięcia".
          </p>
        </Section>

        <Section kicker="06" title="Linki zewnętrzne">
          <p>
            Strona linkuje m.in. do Patronite, GitHub, X, YouTube, sejm.gov.pl, ELI (Dz.U. / M.P.).
            Po kliknięciu obowiązują polityki tych serwisów.
          </p>
        </Section>

        <Section kicker="07" title="Zmiany">
          <p>
            Aktualizacje tej polityki publikujemy na tej stronie z datą zmiany.
          </p>
        </Section>

        <div className="mt-12 pt-6 border-t border-border">
          <Link href="/" className="font-mono text-[12px] tracking-wide text-destructive hover:underline">
            ← Wróć do strony głównej
          </Link>
        </div>
      </div>
    </main>
  );
}
