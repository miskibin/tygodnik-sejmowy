import { Ornament } from "@/components/chrome/Ornament";
import { PageBreadcrumb } from "@/components/chrome/PageBreadcrumb";

// Manifest is a static editorial page — no data, no force-dynamic.
// Patronite tiers and the anti-feature list are the emotional contract
// with patrons, not a feature catalogue.

type Tier = {
  name: string;
  price: string;
  desc: string;
  tag?: string;
};

const TIERS: Tier[] = [
  {
    name: "Obserwator · Obserwatorka",
    price: "15 zł / mies.",
    tag: "najpopularniejszy",
    desc: "Dostęp do tygodnika. Otrzymujesz to samo, co każdy obywatel — Brief, alerty, pełną aplikację. Płacisz, żeby to istniało, nie żeby mieć przewagę.",
  },
  {
    name: "Strażnik · Strażniczka",
    price: "30 zł / mies.",
    desc: "Plus: kalendarz głosowań w formacie ICS — synchronizacja z Twoim kalendarzem. Wiesz, co Sejm robi w tym tygodniu, zanim się zacznie.",
  },
  {
    name: "Mecenas · Mecenaska",
    price: "100 zł / mies.",
    desc: "Plus: pełne dane w CSV/JSON do własnych analiz. Twoje imię (jeśli chcesz) w rocznym tekście rocznicowym.",
  },
];

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
    <main className="bg-background text-foreground font-serif">
      <div className="px-4 sm:px-8 md:px-14 pt-8" style={{ maxWidth: 980, margin: "0 auto" }}>
        <PageBreadcrumb
          items={[{ label: "Manifest" }]}
          subtitle="Tygodniowy list do mieszkańców Rzeczypospolitej — i kontrakt z patronami, którzy płacą, żeby to istniało."
        />
      </div>

      {/* Dlaczego — short editorial */}
      <section
        className="font-serif text-foreground px-4 sm:px-8 md:px-14 py-12 sm:py-15"
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

      <Ornament />

      {/* Anti-feature list */}
      <section
        className="font-serif px-4 sm:px-8 md:px-14 pt-5 pb-12 sm:pb-15"
        style={{ maxWidth: 760, margin: "0 auto" }}
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground m-0 mb-2">
          Antyfeatury
        </p>
        <h2
          className="font-serif font-medium m-0 mb-7"
          style={{ fontSize: 34, letterSpacing: "-0.015em" }}
        >
          Czego <em className="text-destructive">nie zrobimy</em> nigdy.
        </h2>
        <ul className="list-none p-0 m-0">
          {ANTI.map(([h, b], i) => (
            <li key={i} className="relative" style={{ marginBottom: 22, paddingLeft: 36 }}>
              <span
                aria-hidden
                className="absolute left-0 top-0 font-serif italic text-destructive"
                style={{ fontSize: 28, lineHeight: 1 }}
              >
                ×
              </span>
              <strong className="font-serif">{h}</strong>{" "}
              <span className="text-secondary-foreground" style={{ fontSize: 18, lineHeight: 1.55 }}>
                {b}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Patronite tiers */}
      <section
        className="border-t border-rule px-4 sm:px-8 md:px-14 py-12 sm:py-15"
        style={{ maxWidth: 1200, margin: "0 auto" }}
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground m-0 mb-2">
          Patronite
        </p>
        <h2
          className="font-serif font-normal m-0 mb-9"
          style={{ fontSize: 38, letterSpacing: "-0.02em" }}
        >
          Trzy progi.{" "}
          <em className="text-destructive not-italic font-serif italic">Wszystkie z tego samego powodu.</em>
        </h2>

        <div className="grid gap-6 md:grid-cols-3">
          {TIERS.map((t, i) => {
            const featured = i === 0;
            return (
              <article
                key={t.name}
                className={
                  "relative p-7 transition-transform hover:-translate-y-0.5 " +
                  (featured
                    ? "bg-foreground text-background border-2 border-foreground"
                    : "bg-background text-foreground border-2 border-rule hover:border-foreground")
                }
                style={featured ? { boxShadow: "6px 6px 0 var(--destructive)" } : undefined}
              >
                {t.tag && (
                  <span
                    className="absolute font-mono uppercase bg-destructive text-background"
                    style={{ top: -12, left: 22, padding: "3px 10px", fontSize: 9, letterSpacing: "0.14em" }}
                  >
                    {t.tag}
                  </span>
                )}
                <h3 className="font-serif font-medium m-0 mb-2" style={{ fontSize: 22, lineHeight: 1.2 }}>
                  {t.name}
                </h3>
                <p
                  className={"font-serif italic m-0 mb-4 " + (featured ? "text-highlight" : "text-destructive")}
                  style={{ fontSize: 30 }}
                >
                  {t.price}
                </p>
                <p className="font-serif m-0" style={{ fontSize: 15, lineHeight: 1.55, opacity: 0.92 }}>
                  {t.desc}
                </p>
              </article>
            );
          })}
        </div>

      </section>
    </main>
  );
}
