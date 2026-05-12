"use client";

import { useState, type RefObject } from "react";

// Snapshot a referenced section to PNG and try clipboard.write; fall back to
// download. Lazy-loaded html-to-image so the bundle stays small for users who
// never click "kopiuj".
export function CopyAsPngButton({
  targetRef,
  filename,
}: {
  targetRef: RefObject<HTMLElement | null>;
  filename: string;
}) {
  const [state, setState] = useState<"idle" | "working" | "done" | "fail">("idle");

  const onClick = async () => {
    if (!targetRef.current || state === "working") return;
    setState("working");
    const node = targetRef.current;
    node.classList.add("capturing");
    try {
      const { toBlob } = await import("html-to-image");
      // Wait for any in-flight web fonts to resolve so the capture doesn't fall
      // back to system fonts mid-load (esp. on first visit to the page).
      if (typeof document !== "undefined" && "fonts" in document) {
        try { await document.fonts.ready; } catch { /* ignore */ }
      }
      // Wait one frame so .capturing toggles render before capture.
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      // Pin explicit dims so html-to-image doesn't have to infer them from
      // an off-screen / clipped element's bounding rect (which can return 0).
      const w = node.offsetWidth || node.scrollWidth;
      const h = node.offsetHeight || node.scrollHeight;
      const blob = await toBlob(node, {
        backgroundColor: "#f4efe4",
        pixelRatio: 2,
        cacheBust: true,
        width: w,
        height: h,
        canvasWidth: w,
        canvasHeight: h,
      });
      if (!blob) throw new Error("no blob");
      try {
        if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          setState("done");
          setTimeout(() => setState("idle"), 1800);
          return;
        }
      } catch {
        // fall through to download
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setState("done");
      setTimeout(() => setState("idle"), 1800);
    } catch (err) {
      // Surface the underlying error in the console so a blank/failed capture
      // is debuggable from the user's devtools.
      console.error("[CopyAsPngButton] capture failed", err);
      setState("fail");
      setTimeout(() => setState("idle"), 2000);
    } finally {
      node.classList.remove("capturing");
    }
  };

  const label =
    state === "working" ? "renderuję…" :
    state === "done" ? "skopiowane ✓" :
    state === "fail" ? "błąd — spróbuj ponownie" :
    "kopiuj jako PNG";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={state === "working"}
      aria-label="Kopiuj sekcję jako PNG"
      className="font-mono uppercase"
      style={{
        padding: "6px 14px",
        border: "1px solid var(--border)",
        borderRadius: 999,
        background: state === "done" ? "var(--success)" : "var(--background)",
        color: state === "done" ? "var(--background)" : "var(--secondary-foreground)",
        fontSize: 11,
        letterSpacing: "0.1em",
        cursor: state === "working" ? "wait" : "pointer",
        transition: "background 0.18s, color 0.18s",
      }}
    >
      {label}
    </button>
  );
}
