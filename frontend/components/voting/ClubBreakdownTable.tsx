"use client";

import { useRef } from "react";
import type { ClubBreakdownRow, VotingHeader } from "@/lib/db/voting";
import { ClubBadge } from "@/components/clubs/ClubBadge";
import { CopyAsPngButton } from "./CopyAsPngButton";
import { excludeUnaffiliated, MIN_KLUB_AGGREGATE } from "@/lib/clubs/filter";

type Props = {
  clubs: ClubBreakdownRow[];
  header: VotingHeader;
  shortTitle: string | null;
};

type Segment = {
  n: number;
  color: string;
  label: "ZA" | "PRZECIW" | "WSTRZ." | "NIEOB.";
  textOnFaint: boolean;
};

function SectionHead({
  label,
  title,
  subtitle,
  rightSlot,
}: {
  label: string;
  title: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
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
        className="font-serif italic"
        style={{
          fontSize: 36,
          color: "var(--destructive)",
          lineHeight: 1,
          fontWeight: 500,
        }}
      >
        {label}
      </span>
      <h2
        className="font-serif m-0"
        style={{
          fontSize: 32,
          fontWeight: 500,
          letterSpacing: "-0.018em",
          lineHeight: 1,
          color: "var(--foreground)",
        }}
      >
        {title}.
      </h2>
      {subtitle && (
        <span
          className="font-sans"
          style={{ fontSize: 12, color: "var(--muted-foreground)", marginLeft: rightSlot ? 0 : "auto" }}
        >
          {subtitle}
        </span>
      )}
      {rightSlot && <div className="ml-auto">{rightSlot}</div>}
    </div>
  );
}

function ClubRow({ c }: { c: ClubBreakdownRow }) {
  const segs: Segment[] = [
    { n: c.yes, color: "var(--success)", label: "ZA", textOnFaint: false },
    { n: c.no, color: "var(--destructive)", label: "PRZECIW", textOnFaint: false },
    { n: c.abstain, color: "var(--warning)", label: "WSTRZ.", textOnFaint: false },
    { n: c.not_voting, color: "var(--border)", label: "NIEOB.", textOnFaint: true },
  ];
  const total = c.total;
  const showBroken =
    c.brokenCount > 0 &&
    (c.disciplineLabel === "ZA" ||
      c.disciplineLabel === "PRZECIW" ||
      c.disciplineLabel === "WSTRZ.");

  const bar = (
    <div
      className="flex"
      style={{
        height: 34,
        background: "var(--muted)",
        border: "1px solid var(--border)",
      }}
    >
      {segs.map((s, i) => {
        const pct = total > 0 ? s.n / total : 0;
        const showLabel = s.n > 0 && pct > 0.05;
        return (
          <div
            key={i}
            title={`${s.label} ${s.n}`}
            className="flex items-center justify-center font-mono"
            style={{
              width: `${pct * 100}%`,
              background: s.color,
              fontSize: 10,
              fontWeight: 600,
              color: s.textOnFaint ? "var(--secondary-foreground)" : "var(--background)",
            }}
          >
            {showLabel ? s.n : ""}
          </div>
        );
      })}
    </div>
  );

  const disciplineBlock = (
    <div
      className="font-sans text-right"
      style={{ fontSize: 12, color: "var(--secondary-foreground)" }}
    >
      <span
        className="font-mono uppercase"
        style={{
          fontSize: 10,
          color: "var(--muted-foreground)",
          letterSpacing: "0.12em",
        }}
      >
        za klubem{" "}
      </span>
      <span
        style={{
          color: c.disciplineLabel === "—" ? "var(--muted-foreground)" : "var(--foreground)",
          fontWeight: 500,
        }}
      >
        {c.disciplineLabel}
      </span>
      {showBroken && (
        <span
          className="font-mono uppercase"
          style={{
            marginLeft: 10,
            color: "var(--destructive)",
            fontSize: 10,
            letterSpacing: "0.12em",
          }}
        >
          ↪ złamań: {c.brokenCount}
        </span>
      )}
    </div>
  );

  return (
    <div className="club-row py-3 sm:py-4 border-b border-border">
      {/* Mobile: stacked. Header row + bar + discipline */}
      <div className="flex sm:hidden flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span
              aria-hidden
              className="shrink-0"
              style={{ width: 4, height: 28, background: c.clubColor, borderRadius: 2 }}
            />
            <ClubBadge
              klub={c.club_ref}
              clubColor={c.clubColor}
              clubName={c.club_name}
              size="md"
              variant="logo"
            />
          </div>
          <div
            className="font-mono tabular-nums text-right shrink-0"
            style={{ fontSize: 12, color: "var(--secondary-foreground)" }}
          >
            {c.total} mandatów
          </div>
        </div>
        {bar}
        <div className="text-left">{disciplineBlock}</div>
      </div>

      {/* Tablet+: original 4-col grid */}
      <div
        className="hidden sm:grid items-center"
        style={{
          gridTemplateColumns: "120px 80px 1fr 240px",
          gap: 24,
        }}
      >
        <div className="flex items-center" style={{ gap: 12 }}>
          <span
            aria-hidden
            style={{ width: 4, height: 32, background: c.clubColor, borderRadius: 2 }}
          />
          <ClubBadge
            klub={c.club_ref}
            clubColor={c.clubColor}
            clubName={c.club_name}
            size="lg"
            variant="logo"
          />
        </div>

        <div
          className="font-mono tabular-nums text-right"
          style={{ fontSize: 13, color: "var(--secondary-foreground)" }}
        >
          {c.total}
        </div>

        {bar}

        {disciplineBlock}
      </div>
    </div>
  );
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

export function ClubBreakdownTable({ clubs, header, shortTitle }: Props) {
  const captureRef = useRef<HTMLDivElement | null>(null);

  return (
    <section
      className="px-4 sm:px-8 md:px-14 py-10 sm:py-14 md:py-16"
      style={{
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div className="mx-auto" style={{ maxWidth: 1100 }}>
        <SectionHead
          label="II"
          title="Jak głosowały kluby"
          subtitle="każdy rząd to jeden klub. szare słupki — odsetek mandatów; kolory — głosy"
          rightSlot={<CopyAsPngButton targetRef={captureRef} filename={`glosowanie-${header.sitting}-${header.voting_number}.png`} />}
        />

        <div
          className="font-mono uppercase"
          style={{
            fontSize: 10,
            color: "var(--muted-foreground)",
            letterSpacing: "0.16em",
            marginBottom: 6,
          }}
        >
          Sejm {header.term} · pos. {header.sitting} · głos. nr {header.voting_number} · {formatDateShort(header.date)}
        </div>
        <div
          className="font-serif"
          style={{
            fontSize: 20,
            fontWeight: 500,
            color: "var(--foreground)",
            lineHeight: 1.25,
            marginBottom: 24,
          }}
        >
          {shortTitle ?? header.title}
        </div>

        <div
          ref={captureRef}
          style={{
            background: "var(--background)",
            padding: 16,
            border: "1px solid var(--border)",
          }}
        >
          {/* Capture-only header — only visible in PNG export, not the live page */}
          <div
            className="png-only font-serif"
            style={{
              borderBottom: "1px solid var(--border)",
              paddingBottom: 14,
              marginBottom: 18,
            }}
          >
            <div
              className="font-mono uppercase"
              style={{
                fontSize: 10,
                color: "var(--muted-foreground)",
                letterSpacing: "0.16em",
                marginBottom: 6,
              }}
            >
              Sejm {header.term} · pos. {header.sitting} · głos. nr {header.voting_number} · {formatDateShort(header.date)}
            </div>
            <div style={{ fontSize: 22, fontWeight: 500, color: "var(--foreground)", lineHeight: 1.2 }}>
              {shortTitle ?? header.title}
            </div>
          </div>

          <div
            className="hidden sm:grid items-center font-mono uppercase"
            style={{
              gridTemplateColumns: "120px 80px 1fr 240px",
              gap: 24,
              fontSize: 10,
              color: "var(--muted-foreground)",
              letterSpacing: "0.14em",
              borderBottom: "1px solid var(--rule)",
              paddingBottom: 10,
              marginBottom: 4,
            }}
          >
            <span>Klub</span>
            <span className="text-right">Mandaty</span>
            <span>Rozkład głosów</span>
            <span className="text-right">Dyscyplina</span>
          </div>

          {/* Niezrzeszeni excluded — single-MP "klub" rolled-ups distort the
              narrative. They still appear in the imienna roster below.
              Also drop sub-MIN_KLUB_AGGREGATE klubs: discipline numbers from
              <3-MP klubs are noise, not signal. */}
          {excludeUnaffiliated(clubs, (c) => c.club_ref)
            .filter((c) => (c.total ?? 0) >= MIN_KLUB_AGGREGATE)
            .map((c) => (
              <ClubRow key={c.club_ref} c={c} />
            ))}

          <div
            className="png-only font-mono uppercase"
            style={{
              marginTop: 18,
              paddingTop: 12,
              borderTop: "1px solid var(--border)",
              fontSize: 9,
              color: "var(--muted-foreground)",
              letterSpacing: "0.18em",
              textAlign: "right",
            }}
          >
            sejmograf.vercel.app
          </div>
        </div>
      </div>

      <style>{`
        .png-only { display: none; }
        .capturing .png-only { display: block; }
      `}</style>
    </section>
  );
}
