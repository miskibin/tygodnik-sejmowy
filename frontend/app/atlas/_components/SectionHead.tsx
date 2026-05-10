// Shared editorial header used by every Atlas module.
// Big italic red drop-cap-style number + kicker + serif title + lede.

export function SectionHead({
  num,
  kicker,
  title,
  sub,
  isMock = false,
}: {
  num: string;
  kicker: string;
  title: string;
  sub: string;
  isMock?: boolean;
}) {
  return (
    <header className="mb-6 pb-3.5 border-b border-rule grid min-w-0 items-start gap-4 sm:items-baseline sm:gap-5 [grid-template-columns:minmax(0,44px)_minmax(0,1fr)] sm:[grid-template-columns:minmax(0,60px)_minmax(0,1fr)]">
      <div className="font-serif italic font-normal text-destructive leading-[0.9] text-[clamp(2.25rem,9vw,3.5rem)] sm:text-[56px]">
        {num}
      </div>
      <div className="min-w-0">
        <div className="font-sans text-[10px] sm:text-[11px] tracking-[0.12em] sm:tracking-[0.16em] uppercase text-muted-foreground mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>{kicker}</span>
          {isMock && (
            <span
              className="font-mono text-[10px] tracking-[0.1em] uppercase px-1.5 py-0.5 border"
              style={{ borderColor: "var(--warning)", color: "var(--warning)" }}
              title="Dane poglądowe — patrz komentarz TODO(data) w lib/db/atlas.ts"
            >
              dane poglądowe
            </span>
          )}
        </div>
        <h2 className="font-serif font-medium m-0 leading-[1.05] text-[clamp(1.5rem,5.5vw,2.25rem)] tracking-[-0.01em]">
          {title}
        </h2>
        <p className="font-serif m-0 mt-2 text-secondary-foreground leading-[1.5] max-w-[720px] text-[15px] sm:text-base">
          {sub}
        </p>
      </div>
    </header>
  );
}
