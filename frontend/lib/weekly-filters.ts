import { TOPIC_IDS, type TopicId } from "@/lib/topics";
import { PERSONA_IDS, type PersonaId } from "@/lib/personas";
import { personasImplyAnyTopic } from "@/lib/topic-persona-map";

export type WeeklyFilters = { topics: TopicId[]; personas: PersonaId[] };

// Only an explicit link filters an edition. Saved preferences alone must
// never hide stories from someone returning to the main page.
export function readWeeklyFilters(params: Record<string, string | string[] | undefined>): WeeklyFilters {
  function read<T extends string>(value: string | string[] | undefined, allowed: readonly T[]): T[] {
    const raw = Array.isArray(value) ? value[0] : value;
    return [...new Set((raw ?? "").split(",").map(s => s.trim()))]
      .filter((s): s is T => (allowed as readonly string[]).includes(s));
  }
  return { topics: read(params.topics, TOPIC_IDS), personas: read(params.personas, PERSONA_IDS) };
}

export function matchesWeeklyFilters(story: { topics: TopicId[]; personas: PersonaId[] }, filters: WeeklyFilters): boolean {
  return (!filters.topics.length || story.topics.some(t => filters.topics.includes(t)))
    && (!filters.personas.length || story.personas.some(p => filters.personas.includes(p))
      || personasImplyAnyTopic(filters.personas, new Set(story.topics)));
}
