import { Hand, Smile, MessageSquare, Megaphone, Bell, Coffee, type LucideIcon } from "lucide-react";
import { stripSpeechBoilerplate } from "@/lib/labels";
import {
  applyHighlights,
  extractStageDirections,
  type ParagraphSegment,
  type StageDirection,
  type StageDirectionKind,
} from "@/lib/transcript-annotate";

const DIRECTION_ICON: Record<StageDirectionKind, LucideIcon> = {
  oklaski: Hand,
  wesolosc: Smile,
  gwar: MessageSquare,
  glos: Megaphone,
  dzwonek: Bell,
  przerwa: Coffee,
};

function readingTime(text: string): number {
  const words = text.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

function MarginDirection({ direction }: { direction: StageDirection }) {
  const Icon = DIRECTION_ICON[direction.kind];
  return (
    <div
      className="flex items-start gap-1.5 font-mono text-[10px] tracking-wide uppercase text-muted-foreground leading-snug"
      title={direction.label}
    >
      <Icon aria-hidden size={11} strokeWidth={1.75} className="text-destructive mt-[1px] shrink-0" />
      <span className="italic normal-case font-serif text-[12px]">{direction.label}</span>
    </div>
  );
}

// Annotated replacement for FullTranscript. Renders each paragraph in a
// two-column grid on desktop: prose left, stage-direction chips right.
//
// Stage directions ((Oklaski), (Wesołość na sali), etc.) render only on
// desktop in the right margin column. Unlike the first pass, we keep them
// as ordered segment markers so each badge sits next to the exact moment in
// the speech instead of collapsing into one stack at the paragraph start.
// On mobile they are still dropped to keep the reading column clean.
//
// Highlights wrap viral_quote + key_claims substrings (>=12 chars,
// whitespace-normalized, case-insensitive) so the reader sees what the
// editor flagged as quotable without scrolling away from the prose.
export function AnnotatedTranscript({
  bodyText,
  transcriptUrl,
  viralQuote,
  keyClaims,
}: {
  bodyText: string;
  transcriptUrl: string | null;
  viralQuote: string | null;
  keyClaims: string[];
}) {
  const cleaned = stripSpeechBoilerplate(bodyText);
  const rawParagraphs = cleaned
    .split(/\n{2,}|(?<=[.!?])\s{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const paragraphs = rawParagraphs.map((p) => extractStageDirections(p));
  const minutes = readingTime(cleaned);
  const needles = [viralQuote, ...(keyClaims ?? [])];

  return (
    <section className="my-2">
      <div className="flex items-baseline justify-between gap-4 py-2.5 border-b border-border">
        <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-muted-foreground">
          {minutes} min czytania · {paragraphs.length}{" "}
          {paragraphs.length === 1 ? "akapit" : "akapitów"}
        </span>
        {transcriptUrl && (
          <a
            href={transcriptUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[10px] tracking-wide text-destructive underline decoration-dotted underline-offset-4 hover:decoration-solid"
          >
            ↗ Stenogram dnia (PDF)
          </a>
        )}
      </div>

      <div className="pt-6">
        {paragraphs.map((p, i) => {
          return (
            <div key={i} className="mb-5 space-y-2.5">
              {p.segments.map((segment: ParagraphSegment, j) => {
                if (segment.kind === "direction") {
                  return (
                    <div
                      key={j}
                      className="hidden md:grid md:grid-cols-[1fr_180px] md:gap-6 md:items-start"
                    >
                      <div aria-hidden />
                      <div className="pt-1">
                        <MarginDirection direction={segment.direction} />
                      </div>
                    </div>
                  );
                }

                const spans = applyHighlights(segment.text, needles);
                return (
                  <div
                    key={j}
                    className="md:grid md:grid-cols-[1fr_180px] md:gap-6 md:items-start"
                  >
                    <p
                      className="m-0 font-serif text-secondary-foreground"
                      style={{ fontSize: 17, lineHeight: 1.75, textWrap: "pretty" }}
                    >
                      {spans.map((s, k) =>
                        s.kind === "mark" ? (
                          <mark
                            key={k}
                            className="bg-muted text-foreground px-0.5 rounded-[2px]"
                            style={{
                              boxShadow: "inset 0 -0.42em 0 color-mix(in srgb, var(--destructive) 14%, transparent)",
                            }}
                          >
                            {s.content}
                          </mark>
                        ) : (
                          <span key={k}>{s.content}</span>
                        ),
                      )}
                    </p>
                    <div className="hidden md:block" aria-hidden />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}
