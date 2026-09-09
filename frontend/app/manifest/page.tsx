import type { Metadata } from "next";
import { PatroniteTrackedLink } from "@/components/chrome/PatroniteTrackedLink";
import { PageBreadcrumb } from "@/components/chrome/PageBreadcrumb";

export const metadata: Metadata = {
  alternates: { canonical: "/manifest" },
};

const ANTI: Array<[string, string]> = [
  ["Rankingu „najaktywniejszych” posłów.", "The Times pokazał w 2006 roku, że takie rankingi nakręcają śmieć — masowe pytania kosmetyczne dla statystyki."],
  ["Partyjnych badge’y sentymentu („dobry / zły”).", "Liczby trzymają się jednoznacznie. Interpretacje należą do Ciebie."],
  ["Czatu udającego asystenta prawnego.", "Halucynujący czatbot z poradami prawnymi to nie tylko bezużyteczne — to aktywnie szkodliwe."],
  ["Komentarzy ani forum.", "Internet ma już dość miejsc, w których obywatele krzyczą na siebie nawzajem."],
  ["Paywalla na podstawowe funkcje.", "Patroni płacą, żeby to istniało. Każdy korzysta tak samo."],
  ["Mikropodatków per druk.", "Nie każde kliknięcie musi coś kosztować. To nie aplikacja randkowa."],
];

export default function ManifestPage() {
  return (
    <main className="bg-background text-foreground">
      <div className="px-4 sm:px-8 md:px-14 pt-8" style={{ maxWidth: 980, margin: "0 auto" }}>
        <PageBreadcrumb
          items={[{ label: "Manifest" }]}
          subtitle="Tygodniowy list do mieszkańców Rzeczypospolitej — i kontrakt z patronami, którzy płacą, żeby to istniało."
        />
      </div>

      {/* Dlaczego — short editorial */}
      <section
        className="text-foreground px-4 sm:px-8 md:px-14 py-12 sm:py-15"
        style={{ maxWidth: 760, margin: "0 auto", fontSize: "clamp(17px, 2.4vw, 21px)", lineHeight: 1.65 }}
      >
        <p style={{ margin: "0 0 22px" }}>
          Tych projektów już mieliśmy w Polsce kilka — Sejmometr, mojepanstwo, sejm-stats. Wszystkie skończyły jako muzeum: zaczęte z grantu, opuszczone po jego końcu. <strong>Tygodnik Sejmowy</strong> ma być inny, bo finansują go ludzie, którzy chcą, żeby istniał — nie instytucja, która chce, żeby pasował do raportu.
        </p>
        <p style={{ margin: "0 0 22px" }}>
          Każdy piątek, po zakończeniu posiedzenia, dostajesz e-mail. Trzy do siedmiu rzeczy, które zmieniły się w Twoim życiu — nie w abstrakcyjnym życiu obywatela, tylko w Twoim. Pisze go program, czyta go człowiek, a po pięciu minutach <em>wiesz</em>, czy w tym tygodniu Sejm zrobił coś, na co warto zareagować. Czasem nie zrobił nic. Wtedy też tak napiszemy.
        </p>

        <div
          className="border-l-4 border-destructive bg-highlight italic my-9 mx-0 sm:-mx-5 px-5 py-5 sm:px-7"
          style={{ fontSize: "clamp(17px, 2.4vw, 22px)", lineHeight: 1.5 }}
        >
          „Nie udawajmy, że jesteśmy apolityczni. Bądźmy proceduralnie neutralni — to nie to samo.”
        </div>

        <p style={{ margin: "0 0 8px", color: "var(--secondary-foreground)" }}>
          Wszystkie liczby w aplikacji — głosowania, koszty, opóźnienia ministrów, dyscyplina klubowa — mają dokumentowane źródło i można je sprawdzić w transparentnym ledgerze ETL. Bez gwiazdek, bez „proprietary score”, bez czarnych skrzynek.
        </p>
      </section>


      {/* Anti-feature list */}
      <section
        className="px-4 sm:px-8 md:px-14 pt-5 pb-12 sm:pb-15"
        style={{ maxWidth: 760, margin: "0 auto" }}
      >
        <p className="text-[11px] text-muted-foreground m-0 mb-2 font-medium">
          Antyfeatury
        </p>
        <h2
          className="font-medium m-0 mb-7"
          style={{ fontSize: 34, letterSpacing: "-0.015em" }}
        >
          Czego <em className="text-destructive">nie zrobimy</em> nigdy.
        </h2>
        <ul className="list-none p-0 m-0">
          {ANTI.map(([h, b], i) => (
            <li key={i} className="relative" style={{ marginBottom: 22, paddingLeft: 36 }}>
              <span
                aria-hidden
                className="absolute left-0 top-0 italic text-destructive"
                style={{ fontSize: 28, lineHeight: 1 }}
              >
                ×
              </span>
              <strong className="">{h}</strong>{" "}
              <span className="text-secondary-foreground" style={{ fontSize: 18, lineHeight: 1.55 }}>
                {b}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-[1100px] px-5 py-12">
        <div className="rounded-2xl border border-border bg-muted p-7 md:p-10">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-primary">Patronite</p>
          <h2 className="mb-4 text-3xl font-semibold tracking-tight">Pomóż nam rozwijać Tygodnik.</h2>
          <p className="max-w-2xl text-secondary-foreground leading-relaxed">Twoje wsparcie pomaga utrzymać serwer, pobierać dane i rozwijać aplikację. Aktualne progi i warunki wsparcia znajdziesz na naszym profilu Patronite.</p>
          <PatroniteTrackedLink placement="manifest" className="mt-6 inline-flex rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground">Wesprzyj na Patronite ↗</PatroniteTrackedLink>
        </div>
      </section>
    </main>
  );
}
