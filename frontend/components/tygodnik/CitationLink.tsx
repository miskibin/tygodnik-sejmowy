import { Fragment } from "react";

// Patterns we detect inline:
//   - "druk nr 2180" / "druku 2180" / "druki 2180, 2199" → /druk/{term}/{n}
//   - "ustawa z dn. 9 marca 2024 r. (Dz.U. 2024 poz. 305)" → ISAP link
//   - "Dz.U. 2026 poz. 305" / "M.P. 2026 poz. 308" → ISAP link
// Matches are non-greedy; falls back to inert text if pattern unfamiliar.
//
// CitationLink is a tagged-template-style helper rather than a heavy MD/JSX
// pipeline because impactPunch + summaryPlain are short, hand-written by the
// LLM enricher. Keep parsing dumb + linear.

const DRUK_RE = /druk(?:i|u|iem)?\s*(?:nr\s*)?([0-9]+(?:-[0-9]+)?(?:[,;\s]+[0-9]+(?:-[0-9]+)?)*)/giu;
const DZU_RE = /\b(Dz\.\s?U\.|M\.\s?P\.)\s*(\d{4})\s*poz\.\s*(\d+)/giu;
// Statement (wypowiedź) refs: enricher emits `{statement:N}` or
// `[wypowiedź N]` / `[wypowiedź:N]`. All resolve to /mowa/[id].
const STMT_RE = /(?:\{statement[:\s]*(\d+)\}|\[wypowied(?:ź|z)[:\s]*(\d+)\])/giu;

type Token =
  | { kind: "text"; value: string }
  | { kind: "druk"; numbers: string[]; raw: string }
  | { kind: "act"; publisher: "Dz.U." | "M.P."; year: string; pos: string; raw: string }
  | { kind: "statement"; id: string; raw: string };

function isapLink(publisher: "Dz.U." | "M.P.", year: string, pos: string): string {
  // ISAP wide-search permalink — same canonical form across publishers.
  const code = publisher === "M.P." ? "MP" : "WDU";
  const padded = pos.padStart(7, "0");
  return `https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=${code}${year}${padded}`;
}

// Walk a string left-to-right collecting matches from both regexes; whichever
// comes first wins, then continue from that match's end. Avoids the
// out-of-order issue of running each regex independently.
function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    DRUK_RE.lastIndex = cursor;
    DZU_RE.lastIndex = cursor;
    STMT_RE.lastIndex = cursor;
    const drukMatch = DRUK_RE.exec(text);
    const dzuMatch = DZU_RE.exec(text);
    const stmtMatch = STMT_RE.exec(text);
    // Pick the earliest match across all three regexes.
    type Cand = { idx: number; kind: "druk" | "act" | "statement" };
    const candidates: Cand[] = [];
    if (drukMatch) candidates.push({ idx: drukMatch.index, kind: "druk" });
    if (dzuMatch) candidates.push({ idx: dzuMatch.index, kind: "act" });
    if (stmtMatch) candidates.push({ idx: stmtMatch.index, kind: "statement" });
    candidates.sort((a, b) => a.idx - b.idx);
    const next = candidates[0] ?? null;
    if (!next) {
      tokens.push({ kind: "text", value: text.slice(cursor) });
      break;
    }
    if (next.idx > cursor) {
      tokens.push({ kind: "text", value: text.slice(cursor, next.idx) });
    }
    if (next.kind === "druk" && drukMatch) {
      const numbers = drukMatch[1]
        .split(/[,;\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      tokens.push({ kind: "druk", numbers, raw: drukMatch[0] });
      cursor = drukMatch.index + drukMatch[0].length;
    } else if (next.kind === "act" && dzuMatch) {
      const pubRaw = dzuMatch[1].replace(/\s/g, "");
      const publisher = pubRaw.startsWith("M") ? "M.P." : "Dz.U.";
      tokens.push({ kind: "act", publisher, year: dzuMatch[2], pos: dzuMatch[3], raw: dzuMatch[0] });
      cursor = dzuMatch.index + dzuMatch[0].length;
    } else if (next.kind === "statement" && stmtMatch) {
      const id = stmtMatch[1] ?? stmtMatch[2];
      tokens.push({ kind: "statement", id, raw: stmtMatch[0] });
      cursor = stmtMatch.index + stmtMatch[0].length;
    }
  }
  return tokens;
}

export function CitationText({
  children,
  term = 10,
  className,
  style,
}: {
  children: string | null | undefined;
  term?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  if (!children) return null;
  const tokens = tokenize(children);
  return (
    <span className={className} style={style}>
      {tokens.map((tok, i) => {
        if (tok.kind === "text") return <Fragment key={i}>{tok.value}</Fragment>;
        if (tok.kind === "druk") {
          if (tok.numbers.length === 1) {
            return (
              <a
                key={i}
                href={`/druk/${term}/${encodeURIComponent(tok.numbers[0])}`}
                className="text-destructive underline decoration-dotted underline-offset-2 hover:decoration-solid"
                title={`Otwórz druk nr ${tok.numbers[0]}`}
              >
                {tok.raw}
              </a>
            );
          }
          // Multi-druk citation — render the whole phrase as one wrap with
          // separate links per number so each is independently clickable.
          return (
            <span key={i} className="whitespace-nowrap">
              {tok.raw.split(/([0-9]+(?:-[0-9]+)?)/g).map((part, j) =>
                tok.numbers.includes(part) ? (
                  <a
                    key={j}
                    href={`/druk/${term}/${encodeURIComponent(part)}`}
                    className="text-destructive underline decoration-dotted underline-offset-2 hover:decoration-solid"
                    title={`Otwórz druk nr ${part}`}
                  >
                    {part}
                  </a>
                ) : (
                  <Fragment key={j}>{part}</Fragment>
                ),
              )}
            </span>
          );
        }
        if (tok.kind === "statement") {
          return (
            <a
              key={i}
              href={`/mowa/${tok.id}`}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm font-mono text-[10px] tracking-[0.05em] uppercase text-destructive hover:bg-muted"
              style={{ background: "var(--muted)", border: "1px solid var(--border)" }}
              title={`Wypowiedź ${tok.id}`}
            >
              <span aria-hidden>“</span> wypowiedź {tok.id}
            </a>
          );
        }
        return (
          <a
            key={i}
            href={isapLink(tok.publisher, tok.year, tok.pos)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-destructive underline decoration-dotted underline-offset-2 hover:decoration-solid"
            title={`Akt w ISAP — ${tok.raw}`}
          >
            {tok.raw}
          </a>
        );
      })}
    </span>
  );
}
