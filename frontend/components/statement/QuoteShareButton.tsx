"use client";

import { useRef, useState } from "react";
import { KLUB_COLORS } from "@/lib/atlas/constants";

// Twitter-style 1080x1080 quote card → PNG, clipboard-or-download. The capture
// node is rendered offscreen (fixed; left:-9999px) with explicit pixel sizes so
// html-to-image produces a deterministic export independent of viewport/CSS.
// html-to-image is lazy-imported on first click — bundle stays cold otherwise.

const PL_MONTHS = [
  "stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca",
  "lipca", "sierpnia", "września", "października", "listopada", "grudnia",
];

function formatPolishDate(iso: string | null): string | null {
  if (!iso) return null;
  // Accept "YYYY-MM-DD" or ISO datetime; treat as date-only.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const y = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!month || month < 1 || month > 12) return null;
  return `${day} ${PL_MONTHS[month - 1]} ${y}`;
}

function initials(name: string | null): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function quoteFontSize(len: number): number {
  // Bumped up across the board — quote is the hero element on a 1080² card,
  // it should fill the canvas instead of floating in whitespace.
  if (len < 50) return 84;
  if (len < 100) return 72;
  if (len < 160) return 60;
  if (len < 220) return 50;
  if (len < 300) return 42;
  return 34;
}

type Props = {
  quote: string;
  speakerName: string | null;
  photoUrl: string | null;
  clubRef: string | null;
  proceedingNumber: number | null;
  dayIdx: number | null;
  dayDate: string | null;
};

export function QuoteShareButton({
  quote,
  speakerName,
  photoUrl,
  clubRef,
  proceedingNumber,
  dayIdx,
  dayDate,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"idle" | "working" | "copied" | "downloaded" | "fail">("idle");

  const clubColor = (clubRef && KLUB_COLORS[clubRef]) || "var(--ts-ink)";
  const dateLabel = formatPolishDate(dayDate);
  const fontSize = quoteFontSize(quote.length);

  const onClick = async () => {
    if (!cardRef.current || state === "working") return;
    setState("working");
    try {
      const { toBlob } = await import("html-to-image");
      // One paint tick so any layout settles before snapshot.
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      const blob = await toBlob(cardRef.current, {
        backgroundColor: "#f4efe4",
        pixelRatio: 2,
        cacheBust: true,
        width: 1080,
        height: 1080,
      });
      if (!blob) throw new Error("no blob");
      // clipboard.write may throw NotAllowedError (Safari, non-secure ctx, no
      // user gesture surfaced) → fall through to <a download> synthetic click.
      try {
        if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          setState("copied");
          setTimeout(() => setState("idle"), 1800);
          return;
        }
        throw new Error("no clipboard");
      } catch {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "cytat.png";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setState("downloaded");
        setTimeout(() => setState("idle"), 1800);
      }
    } catch {
      setState("fail");
      setTimeout(() => setState("idle"), 2000);
    }
  };

  const label =
    state === "working" ? "renderuję…" :
    state === "copied" ? "skopiowano ✓" :
    state === "downloaded" ? "pobrano ✓" :
    state === "fail" ? "błąd — spróbuj ponownie" :
    "📋 Kopiuj jako PNG";

  // Card sub-layout
  const proceedingLine =
    proceedingNumber != null && dayIdx != null
      ? `Posiedzenie ${proceedingNumber}, dzień ${dayIdx}`
      : proceedingNumber != null
      ? `Posiedzenie ${proceedingNumber}`
      : null;

  return (
    <div className="flex justify-center mt-3 mb-8">
      <button
        type="button"
        onClick={onClick}
        disabled={state === "working"}
        aria-label="Kopiuj cytat jako PNG"
        className="font-mono uppercase focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ts-red)]"
        style={{
          padding: "6px 14px",
          border: "1px solid var(--ts-faint)",
          borderRadius: 999,
          background:
            state === "copied" || state === "downloaded" ? "var(--ts-green)" : "var(--ts-paper)",
          color:
            state === "copied" || state === "downloaded" ? "var(--ts-paper)" : "var(--ts-ink-soft)",
          fontSize: 11,
          letterSpacing: "0.1em",
          cursor: state === "working" ? "wait" : "pointer",
          transition: "background 0.18s, color 0.18s",
        }}
      >
        {label}
      </button>

      {/* Offscreen capture surface — fixed-pixel sizes so export is deterministic */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          left: -99999,
          top: 0,
          pointerEvents: "none",
        }}
      >
        <div
          ref={cardRef}
          style={{
            width: 1080,
            height: 1080,
            background: "#f4efe4",
            padding: "56px 72px 48px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            boxSizing: "border-box",
            color: "#161310",
            fontFamily: "var(--font-source-serif), Georgia, 'Times New Roman', serif",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Quote section */}
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
            }}
          >
            <span
              aria-hidden
              style={{
                position: "absolute",
                left: -8,
                top: -40,
                fontSize: 220,
                lineHeight: 1,
                color: "#8a2a1f",
                opacity: 0.18,
                fontFamily: "var(--font-source-serif), Georgia, serif",
                fontStyle: "italic",
                userSelect: "none",
              }}
            >
              “
            </span>
            <p
              style={{
                margin: 0,
                fontStyle: "italic",
                fontSize,
                lineHeight: 1.18,
                textAlign: "center",
                color: "#161310",
                maxWidth: 820,
                letterSpacing: "-0.015em",
                textWrap: "balance",
                position: "relative",
                zIndex: 1,
              }}
            >
              {quote}
            </p>
          </div>

          {/* Divider */}
          <div
            style={{
              borderTop: "1px solid #cdc4b1",
              marginTop: 16,
              marginBottom: 20,
            }}
          />

          {/* Attribution row */}
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt=""
                crossOrigin="anonymous"
                style={{
                  width: 104,
                  height: 104,
                  borderRadius: "50%",
                  objectFit: "cover",
                  border: "1px solid #cdc4b1",
                  flexShrink: 0,
                }}
              />
            ) : (
              <div
                style={{
                  width: 104,
                  height: 104,
                  borderRadius: "50%",
                  background: typeof clubColor === "string" ? clubColor : "#6e6356",
                  color: "#f4efe4",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "var(--font-source-serif), Georgia, serif",
                  fontSize: 36,
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                {initials(speakerName)}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    fontSize: 36,
                    fontWeight: 600,
                    color: "#161310",
                    fontFamily: "var(--font-source-serif), Georgia, serif",
                    lineHeight: 1.1,
                  }}
                >
                  {speakerName ?? "—"}
                </span>
                {clubRef && (
                  <span
                    style={{
                      fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
                      fontSize: 14,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      padding: "4px 11px",
                      borderRadius: 4,
                      background: `${clubColor}1f`,
                      color: clubColor,
                      border: `1px solid ${clubColor}55`,
                    }}
                  >
                    {clubRef}
                  </span>
                )}
              </div>
              {(proceedingLine || dateLabel) && (
                <div
                  style={{
                    marginTop: 8,
                    fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
                    fontSize: 14,
                    color: "#6e6356",
                    letterSpacing: "0.04em",
                  }}
                >
                  {[proceedingLine, dateLabel].filter(Boolean).join(" · ")}
                </div>
              )}
            </div>
            <div
              style={{
                fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
                fontSize: 12,
                color: "#6e6356",
                opacity: 0.6,
                letterSpacing: "0.08em",
                alignSelf: "flex-end",
              }}
            >
              sejmograf.vercel.app
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
