import { dbTagsToTopics, type TopicId } from "@/lib/topics";
import { dbTagsToPersonas, type PersonaId } from "@/lib/personas";

export type StoryVote = {
  id: number; voting_number: number; title: string; topic: string | null;
  description: string | null; short_title: string | null; date: string;
  yes: number; no: number; abstain: number; majority_votes: number | null;
  motion_polarity: string | null;
  kind?: string; options?: { name: string; votes: number }[];
  sourceUrl?: string;
};
export type StoryStatement = {
  id: number; body_text: string | null; speaker_name: string | null;
  function: string | null; mp_id: number | null; rapporteur: boolean;
  viral_quote: string | null; viral_score: number | null;
  summary_one_line: string | null; topic_tags: string[] | null;
};
export type StoryPrint = {
  id: number; number: string; title: string; short_title: string | null;
  impact_punch: string | null; summary_plain: string | null;
  topic_tags: string[] | null; persona_tags: string[] | null;
  document_category: string | null; is_meta_document: boolean | null;
};
export type DebateContext = { ord: number; title: string; printNumbers: string[] };
export type WeeklyStory = {
  id: string; ord: number | null; title: string; officialTitle: string;
  summary: string | null; topics: TopicId[]; personas: PersonaId[];
  projectSummaries?: { number: string; title: string; text: string }[];
  prints: { number: string; title: string; isProject: boolean }[];
  votes: StoryVote[]; speechCount: number;
  quote: { id: number; text: string; speaker: string; mpId: number | null } | null;
  phase: string; rank: number;
};

export function printNumbers(text: string): string[] {
  const out = new Set<string>();
  for (const match of text.matchAll(/\bdruk(?:i|u|ów)?\s+nr\s+((?:\d+(?:-[A-Za-z0-9]+)?)(?:(?:\s*,\s*|\s+(?:i|oraz)\s+)(?:nr\s+)?\d+(?:-[A-Za-z0-9]+)?)*)/gi)) {
    for (const n of match[1].match(/\d+(?:-[A-Za-z0-9]+)?/g) ?? []) out.add(n);
  }
  return [...out];
}

/** Parse only the source preamble, never a passing mention in a speech. */
export function transcriptContext(body: string | null): DebateContext | null {
  if (!body) return null;
  const match = /^(?:\d+\.\s*kadencja,[\s\S]{0,130}?\)\s*)?(\d+)\.\s*punkt porz[ąa]dku dziennego:\s*/i.exec(body);
  if (!match) return null;
  const rest = body.slice(match[0].length);
  // Stop at the speaker, before searching references. A reference made in
  // the speech itself is not evidence of what this agenda item concerns.
  const title = rest.split(/\s(?:Poseł|Posłanka|Minister|Sekretarz|Podsekretarz|Prezes|Szef|Senator|Rzecznik|Marszałek|Wicemarszałek)(?=\s|:)/)[0].slice(0,2500);
  return { ord: Number(match[1]), title: title.trim(), printNumbers: printNumbers(title) };
}

function voteContext(vote: StoryVote): DebateContext | null {
  const match = /^Pkt\.\s*(\d+)\s+/i.exec(vote.title);
  return match ? { ord: Number(match[1]), title: vote.title.slice(match[0].length), printNumbers: printNumbers(vote.title) } : null;
}

const normal = (s: string) => s.toLocaleLowerCase("pl").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const sentenceSegmenter = new Intl.Segmenter("pl", { granularity: "sentence" });

export function shortSummary(text: string | null, max = 750): string | null {
  if (!text?.trim()) return null;
  const plain = text.replace(/\*\*/g, "").trim();
  const sentences = [...sentenceSegmenter.segment(plain)].map(s => s.segment.trim());
  let out = "";
  for (const sentence of sentences.slice(0, 4)) {
    if (out && out.length + sentence.length > max) break;
    out += (out ? " " : "") + sentence;
  }
  if (out.length <= max) return out;
  return out.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

function selectQuote(statements: StoryStatement[], title: string): WeeklyStory["quote"] {
  const stems = normal(title).split(" ").filter(w => w.length > 5 && !/^(prezydent|prezydenck|noweliz|projekt|ustaw|zmian|kodeks)/.test(w)).map(w => w.slice(0,5));
  const candidates: { statement: StoryStatement; text: string; viral: boolean; viralScore: number; score: number }[] = [];
  for (const s of statements) {
    if (!s.body_text || !s.speaker_name || /marszałek|sekretarz obrad/i.test(s.function ?? "")) continue;
    const speakerEnd = s.body_text.indexOf(s.speaker_name + ":");
    if (speakerEnd < 0) continue;
    const speech = s.body_text.slice(speakerEnd + s.speaker_name.length + 1).replace(/Przebieg posiedzenia\s*$/, "").trim();
    const supplied = s.viral_quote?.trim();
    // Parentheses contain stage directions and interruptions by OTHER
    // speakers. Never quote those under the current speaker's name.
    const passages = speech.split(/\([^)]*\)/);
    let viralText: string | null = null;
    if (supplied) {
      const passage = passages.find(p => p.includes(supplied));
      if (passage) {
        const start = passage.indexOf(supplied);
        const end = start + supplied.length;
        const sentence = [...sentenceSegmenter.segment(passage)].find(s => s.index + s.segment.trimEnd().length >= end);
        // Some stored excerpts stop at a character limit, mid-sentence.
        // Complete that sentence from the source instead of showing a
        // dangling accusation. The display length limit still applies.
        viralText = /[.!?…][”"]?$/.test(supplied) ? supplied
          : sentence ? passage.slice(start, sentence.index + sentence.segment.trimEnd().length).trim() : null;
      }
    }
    const choices = [...new Set([
      ...(viralText ? [viralText] : []),
      ...passages.flatMap(p => [...sentenceSegmenter.segment(p)].map(x => x.segment.trim())),
    ])];
    for (const text of choices) {
      const viral = text === viralText;
      // A short punchline or a few connected sentences can be more powerful
      // than a technical explanation. Keep the supplied excerpt intact.
      if (text.length < (viral ? 30 : 65) || text.length > (viral ? 360 : 250) || /Dziękuję|Panie Marszałku|Wysoka Izbo|Oklaski|\(Dzwonek\)|mam (?:zaszczyt|przyjemność)|przedstawi[ćaę].*sprawozdani|w imieniu|druki? nr|wnosi.*Wysoki Sejm|(?:Poseł|Posłanka|Głos z sali).*:|projekt dotyczy zmian w ustawie|debatujemy na temat|rozpatrujemy.*projekt/i.test(text)) continue;
      const relevance = stems.filter(stem => normal(text).includes(stem)).length;
      candidates.push({ statement: s, text, viral, viralScore: s.viral_score ?? 0,
        score: relevance * 8 + (s.rapporteur ? 2 : 0) - text.length / 100 });
    }
  }
  // Debate membership establishes context. Prefer the editorial viral
  // excerpt, then its emotional/viral score; keyword density only breaks
  // ties. Ordinary sentences are a fallback when no valid viral exists.
  const best = candidates.sort((a,b) => Number(b.viral) - Number(a.viral)
    || (a.viral && b.viral ? b.viralScore - a.viralScore : 0)
    || b.score - a.score || a.statement.id - b.statement.id)[0];
  return best ? { id: best.statement.id, text: best.text, speaker: best.statement.speaker_name!, mpId: best.statement.mp_id } : null;
}

export type VoteMeaning = { label: string; question: string; tone: "positive" | "negative" | "neutral" };
export function voteMeaning(v: StoryVote): VoteMeaning {
  const passed = v.majority_votes != null ? v.yes >= v.majority_votes : v.yes > v.no;
  const question = (v.topic || v.description || v.title).replace(/\.$/, "");
  if (v.kind === "ON_LIST") {
    const elected = v.majority_votes != null ? v.options?.filter(o => o.votes >= v.majority_votes!) : null;
    return { label: elected?.length ? `Wybrano: ${elected.map(o => o.name).join(", ")}` : v.options?.length && v.majority_votes != null ? "Żadna kandydatura nie uzyskała wymaganej większości" : "Głosowanie nad kandydaturami", question, tone: "neutral" };
  }
  if (/wniosk.*Prezydenta.*ponowne rozpatrzenie/i.test(v.title)) {
    return { label: passed ? "Sejm odrzucił weto prezydenta" : "Weto prezydenta pozostaje w mocy", question: "Głosowanie nad ponownym uchwaleniem ustawy", tone: "neutral" };
  }
  if (/poprawk/i.test(question) && !/całoś(?:cią|ć) projektu/i.test(question)) {
    // At the Senate stage the Sejm votes to REJECT amendments (art. 121.3),
    // even when the source topic is only "poprawka 1". Lack of the absolute
    // majority therefore keeps the Senate amendment in the bill.
    const senate = /uchwale Senatu/i.test(v.title);
    const reject = /odrzuceni/i.test(question) || (senate && !/przyjęci/i.test(question));
    const accepted = reject ? !passed : passed;
    return { label: accepted ? "Poprawka przyjęta" : "Poprawka odrzucona", question: senate && !/odrzuceni|przyjęci/i.test(question) ? `Głosowanie nad odrzuceniem poprawek Senatu: ${question}` : question, tone: "neutral" };
  }
  if (/odrzuceni[eu].*(?:całości.*projekt|projekt)/i.test(question) || v.motion_polarity === "reject") {
    return { label: passed ? "Sejm odrzucił projekt" : "Wniosek o odrzucenie projektu upadł", question, tone: passed ? "negative" : "neutral" };
  }
  if (v.motion_polarity === "pass" || /całoś(?:cią|ć) projektu/i.test(question)) {
    const resolution = /projekt(?:u)? uchwały/i.test(`${v.description ?? ""} ${v.title} ${question}`);
    return { label: resolution ? (passed ? "Sejm przyjął uchwałę" : "Sejm odrzucił projekt uchwały") : (passed ? "Sejm uchwalił ustawę" : "Sejm odrzucił projekt ustawy"), question, tone: passed ? "positive" : "negative" };
  }
  return { label: passed ? "Wniosek przyjęty" : "Wniosek odrzucony", question, tone: "neutral" };
}

export function principalVote(votes: StoryVote[]): StoryVote | null {
  const ordered = [...votes].sort((a,b) => a.voting_number - b.voting_number);
  return ordered.filter(v => v.motion_polarity === "pass").at(-1)
    ?? ordered.filter(v => /wniosk.*Prezydenta.*ponowne rozpatrzenie/i.test(v.title)).at(-1)
    ?? ordered.filter(v => v.motion_polarity === "reject").at(-1)
    ?? ordered.at(-1) ?? null;
}

export function buildWeeklyStories(term: number, statements: StoryStatement[], votes: StoryVote[], prints: StoryPrint[]): WeeklyStory[] {
  const groups: { context: DebateContext; statements: StoryStatement[]; votes: StoryVote[] }[] = [];
  // These ordinals come exclusively from the actual sitting's transcripts
  // and voting records. The separately published planned agenda may differ.
  const findGroup = (context: DebateContext) => groups.find(g => g.context.ord === context.ord);
  for (const statement of statements) {
    const context = transcriptContext(statement.body_text);
    if (!context) continue;
    let group = findGroup(context);
    if (!group) { group = { context, statements: [], votes: [] }; groups.push(group); }
    group.statements.push(statement);
    group.context.printNumbers = [...new Set([...group.context.printNumbers, ...context.printNumbers])];
  }
  for (const vote of votes) {
    const context = voteContext(vote);
    if (!context) {
      const numbers = printNumbers(`${vote.title} ${vote.topic ?? ""}`);
      const matches = groups.filter(g => numbers.some(n => g.context.printNumbers.includes(n)));
      // Some elections and procedural votes omit Pkt. Match only an
      // unambiguous explicit document reference within this same sitting.
      if (matches.length === 1) matches[0].votes.push(vote);
      continue;
    }
    let group = findGroup(context);
    if (!group) { group = { context, statements: [], votes: [] }; groups.push(group); }
    group.votes.push(vote);
    group.context.printNumbers = [...new Set([...group.context.printNumbers, ...context.printNumbers])];
  }
  const byNumber = new Map(prints.map(p => [p.number,p]));
  return groups.map(({ context, statements: speeches, votes: ballots }): WeeklyStory => {
    const related = context.printNumbers.map(n => byNumber.get(n)).filter((p): p is StoryPrint => !!p);
    const projects = related.filter(p => !p.is_meta_document && ["projekt_ustawy", "projekt_uchwaly"].includes(p.document_category ?? ""));
    const primary = projects[0] ?? related.find(p => p.summary_plain || p.impact_punch);
    const vote = principalVote(ballots);
    const isVeto = /wniosk.*Prezydenta.*ponowne rozpatrzenie/i.test(context.title);
    const senate = /uchwale Senatu/i.test(context.title);
    const title = projects.length > 1
      ? `${projects[0].short_title || projects[0].title} — wspólna debata`
      : projects[0]?.short_title || vote?.short_title || primary?.short_title || context.title.replace(/\s*\(druki?\s+nr[^)]*\)\.?/i, "");
    // Keep each proposal separate; prefer substance over a punchline.
    const projectSummaries = projects.length > 1 ? projects.flatMap(p => {
      const text = shortSummary(p.summary_plain || p.impact_punch || null);
      return text ? [{ number: p.number, title: p.short_title || p.title, text }] : [];
    }) : [];
    const summary = vote?.kind === "ON_LIST"
      ? (vote.options?.length ? `Kandydatury: ${vote.options.map(o => o.name).join("; ")}.` : null)
      : projects.length > 1
      ? projectSummaries.map(p => p.text).join(" ") || null
      : shortSummary(primary?.summary_plain || primary?.impact_punch || null);
    const phase = isVeto ? "Weto prezydenta" : senate ? "Poprawki Senatu" : /Pierwsze czytanie/i.test(context.title) ? "Pierwsze czytanie" : ballots.length ? "Debata i głosowania" : "Debata w Sejmie";
    return {
      id: `${term}-${context.ord}-${context.printNumbers[0] ?? "debata"}`, ord: context.ord,
      title, officialTitle: context.title, summary, projectSummaries,
      topics: [...new Set([...projects.flatMap(p => dbTagsToTopics(p.topic_tags)), ...speeches.flatMap(s => dbTagsToTopics(s.topic_tags))])],
      personas: [...new Set(projects.flatMap(p => dbTagsToPersonas(p.persona_tags)))],
      prints: (projects.length ? projects : related).map(p => ({ number: p.number, title: p.short_title || p.title, isProject: projects.includes(p) })),
      votes: ballots.sort((a,b) => a.voting_number - b.voting_number), speechCount: speeches.length,
      quote: selectQuote(speeches, title), phase,
      rank: (isVeto ? 10 : 0) + (vote?.motion_polarity === "pass" ? 5 : 0) + (summary ? 3 : 0) + (projects.length ? 2 : 0),
    };
  }).sort((a,b) => b.rank - a.rank || (a.ord ?? 0) - (b.ord ?? 0));
}
