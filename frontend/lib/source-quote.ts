/** A quotation must occur in the named speaker's own passage, outside interruptions. */
export function isSourceQuote(body: string | null, speaker: string | null, quote: string | null): boolean {
  if (!body || !speaker || !quote?.trim()) return false;
  const start = body.indexOf(speaker + ":");
  if (start < 0) return false;
  const speech = body.slice(start + speaker.length + 1);
  return speech.split(/\([^)]*\)/).some(passage => passage.includes(quote.trim()));
}

/** Literal sentence from the named speaker, never a preamble or interruption. */
export function sourceSnippet(body: string | null, speaker: string | null): string | null {
  if (!body || !speaker) return null;
  const start = body.indexOf(speaker + ":");
  if (start < 0) return null;
  const speech = body.slice(start + speaker.length + 1);
  for (const passage of speech.split(/\([^)]*\)/)) {
    for (const sentence of passage.split(/(?<=[.!?])\s+/)) {
      const quote = sentence.trim();
      if (quote.length >= 60 && quote.length <= 220) return quote;
    }
  }
  return null;
}
