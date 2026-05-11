// Pure helpers for AnnotatedTranscript. No React, no DOM. Server-safe.
//
// Two transforms over a transcript paragraph:
//
//   1. extractStageDirections — pulls common Sejm hall directions out of the
//      flowing prose so they can render as margin annotations on desktop.
//      Only WHITELISTED phrases are pulled; arbitrary parentheticals like
//      "(art. 12 ust. 3)" stay inline.
//
//   2. applyHighlights — wraps fuzzy-matched needles (viral_quote +
//      key_claims) with {kind: "mark"} spans. Whitespace-normalized,
//      case-insensitive, longest-needle-first to avoid nested wraps.

export type StageDirectionKind =
  | "oklaski"
  | "wesolosc"
  | "gwar"
  | "glos"
  | "dzwonek"
  | "przerwa";

export type StageDirection = {
  kind: StageDirectionKind;
  label: string;
};

export type ParagraphSegment =
  | { kind: "text"; text: string }
  | { kind: "direction"; direction: StageDirection };

export type ExtractedParagraph = {
  cleanedText: string;
  directions: StageDirection[];
  segments: ParagraphSegment[];
};

// Map a parenthesized phrase (already lowercased, sans diacritics) to its
// canonical kind. The needle list is intentionally short — it covers the
// stage directions actually seen in Sejm transcripts. Anything else is left
// inline so we don't accidentally strip parenthetical legal references.
const STAGE_PATTERNS: Array<{ test: RegExp; kind: StageDirectionKind }> = [
  { test: /oklask/i, kind: "oklaski" },
  { test: /wesolos|wesoloś/i, kind: "wesolosc" },
  { test: /gwar(?:\s+na\s+sali)?/i, kind: "gwar" },
  { test: /glos\s+z\s+sali|głos\s+z\s+sali|glosy\s+z\s+sali|głosy\s+z\s+sali/i, kind: "glos" },
  { test: /dzwonek/i, kind: "dzwonek" },
  { test: /przerwa/i, kind: "przerwa" },
];

const PAREN_RE = /\(([^()]{2,80})\)/g;

function cleanProseText(text: string): string {
  return text.replace(/[ \t]{2,}/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();
}

export function extractStageDirections(paragraph: string): ExtractedParagraph {
  const directions: StageDirection[] = [];
  const segments: ParagraphSegment[] = [];
  let cursor = 0;
  PAREN_RE.lastIndex = 0;

  const pushText = (raw: string) => {
    const text = cleanProseText(raw);
    if (!text) return;
    const prev = segments[segments.length - 1];
    if (prev?.kind === "text") {
      prev.text = cleanProseText(`${prev.text} ${text}`);
      return;
    }
    segments.push({ kind: "text", text });
  };

  let match: RegExpExecArray | null;
  while ((match = PAREN_RE.exec(paragraph)) !== null) {
    const [full, inner] = match;
    pushText(paragraph.slice(cursor, match.index));
    const trimmed = inner.trim();
    let mapped: StageDirection | null = null;
    for (const { test, kind } of STAGE_PATTERNS) {
      if (test.test(trimmed)) {
        mapped = { kind, label: trimmed };
        break;
      }
    }
    if (mapped) {
      directions.push(mapped);
      segments.push({ kind: "direction", direction: mapped });
    } else {
      pushText(full);
    }
    cursor = match.index + full.length;
  }
  pushText(paragraph.slice(cursor));

  return {
    cleanedText: cleanProseText(
      segments
        .filter((s): s is Extract<ParagraphSegment, { kind: "text" }> => s.kind === "text")
        .map((s) => s.text)
        .join(" "),
    ),
    directions,
    segments,
  };
}

// ─── Highlights ──────────────────────────────────────────────────────────

export type HighlightSpan =
  | { kind: "text"; content: string }
  | { kind: "mark"; content: string };

const MIN_NEEDLE_LEN = 12;

// Normalize for matching: lowercase + collapse whitespace + drop trailing
// punctuation. We keep diacritics — they're meaningful in Polish and the LLM
// preserves them in viral_quote / key_claims, so this is a true substring
// match in normalized space.
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[„""'']/g, '"')
    .trim()
    .replace(/[.,;:!?\s]+$/u, "");
}

// Build (start,end) ranges in the ORIGINAL string by walking the normalized
// haystack with a character-index map. This lets us slice `text` precisely
// for output even though matching happens on normalized strings.
function buildIndexMap(text: string): { norm: string; map: number[] } {
  const map: number[] = [];
  let norm = "";
  let prevWasSpace = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      if (prevWasSpace) continue;
      norm += " ";
      map.push(i);
      prevWasSpace = true;
    } else {
      const lowered = ch.toLowerCase();
      const replaced = /[„""'']/.test(ch) ? '"' : lowered;
      norm += replaced;
      map.push(i);
      prevWasSpace = false;
    }
  }
  return { norm, map };
}

export function applyHighlights(text: string, needles: ReadonlyArray<string | null | undefined>): HighlightSpan[] {
  // Filter + dedupe + length-gate + sort longest-first so we mark the most
  // specific phrase before its substrings.
  const cleaned = Array.from(
    new Set(
      needles
        .filter((n): n is string => typeof n === "string" && n.trim().length >= MIN_NEEDLE_LEN)
        .map((n) => normalize(n)),
    ),
  ).sort((a, b) => b.length - a.length);

  if (cleaned.length === 0) return [{ kind: "text", content: text }];

  const { norm, map } = buildIndexMap(text);
  type Range = { start: number; end: number };
  const ranges: Range[] = [];

  for (const needle of cleaned) {
    if (needle.length === 0) continue;
    let from = 0;
    while (from <= norm.length - needle.length) {
      const idx = norm.indexOf(needle, from);
      if (idx < 0) break;
      const start = map[idx];
      const lastNormIdx = idx + needle.length - 1;
      const end = (map[lastNormIdx] ?? text.length - 1) + 1;
      // Skip if range overlaps an already-claimed range (longest-first wins).
      const overlaps = ranges.some((r) => !(end <= r.start || start >= r.end));
      if (!overlaps) ranges.push({ start, end });
      from = idx + needle.length;
    }
  }

  if (ranges.length === 0) return [{ kind: "text", content: text }];

  ranges.sort((a, b) => a.start - b.start);
  const out: HighlightSpan[] = [];
  let cursor = 0;
  for (const r of ranges) {
    if (r.start > cursor) out.push({ kind: "text", content: text.slice(cursor, r.start) });
    out.push({ kind: "mark", content: text.slice(r.start, r.end) });
    cursor = r.end;
  }
  if (cursor < text.length) out.push({ kind: "text", content: text.slice(cursor) });
  return out;
}
