import "server-only";
import { unstable_cache } from "next/cache";
import { supabase } from "@/lib/supabase";
import {
  buildWeeklyStories, printNumbers, transcriptContext,
  type StoryPrint, type StoryStatement, type StoryVote, type WeeklyStory,
} from "@/lib/weekly-stories";

export type WeeklyEdition = { stories: WeeklyStory[]; voteCount: number; speechCount: number; planned: boolean };

async function loadWeeklyEdition(term: number, sitting: number): Promise<WeeklyEdition> {
  const sb = supabase();
  const { data: proceeding, error } = await sb.from("proceedings").select("id").eq("term", term).eq("number", sitting).maybeSingle();
  if (error) throw error;
  if (!proceeding) return { stories: [], voteCount: 0, speechCount: 0, planned: false };
  const { data: days, error: daysError } = await sb.from("proceeding_days").select("id").eq("proceeding_id", proceeding.id);
  if (daysError) throw daysError;
  const dayIds = (days ?? []).map(d => d.id);
  // Read all pages: a sitting often exceeds PostgREST's 1000-row ceiling.
  // Full bodies stay on the server, only selected verbatim quotes reach the UI.
  async function statements(): Promise<StoryStatement[]> {
    if (!dayIds.length) return [];
    const out: StoryStatement[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await sb.from("proceeding_statements")
        .select("id, body_text, speaker_name, function, mp_id, rapporteur, viral_quote, viral_score, summary_one_line, topic_tags")
        .eq("term", term).in("proceeding_day_id", dayIds).order("id").range(offset, offset + 499);
      if (error) throw error;
      out.push(...(data ?? []) as StoryStatement[]);
      if ((data?.length ?? 0) < 500) return out;
    }
  }
  async function ballots(): Promise<StoryVote[]> {
    const out: StoryVote[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await sb.from("votings")
        .select("id, voting_number, title, topic, description, short_title, date, yes, no, abstain, majority_votes, motion_polarity, kind")
        .eq("term", term).eq("sitting", sitting).order("voting_number").range(offset, offset + 499);
      if (error) throw error;
      out.push(...(data ?? []) as StoryVote[]);
      if ((data?.length ?? 0) < 500) return out;
    }
  }
  const [speeches, votes] = await Promise.all([statements(), ballots()]);
  // The normalized table currently omits ON_LIST candidate totals. Read
  // these from the official public source, with a bounded timeout. Missing
  // candidate data must never turn aggregate zeroes into a failed motion.
  await Promise.all(votes.filter(v => v.kind === "ON_LIST").map(async v => {
    v.sourceUrl = `https://www.sejm.gov.pl/sejm${term}.nsf/agent.xsp?symbol=glosowania&NrKadencji=${term}&NrPosiedzenia=${sitting}&NrGlosowania=${v.voting_number}`;
    try {
      const response = await fetch(`https://api.sejm.gov.pl/sejm/term${term}/votings/${sitting}/${v.voting_number}`, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) return;
      const body = await response.json();
      if (Array.isArray(body.votingOptions)) v.options = body.votingOptions
        .filter((o: { option?: unknown; votes?: unknown }) => typeof o.option === "string" && typeof o.votes === "number")
        .map((o: { option: string; votes: number }) => ({ name: o.option, votes: o.votes }));
    } catch { /* Render an explicit candidate-vote label and official link. */ }
  }));
  const numbers = [...new Set([
    ...speeches.flatMap(s => transcriptContext(s.body_text)?.printNumbers ?? []),
    ...votes.flatMap(v => printNumbers(`${v.title} ${v.topic ?? ""}`)),
  ])];
  const prints: StoryPrint[] = [];
  for (let i = 0; i < numbers.length; i += 100) {
    const { data, error } = await sb.from("prints")
      .select("id, number, title, short_title, impact_punch, summary_plain, topic_tags, persona_tags, document_category, is_meta_document")
      .eq("term", term).in("number", numbers.slice(i,i+100));
    if (error) throw error;
    prints.push(...(data ?? []) as StoryPrint[]);
  }
  return { stories: buildWeeklyStories(term, speeches, votes, prints), voteCount: votes.length, speechCount: speeches.length, planned: speeches.length === 0 && votes.length === 0 };
}

export function getWeeklyEdition(term: number, sitting: number): Promise<WeeklyEdition> {
  return unstable_cache(() => loadWeeklyEdition(term, sitting), ["weekly-editorial-edition", "v7", String(term), String(sitting)], { revalidate: 300 })();
}
