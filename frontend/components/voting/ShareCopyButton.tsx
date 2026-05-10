"use client";

import { useState } from "react";

type Props = {
  url?: string;
};

type GhostBtn = {
  key: string;
  label: string;
  disabled: boolean;
};

const STATIC_BTNS: GhostBtn[] = [
  { key: "embed", label: "osadź ＜/＞", disabled: true },
  { key: "pdf", label: "pdf", disabled: true },
  { key: "png", label: "png", disabled: true },
  { key: "rss", label: "rss", disabled: true },
];

export default function ShareCopyButton({ url }: Props) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    const target =
      url ?? (typeof window !== "undefined" ? window.location.href : "");
    if (!target) return;
    try {
      await navigator.clipboard.writeText(target);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard write can fail in restricted contexts; silently ignore.
    }
  };

  const btnBase: React.CSSProperties = {
    padding: "6px 12px",
    border: "1px solid var(--muted-foreground)",
    borderRadius: 9999,
    fontSize: 12,
    color: "var(--background)",
    background: "transparent",
    cursor: "pointer",
    fontFamily: "inherit",
  };

  return (
    <div className="flex flex-wrap" style={{ gap: 8 }}>
      <button
        type="button"
        onClick={onCopy}
        style={btnBase}
        aria-label="Skopiuj link do tej strony"
      >
        {copied ? "skopiowano ✓" : "kopiuj link"}
      </button>
      {STATIC_BTNS.map((b) => (
        <button
          key={b.key}
          type="button"
          disabled={b.disabled}
          title="wkrótce"
          style={{
            ...btnBase,
            opacity: 0.5,
            cursor: "not-allowed",
          }}
        >
          {b.label}
        </button>
      ))}
    </div>
  );
}
