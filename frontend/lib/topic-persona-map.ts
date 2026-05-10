// Bridge between the two parallel chip taxonomies.
//
// Topic chips (lib/topics.ts) are the primary filter row; persona chips
// (lib/personas.ts) are a secondary "I am X" toggle. Prints carry both
// `topic_tags` (LLM-set, 11-value enum) and `persona_tags` (LLM-set,
// 25-value taxonomy collapsed to 9 personas via dbTagsToPersonas).
//
// Citizen review (2026-05-08) flagged that prints tagged only with
// `najemca`/`wlasciciel-mieszkania` (→ persona "mieszkaniec") were missed
// when the user picked the "mieszkanie-media" topic chip. This map lets
// the filter widen a topic-chip selection to also catch prints that
// surface that audience via persona tags only.
//
// Direction is intentionally one-way (persona → topic). Going topic →
// persona is ambiguous (a "biznes-podatki" topic could mean
// przedsiebiorca OR podatnik) and not needed by current callers.

import type { PersonaId } from "./personas";
import type { TopicId } from "./topics";

const PERSONA_TO_TOPIC: Record<PersonaId, readonly TopicId[]> = {
  pracownik:      ["praca-zus"],
  przedsiebiorca: ["biznes-podatki"],
  rolnik:         ["rolnictwo-wies"],
  rodzic:         ["edukacja-rodzina"],
  pacjent:        ["zdrowie"],
  emeryt:         ["emerytury"],
  kierowca:       ["transport"],
  mieszkaniec:    ["mieszkanie-media"],
  podatnik:       ["biznes-podatki"],
};

export function personaToTopics(persona: PersonaId): readonly TopicId[] {
  return PERSONA_TO_TOPIC[persona];
}

// Returns true if any of the print's persona_tags imply at least one of
// the given topics. Cheap O(personas × topicsPerPersona) — no allocation
// for the common case where personas is empty.
export function personasImplyAnyTopic(
  personas: readonly PersonaId[],
  topicSet: ReadonlySet<TopicId>,
): boolean {
  for (const p of personas) {
    for (const t of PERSONA_TO_TOPIC[p]) {
      if (topicSet.has(t)) return true;
    }
  }
  return false;
}
