"use client";

import { useRef, useState } from "react";
import { KLUB_COLORS } from "@/lib/atlas/constants";

// 1080x1080 share card for an MP's office-expense report. Renders a hero
// total, MP photo + name + club badge, and the four biggest spend
// categories as tiles. Pattern (offscreen surface + html-to-image lazy
// import + clipboard-then-download) mirrors components/statement/
// QuoteShareButton.tsx — keep them in sync if either changes.

const PALETTE_BG = "#f4efe4";
const PALETTE_INK = "#161310";
const PALETTE_INK_SOFT = "#6e6356";
const PALETTE_RULE = "#cdc4b1";
const PALETTE_RED = "#8a2a1f";

const PLN_INT = new Intl.NumberFormat("pl-PL", {
  style: "currency",
  currency: "PLN",
  maximumFractionDigits: 0,
});

function initials(name: string | null): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type TopItem = {
  categoryCode: number;
  shortLabel: string;
  amount: number;
};

type Props = {
  mpId: number;
  mpName: string;
  klubRef: string | null;
  year: number;
  totalSpent: number;
  topItems: TopItem[];   // already sorted desc, first 4 used
  precise: boolean;       // decimal or integer rendering for amounts
};

export function ExpensesShareButton({
  mpId,
  mpName,
  klubRef,
  year,
  totalSpent,
  topItems,
  precise,
}: Props) {
  // Avatar via same-origin proxy so html-to-image's CORS fetch succeeds.
  const avatarSrc = `/api/avatar/${mpId}`;
  const cardRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"idle" | "working" | "copied" | "downloaded" | "fail">("idle");
  const clubColor = (klubRef && KLUB_COLORS[klubRef]) || PALETTE_INK;

  const fmt = (v: number) => {
    if (precise) {
      return new Intl.NumberFormat("pl-PL", {
        style: "currency",
        currency: "PLN",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(v);
    }
    return PLN_INT.format(v);
  };

  const top4 = topItems.slice(0, 4);

  const onClick = async () => {
    if (!cardRef.current || state === "working") return;
    setState("working");
    try {
      const { toBlob } = await import("html-to-image");
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      const blob = await toBlob(cardRef.current, {
        backgroundColor: PALETTE_BG,
        pixelRatio: 2,
        cacheBust: true,
        width: 1080,
        height: 1080,
      });
      if (!blob) throw new Error("no blob");
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
        a.download = `wydatki-biura-${mpName.replace(/\s+/g, "-").toLowerCase()}-${year}.png`;
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

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={state === "working"}
        aria-label="Kopiuj wydatki biura jako PNG"
        className="inline-flex items-center gap-1.5 font-mono uppercase tracking-[0.14em] text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      >
        {label}
      </button>

      {/* Offscreen 1080×1080 capture surface */}
      <div
        aria-hidden
        style={{ position: "fixed", left: -99999, top: 0, pointerEvents: "none" }}
      >
        <div
          ref={cardRef}
          style={{
            width: 1080,
            height: 1080,
            background: PALETTE_BG,
            padding: "56px 72px 48px",
            display: "flex",
            flexDirection: "column",
            boxSizing: "border-box",
            color: PALETTE_INK,
            fontFamily: "var(--font-source-serif), Georgia, 'Times New Roman', serif",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Header: photo + name + club badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            {avatarSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarSrc}
                alt=""
                crossOrigin="anonymous"
                style={{
                  width: 104,
                  height: 104,
                  borderRadius: "50%",
                  objectFit: "cover",
                  border: `1px solid ${PALETTE_RULE}`,
                  flexShrink: 0,
                }}
              />
            ) : (
              <div
                style={{
                  width: 104,
                  height: 104,
                  borderRadius: "50%",
                  background: typeof clubColor === "string" ? clubColor : PALETTE_INK_SOFT,
                  color: PALETTE_BG,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "var(--font-source-serif), Georgia, serif",
                  fontSize: 36,
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                {initials(mpName)}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 44,
                  fontWeight: 600,
                  color: PALETTE_INK,
                  lineHeight: 1.05,
                  letterSpacing: "-0.01em",
                }}
              >
                {mpName}
              </div>
              {klubRef && (
                <div style={{ marginTop: 10 }}>
                  <span
                    style={{
                      fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
                      fontSize: 15,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      padding: "5px 13px",
                      borderRadius: 5,
                      background: `${clubColor}1f`,
                      color: clubColor,
                      border: `1px solid ${clubColor}55`,
                    }}
                  >
                    {klubRef}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Hero total */}
          <div
            style={{
              marginTop: 56,
              marginBottom: 32,
              borderTop: `1px solid ${PALETTE_RULE}`,
              borderBottom: `1px solid ${PALETTE_RULE}`,
              paddingTop: 32,
              paddingBottom: 32,
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
                fontSize: 16,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: PALETTE_INK_SOFT,
                marginBottom: 16,
              }}
            >
              Wydatki biura poselskiego w {year} r.
            </div>
            <div
              style={{
                fontSize: 116,
                fontWeight: 600,
                color: PALETTE_INK,
                fontFamily: "var(--font-source-serif), Georgia, serif",
                lineHeight: 1.0,
                letterSpacing: "-0.03em",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {fmt(totalSpent)}
            </div>
          </div>

          {/* Top 4 categories grid */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div
              style={{
                fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
                fontSize: 14,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: PALETTE_INK_SOFT,
                marginBottom: 16,
              }}
            >
              Największe kategorie
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
                flex: 1,
              }}
            >
              {top4.map((it) => {
                const sharePct = totalSpent > 0 ? (it.amount / totalSpent) * 100 : 0;
                return (
                  <div
                    key={it.categoryCode}
                    style={{
                      border: `1px solid ${PALETTE_RULE}`,
                      padding: "24px 28px",
                      background: "rgba(255,255,255,0.45)",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "var(--font-source-serif), Georgia, serif",
                        fontSize: 22,
                        fontWeight: 500,
                        lineHeight: 1.2,
                        color: PALETTE_INK,
                        letterSpacing: "-0.005em",
                        marginBottom: 16,
                      }}
                    >
                      {it.shortLabel}
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: 38,
                          fontWeight: 600,
                          fontFamily: "var(--font-source-serif), Georgia, serif",
                          color: PALETTE_INK,
                          letterSpacing: "-0.02em",
                          lineHeight: 1.0,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {fmt(it.amount)}
                      </div>
                      <div
                        style={{
                          marginTop: 8,
                          fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
                          fontSize: 13,
                          color: PALETTE_INK_SOFT,
                          letterSpacing: "0.08em",
                        }}
                      >
                        {sharePct.toLocaleString("pl-PL", { maximumFractionDigits: 1 })}% wydatków
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer attribution */}
          <div
            style={{
              marginTop: 28,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
              fontSize: 13,
              color: PALETTE_INK_SOFT,
              letterSpacing: "0.06em",
            }}
          >
            <span style={{ color: PALETTE_RED, fontWeight: 600 }}>
              tygodniksejmowy.pl
            </span>
            <span>
              Źródło: sprawozdanie zatwierdzone przez Prezydium Sejmu
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
