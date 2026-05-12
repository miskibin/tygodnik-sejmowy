"use client";

import { useRef } from "react";
import type { ClubBreakdownRow, VotingHeader } from "@/lib/db/voting";
import { ClubBadge } from "@/components/clubs/ClubBadge";
import { CLUB_LOGOS } from "@/lib/atlas/club-logos";
import { KLUB_LABELS } from "@/lib/atlas/constants";
import { CopyAsPngButton } from "./CopyAsPngButton";
import { excludeUnaffiliated, MIN_KLUB_AGGREGATE } from "@/lib/clubs/filter";

type Props = {
  clubs: ClubBreakdownRow[];
  header: VotingHeader;
  shortTitle: string | null;
  printNumber: string | null;
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

// Compact, viewport-independent row used inside the PNG capture node only.
// Plain <img> with loading="eager" so the off-screen capture target doesn't
// trip Next/Image's lazy-load IntersectionObserver (which never fires for
// elements positioned outside the viewport).
function PngClubRow({ c, isLast }: { c: ClubBreakdownRow; isLast: boolean }) {
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

  const logoEntry = CLUB_LOGOS[c.club_ref];
  const shortLabel = KLUB_LABELS[c.club_ref] ?? c.club_ref;

  const logo = logoEntry ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/club-logos/${logoEntry.file}`}
      alt={c.club_name}
      width={40}
      height={40}
      loading="eager"
      decoding="sync"
      style={{
        width: 40,
        height: 40,
        objectFit: "contain",
        borderRadius: 5,
        background: "var(--background)",
        border: "1px solid var(--border)",
        flexShrink: 0,
      }}
    />
  ) : (
    <span
      aria-hidden
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 40,
        height: 40,
        borderRadius: 5,
        background: c.clubColor,
        color: "var(--background)",
        fontSize: 15,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {c.club_ref.slice(0, 2).toUpperCase()}
    </span>
  );

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "grid",
        gridTemplateColumns: "180px 56px 1fr 220px",
        gap: 20,
        alignItems: "center",
        padding: "2px 0",
        borderBottom: isLast ? "none" : "1px solid var(--border)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <span
          aria-hidden
          style={{
            width: 5,
            height: 40,
            background: c.clubColor,
            borderRadius: 2,
            flexShrink: 0,
          }}
        />
        {logo}
        <span
          style={{
            fontSize: 17,
            color: "var(--secondary-foreground)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontFamily: "var(--font-mono, monospace)",
            fontWeight: 600,
          }}
        >
          {shortLabel}
        </span>
      </div>

      <div
        style={{
          fontFamily: "var(--font-mono, monospace)",
          fontVariantNumeric: "tabular-nums",
          fontSize: 18,
          color: "var(--secondary-foreground)",
          textAlign: "right",
        }}
      >
        {c.total}
      </div>

      <div
        style={{
          display: "flex",
          height: 38,
          background: "var(--muted)",
          border: "1px solid var(--border)",
        }}
      >
        {segs.map((s, i) => {
          const pct = total > 0 ? s.n / total : 0;
          const showLabel = s.n > 0 && pct > 0.08;
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: `${pct * 100}%`,
                background: s.color,
                fontSize: 14,
                fontWeight: 700,
                fontFamily: "var(--font-mono, monospace)",
                color: s.textOnFaint ? "var(--secondary-foreground)" : "var(--background)",
              }}
            >
              {showLabel ? s.n : ""}
            </div>
          );
        })}
      </div>

      <div
        style={{
          fontSize: 15,
          color: "var(--secondary-foreground)",
          textAlign: "right",
          whiteSpace: "nowrap",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono, monospace)",
            fontSize: 11,
            color: "var(--muted-foreground)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          za klubem{" "}
        </span>
        <span
          style={{
            color: c.disciplineLabel === "—" ? "var(--muted-foreground)" : "var(--foreground)",
            fontWeight: 600,
          }}
        >
          {c.disciplineLabel}
        </span>
        {showBroken && (
          <span
            style={{
              fontFamily: "var(--font-mono, monospace)",
              marginLeft: 8,
              color: "var(--destructive)",
              fontSize: 11,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            ↪ {c.brokenCount}
          </span>
        )}
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

function clampForPng(s: string | null | undefined, max: number): string | null {
  if (!s) return null;
  const trimmed = s.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - 1).trimEnd() + "…";
}

export function ClubBreakdownTable({ clubs, header, shortTitle, printNumber }: Props) {
  const captureRef = useRef<HTMLDivElement | null>(null);

  const filteredClubs = excludeUnaffiliated(clubs, (c) => c.club_ref)
    .filter((c) => (c.total ?? 0) >= MIN_KLUB_AGGREGATE);

  // PNG title block: the voting title (header.title — the official question
  // read in the chamber) is the primary display. The print's short_title
  // (when present) sits below as italic context subtitle. Voting title wins
  // because that's what was actually voted on — the print is incidental.
  const pngQuestion = clampForPng(header.title, 220);
  const pngSubtitle = clampForPng(shortTitle, 110);

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

        {/* Live (responsive) rows. */}
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
        {filteredClubs.map((c) => (
          <ClubRow key={c.club_ref} c={c} />
        ))}
      </div>

      {/* PNG-only capture target. Fixed 1080x1080 square, off-screen so the
          live page is unaffected. Always in the DOM so logos load eagerly
          (off-screen lazy <Image> would never trip the IntersectionObserver,
          which is why this section uses plain <img loading="eager">). */}
      <div
        ref={captureRef}
        aria-hidden
        style={{
          position: "fixed",
          top: 0,
          left: "-12000px",
          width: 1080,
          height: 1080,
          background: "var(--background)",
          padding: 56,
          boxSizing: "border-box",
          overflow: "hidden",
          zIndex: -1,
          pointerEvents: "none",
          display: "flex",
          flexDirection: "column",
          fontFamily: "var(--font-serif, serif)",
          color: "var(--foreground)",
        }}
      >
        {/* Header block */}
        <div
          style={{
            paddingBottom: 22,
            borderBottom: "2px solid var(--rule)",
            marginBottom: 22,
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono, monospace)",
              textTransform: "uppercase",
              fontSize: 12,
              color: "var(--muted-foreground)",
              letterSpacing: "0.18em",
              marginBottom: 14,
            }}
          >
            Sejm {header.term} · pos. {header.sitting} · głos. nr {header.voting_number} · {formatDateShort(header.date)}
            {printNumber ? ` · druk ${printNumber}` : ""}
          </div>

          <div
            style={{
              fontFamily: "var(--font-serif, serif)",
              fontSize: 30,
              fontWeight: 500,
              lineHeight: 1.18,
              letterSpacing: "-0.015em",
              color: "var(--foreground)",
              marginBottom: pngSubtitle ? 12 : 0,
            }}
          >
            „{pngQuestion}”
          </div>

          {pngSubtitle && (
            <div
              style={{
                fontFamily: "var(--font-serif, serif)",
                fontStyle: "italic",
                fontSize: 18,
                lineHeight: 1.3,
                color: "var(--secondary-foreground)",
              }}
            >
              {pngSubtitle}
            </div>
          )}
        </div>

        {/* Column headers */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "180px 56px 1fr 220px",
            gap: 20,
            fontFamily: "var(--font-mono, monospace)",
            textTransform: "uppercase",
            fontSize: 10,
            color: "var(--muted-foreground)",
            letterSpacing: "0.14em",
            borderBottom: "1px solid var(--rule)",
            paddingBottom: 8,
            marginBottom: 2,
          }}
        >
          <span>Klub</span>
          <span style={{ textAlign: "right" }}>Mand.</span>
          <span>Rozkład głosów</span>
          <span style={{ textAlign: "right" }}>Dyscyplina</span>
        </div>

        {/* Rows — flex column with each row flex:1 so 4 klubs stretch to fill
            the square as much as 12 do. No empty bottom space. */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {filteredClubs.map((c, i) => (
            <PngClubRow key={c.club_ref} c={c} isLast={i === filteredClubs.length - 1} />
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            marginTop: 16,
            paddingTop: 12,
            borderTop: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontFamily: "var(--font-mono, monospace)",
            textTransform: "uppercase",
            fontSize: 10,
            color: "var(--muted-foreground)",
            letterSpacing: "0.18em",
          }}
        >
          <span>tygodnik sejmowy · jak głosowały kluby</span>
          <span>tygodniksejmowy.pl</span>
        </div>
      </div>
    </section>
  );
}
