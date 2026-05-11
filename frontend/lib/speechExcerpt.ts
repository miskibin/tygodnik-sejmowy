import { stripSpeechBoilerplate } from "@/lib/labels";

/** Body text with procedural prefixes removed (same rules as /mowa excerpts). */
export function cleanStatementBody(body: string | null | undefined): string {
  return stripSpeechBoilerplate(body ?? "");
}

function truncateAtWord(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  const slice = s.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > maxLen * 0.45 ? lastSpace : maxLen;
  return `${slice.slice(0, cut).trimEnd()}…`;
}

/**
 * Citizen-readable one-liner for statement lists (feed, MP profile).
 * Prefers LLM summary_one_line when present; otherwise strips boilerplate
 * and takes the opening chunk (not raw agenda metadata).
 */
export function statementListTitle(
  body: string | null | undefined,
  summaryOneLine: string | null | undefined,
  maxLen = 220,
): string {
  const summ = summaryOneLine?.trim();
  if (summ) return summ.length <= maxLen ? summ : truncateAtWord(summ, maxLen);

  const cleaned = cleanStatementBody(body ?? "");
  if (!cleaned) return "";

  const dot = cleaned.search(/\.(?:\s|$)/);
  const firstSentence =
    dot > 0 && dot <= maxLen + 40 ? cleaned.slice(0, dot + 1).trim() : cleaned;

  if (firstSentence.length <= maxLen) return firstSentence;
  return truncateAtWord(firstSentence, maxLen);
}
