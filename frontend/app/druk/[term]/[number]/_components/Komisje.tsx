import { stageLabel } from "@/lib/stages";
import type { ProcessStage } from "@/lib/db/prints";

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

function shortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const COMMITTEE_STAGE_TYPES = new Set(["CommitteeWork", "CommitteeReport", "Reading"]);

export function Komisje({ stages }: { stages: ProcessStage[] }) {
  // Pull every committee-related stage at any depth. Sub-stages (depth > 0)
  // are typically the actual posiedzenia — top-level CommitteeWork is the
  // umbrella entry that contains them.
  const rows = stages.filter((s) => COMMITTEE_STAGE_TYPES.has(s.stageType));
  if (rows.length === 0) return null;

  return (
    <section
      className="py-12 border-b border-border"
      style={{ background: "var(--muted)" }}
    >
      <div className="max-w-[1280px] mx-auto">
        <SectionHead title="Posiedzenia komisji" subtitle={`${rows.length} ${rows.length === 1 ? "posiedzenie" : "posiedzeń"}`} />

        <ol className="list-none p-0 m-0 relative">
          <div
            className="absolute top-2 bottom-3 w-px"
            style={{ left: 96, background: "var(--border)" }}
          />
          {rows.map((k, i) => (
            <KomisjaRow key={`${k.ord}-${i}`} k={k} />
          ))}
        </ol>
      </div>
    </section>
  );
}

function KomisjaRow({ k }: { k: ProcessStage }) {
  const pending = !k.stageDate;
  const label = stageLabel(k.stageType, k.stageName);
  return (
    <li
      className="grid py-4.5 border-b border-border relative"
      style={{
        gridTemplateColumns: "96px 1fr",
        gap: 0,
        paddingTop: 16,
        paddingBottom: 16,
      }}
    >
      <div className="pr-5 text-right relative">
        <div
          className="font-mono font-medium"
          style={{ fontSize: 13, color: pending ? "var(--muted-foreground)" : "var(--foreground)" }}
        >
          {pending ? "oczekuje" : shortDate(k.stageDate)}
        </div>
        {k.sittingNum != null && (
          <div
            className="font-mono"
            style={{ fontSize: 10, color: "var(--muted-foreground)", letterSpacing: "0.08em" }}
          >
            pos. {k.sittingNum}
          </div>
        )}
        <div
          className="absolute rounded-full"
          style={{
            right: -7,
            top: 6,
            width: 13,
            height: 13,
            background: pending ? "var(--muted)" : "var(--foreground)",
            border: pending ? "1px dashed var(--muted-foreground)" : "3px solid var(--muted)",
            boxShadow: pending ? "none" : "0 0 0 1px var(--foreground)",
          }}
        />
      </div>

      <div className="pl-6">
        <div className="flex items-baseline gap-3 flex-wrap mb-1">
          <h3
            className="font-serif font-medium m-0 text-foreground"
            style={{ fontSize: 18, letterSpacing: "-0.005em" }}
          >
            {label}
          </h3>
          {k.depth > 0 && (
            <span
              className="font-mono uppercase"
              style={{
                fontSize: 10,
                color: "var(--muted-foreground)",
                letterSpacing: "0.12em",
              }}
            >
              etap {k.depth}
            </span>
          )}
        </div>
        {k.stageName && k.stageName !== label && (
          <p
            className="font-serif m-0 mb-1.5"
            style={{
              fontSize: 14.5,
              lineHeight: 1.55,
              color: "var(--secondary-foreground)",
              textWrap: "pretty" as never,
              maxWidth: 760,
            }}
          >
            {k.stageName}
          </p>
        )}
        {k.decision && (
          <div
            className="inline-flex items-center gap-2 font-mono uppercase"
            style={{
              fontSize: 10.5,
              color: pending ? "var(--muted-foreground)" : "var(--destructive-deep)",
              letterSpacing: "0.1em",
            }}
          >
            → {k.decision}
          </div>
        )}
      </div>
    </li>
  );
}
