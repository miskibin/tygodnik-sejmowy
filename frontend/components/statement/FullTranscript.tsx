import { stripSpeechBoilerplate } from "@/lib/labels";

// Reading time at 200 wpm Polish (≈3.3 wps). Body is plain text.
function readingTime(text: string): number {
  const words = text.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

// Server component: full transcript renders unconditionally on /mowa/[id].
// User decision (C4a): the transcript IS the page — no toggle. The PDF
// stenogram link survives as a small caption above the paragraphs.
export function FullTranscript({
  bodyText,
  transcriptUrl,
}: {
  bodyText: string;
  transcriptUrl: string | null;
}) {
  const cleaned = stripSpeechBoilerplate(bodyText);
  const paragraphs = cleaned
    .split(/\n{2,}|(?<=[.!?])\s{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const minutes = readingTime(cleaned);

  return (
    <section className="my-12 max-w-[820px] mx-auto">
      <div className="flex items-baseline justify-between gap-4 py-2.5 border-y border-border">
        <span className="font-mono text-[11px] tracking-[0.16em] uppercase text-destructive">
          Pełna wypowiedź
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">
          {minutes} min czytania · {paragraphs.length}{" "}
          {paragraphs.length === 1 ? "akapit" : "akapitów"}
          {transcriptUrl && (
            <>
              {" · "}
              <a
                href={transcriptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-destructive underline decoration-dotted underline-offset-4 hover:decoration-solid"
              >
                ↗ Stenogram dnia (PDF)
              </a>
            </>
          )}
        </span>
      </div>
      <div className="pt-6 font-serif text-secondary-foreground" style={{ fontSize: 17, lineHeight: 1.75 }}>
        {paragraphs.map((p, i) => (
          <p key={i} className="m-0 mb-4" style={{ textWrap: "pretty" }}>
            {p}
          </p>
        ))}
      </div>
    </section>
  );
}
