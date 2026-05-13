import { ClubBadge } from "@/components/clubs/ClubBadge";
import { isUnaffiliated } from "@/lib/clubs/filter";
import { computeBillOutcome, verdictChipLabel } from "@/lib/voting/bill_outcome";
import type { ClubTally, LinkedVoting } from "@/lib/db/prints";

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

function shortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function votingChip(polarity: LinkedVoting["motionPolarity"], role: LinkedVoting["role"]): string {
  if (polarity === "pass") return "całość projektu";
  if (polarity === "reject") return "wniosek o odrzucenie";
  if (polarity === "amendment") return "poprawki";
  if (polarity === "minority") return "wniosek mniejszości";
  if (polarity === "procedural") return "wniosek proceduralny";
  if (role === "main") return "główne";
  if (role === "sprawozdanie") return "sprawozdanie";
  if (role === "autopoprawka") return "autopoprawka";
  if (role === "poprawka") return "poprawka";
  if (role === "joint") return "łączne";
  return "głosowanie";
}

export function Votings({
  votings,
  mainVotingId,
  votingByClub,
  processStillOpen,
}: {
  votings: LinkedVoting[];
  mainVotingId: number | null;
  votingByClub: ClubTally[];
  processStillOpen: boolean;
}) {
  const hasAny = votings.length > 0;
  // Show a future placeholder only when the process is still open AND we
  // don't already have a "main" (pass-polarity) voting on file. We don't
  // know the upcoming sitting/voting number, so the placeholder is generic.
  const showFuture = processStillOpen && !votings.some((v) => v.role === "main");

  if (!hasAny && !showFuture) return null;

  return (
    <section className="py-12 border-b border-border">
      <div className="max-w-[1280px] mx-auto">
        <SectionHead title="Głosowania" subtitle={hasAny ? `${votings.length} ${votings.length === 1 ? "głosowanie" : "głosowań"}` : null} />

        <div className="grid gap-5">
          {votings.map((v) => (
            <VotingCard
              key={v.votingId}
              v={v}
              clubTallies={v.votingId === mainVotingId ? votingByClub : []}
            />
          ))}
          {showFuture && <FutureVoting />}
        </div>
      </div>
    </section>
  );
}

function VotingCard({ v, clubTallies }: { v: LinkedVoting; clubTallies: ClubTally[] }) {
  const total = v.yes + v.no + v.abstain + v.notParticipating;
  const motionPassed = v.majorityVotes != null ? v.yes >= v.majorityVotes : v.yes > v.no;
  const billOutcome = computeBillOutcome(v.motionPolarity, motionPassed);

  const verdictLabel = billOutcome === "indeterminate"
    ? motionPassed
      ? "PRZYJĘTY"
      : "ODRZUCONY"
    : verdictChipLabel(billOutcome).toUpperCase();
  const verdictGood = billOutcome === "passed" || billOutcome === "continues";
  const verdictColor = billOutcome === "indeterminate"
    ? motionPassed
      ? "var(--success)"
      : "var(--destructive)"
    : verdictGood
    ? "var(--success)"
    : "var(--destructive)";

  const turnoutPct = total > 0
    ? Math.round(((v.yes + v.no + v.abstain) / total) * 1000) / 10
    : 0;

  return (
    <article
      className="border border-rule p-6 md:p-7 grid gap-7 lg:gap-8 grid-cols-1 lg:[grid-template-columns:1.1fr_0.9fr_0.9fr]"
      style={{ background: "var(--background)" }}
    >
      {/* Left — title + verdict */}
      <div>
        <div
          className="font-mono uppercase mb-2.5"
          style={{
            fontSize: 11,
            color: "var(--muted-foreground)",
            letterSpacing: "0.16em",
          }}
        >
          {shortDate(v.date)} &nbsp;·&nbsp; pos. {v.sitting} &nbsp;·&nbsp; głos. nr {v.votingNumber}
        </div>
        <h3
          className="font-serif font-medium m-0 mb-1 text-foreground"
          style={{ fontSize: 24, lineHeight: 1.15, letterSpacing: "-0.01em" }}
        >
          {v.title || `Głosowanie nr ${v.votingNumber}`}.
        </h3>
        <div className="font-sans text-muted-foreground mb-5" style={{ fontSize: 12.5 }}>
          {votingChip(v.motionPolarity, v.role)}
        </div>
        <div
          className="font-serif italic font-medium whitespace-nowrap mb-2.5"
          style={{
            fontSize: 40,
            lineHeight: 0.95,
            color: verdictColor,
            letterSpacing: "-0.025em",
          }}
        >
          {verdictLabel}
        </div>
        <div className="font-sans text-secondary-foreground" style={{ fontSize: 13, lineHeight: 1.55 }}>
          większością {v.yes}–{v.no}
          {turnoutPct > 0 && <> &nbsp;·&nbsp; frekwencja {turnoutPct}%</>}
        </div>
      </div>

      {/* Middle — proportions bar + numbers */}
      <div>
        <Kicker mb={10}>Rozkład głosów</Kicker>
        <VoteBar v={v} total={total} />
        <div
          className="mt-4 grid grid-cols-2 gap-3 font-mono"
          style={{ fontSize: 12.5 }}
        >
          <NumCell color="var(--success)" label="ZA" value={v.yes} />
          <NumCell color="var(--destructive)" label="PRZECIW" value={v.no} />
          <NumCell color="var(--warning)" label="WSTRZ." value={v.abstain} />
          <NumCell color="var(--muted-foreground)" label="NIEOBEC." value={v.notParticipating} hollow />
        </div>
        {v.majorityVotes != null && (
          <div
            className="mt-4 font-mono uppercase"
            style={{
              fontSize: 10,
              color: "var(--muted-foreground)",
              letterSpacing: "0.12em",
            }}
          >
            próg: {v.majorityVotes} &nbsp;·&nbsp; suma: {total}
          </div>
        )}
      </div>

      {/* Right — by club */}
      <div>
        {clubTallies.length > 0 ? (
          <>
            <Kicker mb={10}>Według klubów</Kicker>
            <div className="grid gap-1.5">
              {clubTallies
                .filter((c) => !isUnaffiliated(c.clubShort))
                .map((c) => (
                  <ClubMini key={c.clubShort} c={c} />
                ))}
            </div>
          </>
        ) : (
          <div
            className="font-mono italic"
            style={{
              fontSize: 11,
              color: "var(--muted-foreground)",
              letterSpacing: "0.04em",
            }}
          >
            Rozkład klubowy dostępny dla głosowania głównego.
          </div>
        )}
      </div>
    </article>
  );
}

function Kicker({ children, mb = 0 }: { children: React.ReactNode; mb?: number }) {
  return (
    <div
      className="font-mono uppercase"
      style={{
        fontSize: 11,
        color: "var(--muted-foreground)",
        letterSpacing: "0.16em",
        marginBottom: mb,
      }}
    >
      {children}
    </div>
  );
}

function NumCell({
  color,
  label,
  value,
  hollow,
}: {
  color: string;
  label: string;
  value: number;
  hollow?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span
        className="rounded-full"
        style={{
          width: 10,
          height: 10,
          background: hollow ? "transparent" : color,
          border: hollow ? `1px solid ${color}` : "none",
        }}
      />
      <span
        className="uppercase"
        style={{
          color: "var(--muted-foreground)",
          fontSize: 10,
          letterSpacing: "0.1em",
        }}
      >
        {label}
      </span>
      <span className="text-foreground ml-auto font-semibold">{value}</span>
    </div>
  );
}

function VoteBar({ v, total }: { v: LinkedVoting; total: number }) {
  if (total === 0) return null;
  const segs = [
    { n: v.yes, color: "var(--success)", label: "ZA" },
    { n: v.no, color: "var(--destructive)", label: "PRZECIW" },
    { n: v.abstain, color: "var(--warning)", label: "WS." },
    { n: v.notParticipating, color: "var(--border)", label: "NB." },
  ];
  const thresholdPct = v.majorityVotes != null ? (v.majorityVotes / total) * 100 : null;
  return (
    <div
      className="flex relative"
      style={{ height: 34, background: "var(--muted)", border: "1px solid var(--rule)" }}
    >
      {segs.map((s, i) =>
        s.n > 0 ? (
          <div
            key={i}
            className="relative overflow-hidden"
            style={{ width: `${(s.n / total) * 100}%`, background: s.color }}
          >
            {s.n / total > 0.08 && (
              <div
                className="absolute inset-0 px-2 flex items-center justify-between font-mono font-semibold"
                style={{
                  fontSize: 11,
                  color: s.color === "var(--border)" ? "var(--secondary-foreground)" : "var(--background)",
                  letterSpacing: "0.06em",
                }}
              >
                <span>{s.label}</span>
                <span>{s.n}</span>
              </div>
            )}
          </div>
        ) : null,
      )}
      {thresholdPct != null && (
        <div
          className="absolute"
          style={{
            top: -4,
            bottom: -4,
            left: `${thresholdPct}%`,
            width: 1,
            background: "var(--foreground)",
          }}
          aria-label={`Próg większości: ${v.majorityVotes}`}
        />
      )}
    </div>
  );
}

function ClubMini({ c }: { c: ClubTally }) {
  const total = c.total || c.yes + c.no + c.abstain + c.notVoting || 1;
  const segs = [
    { n: c.yes, color: "var(--success)" },
    { n: c.no, color: "var(--destructive)" },
    { n: c.abstain, color: "var(--warning)" },
    { n: c.notVoting, color: "var(--border)" },
  ];
  return (
    <div
      className="grid items-center gap-2.5"
      style={{ gridTemplateColumns: "88px 1fr 36px" }}
    >
      <ClubBadge klub={c.clubShort} tooltip={c.clubName} size="sm" withLabel />
      <div
        className="flex"
        style={{ height: 14, background: "var(--muted)", border: "1px solid var(--border)" }}
      >
        {segs.map((s, i) =>
          s.n > 0 ? (
            <div
              key={i}
              style={{ width: `${(s.n / total) * 100}%`, background: s.color }}
              title={String(s.n)}
            />
          ) : null,
        )}
      </div>
      <span
        className="font-mono text-right"
        style={{ fontSize: 10, color: "var(--muted-foreground)" }}
      >
        {c.total}
      </span>
    </div>
  );
}

function FutureVoting() {
  return (
    <article
      className="p-6 md:p-7 flex items-center gap-6 flex-wrap"
      style={{ background: "var(--background)", border: "1px dashed var(--muted-foreground)" }}
    >
      <div className="flex-1 min-w-[260px]">
        <div
          className="font-mono uppercase mb-1.5"
          style={{
            fontSize: 11,
            color: "var(--muted-foreground)",
            letterSpacing: "0.16em",
          }}
        >
          planowane głosowanie
        </div>
        <div
          className="font-serif font-medium text-foreground"
          style={{ fontSize: 22, lineHeight: 1.2 }}
        >
          Głosowanie nad całością projektu.
        </div>
        <div className="font-sans text-muted-foreground mt-0.5" style={{ fontSize: 12.5 }}>
          oczekuje na trzecie czytanie
        </div>
      </div>
      <div
        className="font-mono uppercase px-3 py-1.5 rounded-full"
        style={{
          fontSize: 11,
          color: "var(--destructive)",
          letterSpacing: "0.16em",
          border: "1px solid var(--destructive)",
        }}
      >
        oczekuje
      </div>
    </article>
  );
}
