// Shared header for Atlas modules. Keep the data explanation close to the
// title, but avoid adding a decorative number and question-like kicker to
// every section.

export function SectionHead({
  title,
  sub,
  isMock = false,
}: {
  title: string;
  sub: string;
  isMock?: boolean;
}) {
  return (
    <header className="mb-6 pb-3.5 border-b border-rule min-w-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="font-medium m-0 leading-[1.05] text-[clamp(1.5rem,5.5vw,2.25rem)] tracking-[-0.01em]">
          {title}
        </h2>
        {isMock && (
          <span
            className="text-[11px] px-1.5 py-0.5 border font-medium"
            style={{ borderColor: "var(--warning)", color: "var(--warning)" }}
            title="Dane poglądowe — patrz komentarz TODO(data) w lib/db/atlas.ts"
          >
            dane poglądowe
          </span>
        )}
      </div>
      <p className="m-0 mt-2 text-secondary-foreground leading-[1.5] max-w-[720px] text-[15px] sm:text-base">
        {sub}
      </p>
    </header>
  );
}
