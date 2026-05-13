import { DropCap } from "@/components/chrome/DropCap";
import { affectedGroupLabel, severityColor, severityLabel } from "@/lib/labels";
import type { AffectedGroup, PrintDetail } from "@/lib/db/prints";

function SectionHead({ title, subtitle }: { title: string; subtitle?: string | null }) {
  return (
    <div className="mb-5 flex items-baseline gap-4 border-b border-border pb-3">
      <h2
        className="font-serif font-medium text-foreground m-0"
        style={{ fontSize: 22, lineHeight: 1, letterSpacing: "-0.015em" }}
      >
        {title}
      </h2>
      {subtitle && <span className="font-sans text-[11.5px] text-muted-foreground ml-auto">{subtitle}</span>}
    </div>
  );
}

export function Streszczenie({ print }: { print: PrintDetail }) {
  const body = (print.summaryPlain ?? print.summary ?? "").trim();
  if (!body && print.affectedGroups.length === 0 && !print.impactPunch) return null;

  const firstChar = body ? body.charAt(0) : "";
  const rest = body ? body.slice(1) : "";

  return (
    <section className="py-12 border-b border-border">
      <div className="max-w-[1280px] mx-auto px-0">
        <SectionHead title="Po polsku, prosto" />

        <div className="grid gap-10 lg:gap-14 grid-cols-1 lg:[grid-template-columns:1.3fr_1fr]">
          {/* LEFT — drop cap paragraph */}
          <div className="min-w-0">
            {body ? (
              <p
                className="font-serif m-0"
                style={{
                  fontSize: 21,
                  lineHeight: 1.55,
                  color: "var(--secondary-foreground)",
                  textWrap: "pretty" as never,
                }}
              >
                <DropCap>{firstChar}</DropCap>
                {rest}
              </p>
            ) : (
              <p className="font-serif italic text-muted-foreground m-0">
                Streszczenie nie jest jeszcze dostępne.
              </p>
            )}
            {print.citizenAction && (
              <div
                className="mt-6 px-4 py-3 border-l-2"
                style={{
                  borderColor: "var(--destructive)",
                  background: "var(--muted)",
                }}
              >
                <div
                  className="font-mono uppercase mb-1"
                  style={{
                    fontSize: 10,
                    color: "var(--destructive)",
                    letterSpacing: "0.16em",
                  }}
                >
                  → co możesz zrobić
                </div>
                <div className="font-serif text-foreground leading-snug" style={{ fontSize: 15 }}>
                  {print.citizenAction}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT — co się dla mnie zmienia */}
          {(print.affectedGroups.length > 0 || print.impactPunch) && (
            <aside>
              <div
                className="font-mono uppercase mb-4"
                style={{
                  fontSize: 10,
                  color: "var(--destructive-deep)",
                  letterSpacing: "0.16em",
                }}
              >
                co się dla mnie zmienia
              </div>
              {print.impactPunch && (
                <div
                  className="font-serif italic text-foreground mb-5"
                  style={{ fontSize: 18, lineHeight: 1.45 }}
                >
                  {print.impactPunch}
                </div>
              )}
              {print.affectedGroups.length > 0 && (
                <div className="grid gap-2.5">
                  {print.affectedGroups.map((g, i) => (
                    <AffectedGroupCard key={`${g.tag}-${i}`} g={g} />
                  ))}
                </div>
              )}
            </aside>
          )}
        </div>
      </div>
    </section>
  );
}

function AffectedGroupCard({ g }: { g: AffectedGroup }) {
  const color = severityColor(g.severity);
  return (
    <div
      className="px-3.5 py-2.5 flex items-baseline justify-between gap-3"
      style={{
        background: "var(--muted)",
        borderLeft: `3px solid ${color}`,
      }}
    >
      <span
        className="font-serif text-foreground"
        style={{ fontSize: 14.5, lineHeight: 1.35 }}
      >
        {affectedGroupLabel(g.tag)}
      </span>
      <span
        className="font-mono whitespace-nowrap"
        style={{
          fontSize: 10,
          color,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        {severityLabel(g.severity)}
        {g.estPopulation && (
          <>
            {" · "}
            <span className="normal-case" style={{ color: "var(--muted-foreground)" }}>
              ~{(g.estPopulation / 1_000_000).toFixed(1)} mln
            </span>
          </>
        )}
      </span>
    </div>
  );
}
