"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo, useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import type { Seat } from "@/lib/db/voting";
import { CLUB_LOGOS } from "@/lib/atlas/club-logos";

type Filter = "all" | "YES" | "NO" | "ABSTAIN" | "ABSENT";

type Props = {
  seats: Seat[];
  total: number;
  counts: { yes: number; no: number; abstain: number; not_participating: number };
  term: number;
};

const VOTE_LABEL_PL: Record<Seat["vote"], string> = {
  YES: "ZA",
  NO: "PRZECIW",
  ABSTAIN: "WSTRZ.",
  ABSENT: "NIEOB.",
  EXCUSED: "NIEOB.",
};

function colorFor(vote: Seat["vote"]): string {
  if (vote === "YES") return "var(--success)";
  if (vote === "NO") return "var(--destructive)";
  if (vote === "ABSTAIN") return "var(--warning)";
  return "var(--border)";
}

function isAbsent(vote: Seat["vote"]): boolean {
  return vote === "ABSENT" || vote === "EXCUSED";
}

function matchesFilter(seat: Seat, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "ABSENT") return isAbsent(seat.vote);
  return seat.vote === filter;
}

function matchesSearch(seat: Seat, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    seat.mp_name.toLowerCase().includes(needle) ||
    seat.club_ref.toLowerCase().includes(needle)
  );
}

type HoverState = {
  seat: Seat;
  anchor: { left: number; top: number; width: number };
  pinned: boolean;
};

export function FullRosterGrid({ seats, total, counts, term }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState<string>("");
  const [hover, setHover] = useState<HoverState | null>(null);
  const clearTimer = useRef<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => setMounted(true), []);

  // Touch/coarse-pointer detection — on phones, hover doesn't fire reliably.
  // First tap pins the popover; second tap on same cell follows the link.
  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsTouch(window.matchMedia("(hover: none), (pointer: coarse)").matches);
  }, []);

  // Dismiss pinned popover on outside tap, scroll, or Escape.
  useEffect(() => {
    if (!hover?.pinned) return;
    const dismiss = () => setHover(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setHover(null); };
    document.addEventListener("click", dismiss);
    document.addEventListener("scroll", dismiss, { passive: true, capture: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", dismiss);
      document.removeEventListener("scroll", dismiss, { capture: true } as EventListenerOptions);
      document.removeEventListener("keydown", onKey);
    };
  }, [hover?.pinned]);

  const filteredCount = useMemo(() => {
    return seats.reduce(
      (n, s) => (matchesFilter(s, filter) && matchesSearch(s, search) ? n + 1 : n),
      0,
    );
  }, [seats, filter, search]);

  const onCellEnter = (seat: Seat, e: React.MouseEvent<HTMLAnchorElement>) => {
    if (isTouch) return;
    if (clearTimer.current) {
      window.clearTimeout(clearTimer.current);
      clearTimer.current = null;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setHover({
      seat,
      anchor: {
        left: rect.left + rect.width / 2 + window.scrollX,
        top: rect.top + window.scrollY,
        width: rect.width,
      },
      pinned: false,
    });
  };
  const onCellLeave = () => {
    if (clearTimer.current) window.clearTimeout(clearTimer.current);
    clearTimer.current = window.setTimeout(() => {
      setHover((h) => (h && !h.pinned ? null : h));
    }, 80);
  };
  const onCellClick = (seat: Seat, e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!isTouch) return;
    if (hover?.pinned && hover.seat.mp_id === seat.mp_id) return; // second tap navigates
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setHover({
      seat,
      anchor: {
        left: rect.left + rect.width / 2 + window.scrollX,
        top: rect.top + window.scrollY,
        width: rect.width,
      },
      pinned: true,
    });
  };

  const pills: ReadonlyArray<{
    id: Filter;
    label: string;
    color: string;
  }> = [
    { id: "all", label: `wszyscy · ${total}`, color: "var(--foreground)" },
    { id: "YES", label: `ZA · ${counts.yes}`, color: "var(--success)" },
    { id: "NO", label: `PRZECIW · ${counts.no}`, color: "var(--destructive)" },
    { id: "ABSTAIN", label: `WSTRZ. · ${counts.abstain}`, color: "var(--warning)" },
    {
      id: "ABSENT",
      label: `NIEOB. · ${counts.not_participating}`,
      color: "var(--muted-foreground)",
    },
  ];

  return (
    <section
      className="px-4 sm:px-8 md:px-14 py-10 sm:py-14 md:py-16"
      style={{
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div className="mx-auto" style={{ maxWidth: 1100 }}>
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
            style={{ fontSize: 36, color: "var(--destructive)", lineHeight: 1, fontWeight: 500 }}
          >
            IV
          </span>
          <h2
            className="font-serif m-0"
            style={{ fontSize: 32, fontWeight: 500, letterSpacing: "-0.018em", lineHeight: 1, color: "var(--foreground)" }}
          >
            Imienna lista.
          </h2>
          <span
            className="font-sans ml-auto"
            style={{ fontSize: 12, color: "var(--muted-foreground)" }}
          >
            każdy z 460 mandatów · stuknij komórkę aby zobaczyć szczegóły
          </span>
        </div>

        <div
          className="flex items-center flex-wrap"
          style={{ gap: 14, marginBottom: 24, fontSize: 12 }}
        >
          <span
            className="font-mono uppercase"
            style={{ fontSize: 10, color: "var(--muted-foreground)", letterSpacing: "0.16em" }}
          >
            Pokaż
          </span>
          {pills.map((p) => {
            const on = filter === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setFilter(p.id)}
                aria-pressed={on}
                className="cursor-pointer"
                style={{
                  padding: "5px 11px",
                  borderRadius: 100,
                  border: `1px solid ${on ? p.color : "var(--border)"}`,
                  background: on ? p.color : "transparent",
                  color: on ? "var(--background)" : "var(--secondary-foreground)",
                  fontSize: 12,
                }}
              >
                {p.label}
              </button>
            );
          })}
          <input
            type="search"
            placeholder="szukaj posła lub klubu…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Szukaj posła lub klubu"
            className="font-sans w-full sm:ml-auto sm:w-60 sm:min-w-[240px]"
            style={{
              padding: "8px 14px",
              border: "1px solid var(--border)",
              borderRadius: 100,
              fontSize: 14,
              background: "var(--background)",
              color: "var(--foreground)",
              outline: "none",
            }}
          />
        </div>

        <div
          role="grid"
          aria-label="Pełna lista posłów"
          className="[--roster-cols:23] sm:[--roster-cols:46]"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(var(--roster-cols), minmax(0, 1fr))",
            gap: 3,
            padding: 12,
            background: "var(--muted)",
            border: "1px solid var(--rule)",
          }}
        >
          {seats.map((seat) => {
            const visible = matchesFilter(seat, filter) && matchesSearch(seat, search);
            const voteLabel = VOTE_LABEL_PL[seat.vote];
            const bg = colorFor(seat.vote);
            const absent = isAbsent(seat.vote);
            return (
              <Link
                key={seat.mp_id}
                href={`/posel/${term}/${seat.mp_id}`}
                prefetch={false}
                role="gridcell"
                aria-label={`${seat.mp_name}, ${seat.club_ref}, głosował ${voteLabel}`}
                onMouseEnter={(e) => onCellEnter(seat, e)}
                onMouseLeave={onCellLeave}
                onFocus={(e) => onCellEnter(seat, e as unknown as React.MouseEvent<HTMLAnchorElement>)}
                onBlur={onCellLeave}
                onClick={(e) => onCellClick(seat, e)}
                style={{
                  paddingTop: "100%",
                  position: "relative",
                  display: "block",
                  background: bg,
                  opacity: visible ? 1 : 0.12,
                  border: absent ? "1px solid var(--muted-foreground)" : "none",
                  boxSizing: "border-box",
                  transition: "opacity 0.18s",
                }}
              />
            );
          })}
        </div>

        <div
          className="font-mono flex justify-between flex-wrap"
          style={{ marginTop: 18, fontSize: 11, color: "var(--muted-foreground)", gap: 8 }}
        >
          <span>
            kolejność: lewa → prawa według klubu (Lewica · KO · P2050 · PSL · niezrz. · Konfederacja · PiS)
          </span>
          <span>
            widocznych: {filteredCount} / {total}
          </span>
        </div>
      </div>

      {mounted && hover && createPortal(<RosterPopover state={hover} />, document.body)}
    </section>
  );
}

function RosterPopover({ state }: { state: HoverState }) {
  const { seat, anchor, pinned } = state;
  const voteLabel = VOTE_LABEL_PL[seat.vote];
  const voteColor = colorFor(seat.vote);
  const logo = CLUB_LOGOS[seat.club_ref];

  // Viewport-edge clamp keeps the popover at least 8px from each side.
  const POPOVER_W = 260;
  const margin = 8;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const scrollX = typeof window !== "undefined" ? window.scrollX : 0;
  const halfWidth = POPOVER_W / 2;
  const minLeft = scrollX + margin + halfWidth;
  const maxLeft = scrollX + vw - margin - halfWidth;
  const clampedLeft = Math.max(minLeft, Math.min(maxLeft, anchor.left));

  return (
    <div
      role="tooltip"
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        left: clampedLeft,
        top: anchor.top - 12,
        transform: "translate(-50%, -100%)",
        background: "var(--background)",
        border: "1px solid var(--rule)",
        boxShadow: "0 6px 20px rgba(22,19,16,0.15)",
        padding: 12,
        width: POPOVER_W,
        maxWidth: `calc(100vw - ${margin * 2}px)`,
        pointerEvents: pinned ? "auto" : "none",
        zIndex: 50,
      }}
    >
      <div className="flex items-center" style={{ gap: 10 }}>
        {seat.photo_url ? (
          <Image
            src={seat.photo_url}
            alt={seat.mp_name}
            width={44}
            height={44}
            className="rounded-full object-cover"
            style={{ background: "var(--muted)" }}
            unoptimized
          />
        ) : (
          <span
            aria-hidden
            style={{
              width: 44, height: 44, borderRadius: "50%",
              background: seat.club_color, opacity: 0.4,
              display: "inline-block",
            }}
          />
        )}
        <div style={{ minWidth: 0 }}>
          <div
            className="font-serif"
            style={{ fontSize: 16, fontWeight: 500, lineHeight: 1.2, color: "var(--foreground)" }}
          >
            {seat.mp_name}
          </div>
          <div
            className="font-sans flex items-center"
            style={{ fontSize: 11, color: "var(--muted-foreground)", gap: 6, marginTop: 2 }}
          >
            {logo && (
              <Image
                src={`/club-logos/${logo.file}`}
                alt=""
                width={14}
                height={14}
                className="rounded-sm"
                unoptimized
              />
            )}
            <span>
              {seat.club_ref}
              {seat.district_num != null && ` · okr. ${seat.district_num}`}
              {seat.district_name && ` (${seat.district_name})`}
            </span>
          </div>
        </div>
      </div>
      <div
        className="font-mono uppercase"
        style={{
          marginTop: 10,
          paddingTop: 8,
          borderTop: "1px dashed var(--border)",
          fontSize: 11,
          letterSpacing: "0.12em",
          color: "var(--muted-foreground)",
        }}
      >
        głosował:{" "}
        <span
          style={{
            display: "inline-block",
            padding: "2px 8px",
            background: voteColor,
            color: voteColor === "var(--border)" ? "var(--secondary-foreground)" : "var(--background)",
            fontWeight: 600,
            marginLeft: 4,
          }}
        >
          {voteLabel}
        </span>
      </div>
    </div>
  );
}
