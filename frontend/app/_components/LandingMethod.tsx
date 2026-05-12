const PIPELINE_STEPS = [
  {
    title: "Źródła publiczne",
    body: "Druki, głosowania, komisje, stenogramy i akty prawne z oficjalnych publikacji.",
  },
  {
    title: "Parsery i łączenie",
    body: "Normalizujemy dane, spinamy je w jeden proces legislacyjny i zachowujemy ślad pochodzenia.",
  },
  {
    title: "Redakcja skutków",
    body: "Na końcu opisujemy, co z tego wynika dla ludzi i ich okręgów, prostym językiem.",
  },
] as const;

const SOURCE_TAGS = [
  "Sejm",
  "głosowania",
  "komisje",
  "stenogramy",
  "Dz.U./MP",
] as const;

export function LandingMethod() {
  return (
    <section className="px-4 md:px-8 lg:px-14 py-12 md:py-14 border-b border-rule bg-muted/40">
      <div className="max-w-[1100px] mx-auto grid gap-10 lg:grid-cols-[1fr_1.1fr] items-start">
        <div>
          <div className="font-mono text-[11px] tracking-[0.18em] uppercase text-destructive mb-3">
            ✶ metoda
          </div>
          <h2
            className="font-serif font-medium tracking-[-0.03em] leading-[1.02] m-0 mb-4"
            style={{ fontSize: "clamp(2rem, 5vw, 3.35rem)" }}
          >
            Nie prosimy o zaufanie do narracji.
            <br />
            <em className="text-destructive">Pokazujemy warsztat.</em>
          </h2>
          <p className="font-serif text-[16px] md:text-[18px] leading-[1.65] text-secondary-foreground m-0 mb-4 max-w-[60ch]">
            Supagraf zaczyna od danych, nie od tekstu. Zbieramy dokumenty, głosowania, komisje,
            transkrypcje i akty prawne z publicznych źródeł, łączymy je w jeden proces
            legislacyjny, a dopiero potem tłumaczymy skutki prostym językiem.
          </p>
          <p className="font-serif text-[15px] md:text-[16px] leading-[1.65] text-secondary-foreground m-0 max-w-[58ch]">
            AI pomaga przy redakcji i klasyfikacji. Nie jest źródłem prawdy. Każdy ważny skrót ma
            prowadzić do dokumentu, głosowania albo etapu procesu.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {SOURCE_TAGS.map((tag) => (
              <span
                key={tag}
                className="px-2.5 py-1 rounded-full border border-border bg-background font-sans text-[11px] tracking-wide text-secondary-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div className="border border-rule bg-background p-5 md:p-6 rounded-lg">
          <div className="flex items-center justify-between gap-3 mb-5">
            <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-muted-foreground">
              Jak to powstaje
            </div>
            <span className="font-sans text-[11px] px-2.5 py-1 rounded-full border border-border bg-muted text-muted-foreground">
              AI: mała warstwa pomocnicza
            </span>
          </div>

          <div className="grid gap-3">
            {PIPELINE_STEPS.map((step, index) => (
              <div key={step.title} className="relative">
                {index < PIPELINE_STEPS.length - 1 ? (
                  <span
                    aria-hidden
                    className="absolute left-[19px] top-[52px] h-[calc(100%-30px)] w-px bg-border"
                  />
                ) : null}
                <div className="flex gap-4">
                  <div className="w-10 shrink-0 flex flex-col items-center">
                    <span className="w-10 h-10 rounded-full border border-rule bg-muted flex items-center justify-center font-mono text-[11px] text-destructive">
                      0{index + 1}
                    </span>
                  </div>
                  <div className="flex-1 border border-border bg-muted/50 px-4 py-3 rounded-md">
                    <div className="font-serif text-[19px] font-medium tracking-[-0.02em] text-foreground">
                      {step.title}
                    </div>
                    <div className="mt-1 font-sans text-[13px] leading-[1.6] text-secondary-foreground">
                      {step.body}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-md border border-dashed border-border px-4 py-3 bg-muted/60">
            <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-muted-foreground mb-1.5">
              Rola AI
            </div>
            <p className="m-0 font-sans text-[12.5px] leading-[1.6] text-secondary-foreground">
              Pomaga porządkować i redagować. Dane źródłowe, parsery, migracje i linki do dokumentów
              są fundamentem produktu.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
