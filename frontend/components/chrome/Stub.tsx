export function Stub({ kicker, title, blurb }: { kicker: string; title: string; blurb: string }) {
  return (
    <main className="bg-background text-foreground font-serif pb-20">
      <section className="border-b border-rule">
        <div className="max-w-[1100px] mx-auto px-4 md:px-8 lg:px-14 pt-8 pb-5">
          <div className="flex items-baseline justify-between gap-4 flex-wrap">
            <div>
              <div className="font-sans text-[10px] tracking-[0.18em] uppercase text-destructive mb-2">
                {kicker}
              </div>
              <h1
                className="font-medium tracking-[-0.03em] m-0 leading-none"
                style={{ fontSize: "clamp(1.875rem, 4.5vw, 2.75rem)" }}
              >
                {title}
              </h1>
            </div>
            <p className="font-serif italic text-[12.5px] text-secondary-foreground max-w-[420px] m-0 leading-snug">
              {blurb}
            </p>
          </div>
        </div>
      </section>

      <div className="max-w-[1100px] mx-auto px-4 md:px-8 lg:px-14 py-20 text-center">
        <div className="inline-block px-4 py-2 rounded-full bg-muted border border-rule font-sans text-[12px] text-muted-foreground tracking-wide">
          ◷ wkrótce — ten dział zbudujemy w&nbsp;kolejnej iteracji
        </div>
      </div>
    </main>
  );
}
