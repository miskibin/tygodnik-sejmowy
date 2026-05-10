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
    <header
      className="mb-6 pb-3.5 border-b border-rule grid items-baseline gap-5"
      style={{ gridTemplateColumns: "60px 1fr" }}
    >
      <div
        className="font-serif italic font-normal text-destructive"
        style={{ fontSize: 56, lineHeight: 0.9 }}
      >
        {num}
      </div>
      <div>
        <div className="font-sans text-[11px] tracking-[0.16em] uppercase text-muted-foreground mb-1.5 flex items-center gap-3">
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
        <h2
          className="font-serif font-medium m-0 leading-[1.05]"
          style={{ fontSize: 36, letterSpacing: "-0.01em" }}
        >
          {title}
        </h2>
        <p
          className="font-serif m-0 mt-2 text-secondary-foreground leading-[1.5] max-w-[720px]"
          style={{ fontSize: 16 }}
        >
          {sub}
        </p>
      </div>
    </header>
  );
}
