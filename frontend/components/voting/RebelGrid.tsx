import type { Rebel } from "@/lib/db/voting";
import { RebelCard } from "./RebelCard";

function rebelsSubtitle(n: number): string {
  if (n === 1) return "1 poseł zagłosował inaczej, niż zalecała jego partia";
  return `${n} posłów zagłosowało inaczej, niż zalecała ich partia`;
}

function SectionHead({
  label,
  title,
  subtitle,
}: {
  label: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div
      className="flex items-baseline flex-wrap"
      style={{
        marginBottom: 32,
        gap: 24,
        borderBottom: "2px solid var(--rule)",
        paddingBottom: 18,
      }}
    >
      <span
        className="font-serif"
        style={{
          fontStyle: "italic",
          fontSize: 36,
          color: "var(--destructive)",
          lineHeight: 1,
          fontWeight: 500,
        }}
      >
        {label}
      </span>
      <h2
        className="font-serif"
        style={{
          fontSize: 32,
          fontWeight: 500,
          letterSpacing: "-0.018em",
          margin: 0,
          lineHeight: 1,
          color: "var(--foreground)",
        }}
      >
        {title}.
      </h2>
      {subtitle && (
        <span
          className="font-sans"
          style={{
            fontSize: 12,
            color: "var(--muted-foreground)",
            marginLeft: "auto",
          }}
        >
          {subtitle}
        </span>
      )}
    </div>
  );
}

export function RebelGrid({ rebels, term }: { rebels: Rebel[]; term: number }) {
  return (
    <section
      className="px-4 sm:px-8 md:px-14 py-12 sm:py-16"
      style={{
        borderBottom: "1px solid var(--border)",
        background: "var(--muted)",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <SectionHead
          label="III"
          title="Wbrew klubowi"
          subtitle={rebelsSubtitle(rebels.length)}
        />

        {rebels.length === 0 ? (
          <p
            className="font-serif text-center"
            style={{
              fontStyle: "italic",
              fontSize: 16,
              color: "var(--secondary-foreground)",
              margin: 0,
              padding: "32px 0",
            }}
          >
            Wszyscy posłowie zagłosowali zgodnie z dyscypliną klubową.
          </p>
        ) : (
          <div
            className="grid grid-cols-1 min-[600px]:grid-cols-2 min-[900px]:grid-cols-3"
            style={{ gap: 24 }}
          >
            {rebels.map((r) => (
              <RebelCard key={r.mp_id} rebel={r} term={term} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
