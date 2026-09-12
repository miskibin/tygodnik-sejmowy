/** A quotation must occur in the named speaker's own passage, outside interruptions. */
export function isSourceQuote(body: string | null, speaker: string | null, quote: string | null): boolean {
  if (!body || !speaker || !quote?.trim()) return false;
  const start = body.indexOf(speaker + ":");
  if (start < 0) return false;
  const speech = body.slice(start + speaker.length + 1);
  return speech.split(/\([^)]*\)/).some(passage => passage.includes(quote.trim()));
}
