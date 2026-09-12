// Offline regression tests against the actual production TS implementation.
// Run: node frontend/scripts/test_weekly_stories.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";
const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
function load(path) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInThisContext(`(function(exports,require){${code}\n})`)(exports, name => name.startsWith("@/") ? load(root + name.slice(2) + ".ts") : require(name));
  return exports;
}
const { voteMeaning, transcriptContext, buildWeeklyStories, principalVote } = load(root + "lib/weekly-stories.ts");
const vote = (overrides = {}) => ({ id: 1, voting_number: 1, title: "Pkt. 1 Projekt (druki nr 100 i 200)", topic: "głosowanie nad całością projektu", description: "całość projektu ustawy", motion_polarity: "pass", yes: 241, no: 198, abstain: 3, majority_votes: 199, ...overrides });
const body = (ord, refs, text) => `10. kadencja, 64. posiedzenie, 1. dzień (02-09-2026) ${ord}. punkt porządku dziennego: Projekt (druki nr ${refs}). Poseł Jan Kowalski: ${text}`;
const quote = "Nowe przepisy pozwolą mieszkańcom załatwiać sprawy urzędowe bez wychodzenia z domu.";
const speech = (overrides = {}) => ({ id: 1, speaker_name: "Jan Kowalski", function: "Poseł", body_text: body(1, "100 i 200", quote), viral_quote: null, ...overrides });
const prints = [{ id: 10, number: "100", title: "Projekt ustawy", short_title: "Sprawy urzędowe online", document_category: "projekt_ustawy", summary_plain: "Projekt umożliwia załatwianie spraw przez internet." }, { id: 20, number: "200", title: "Sprawozdanie", document_category: "sprawozdanie_komisji", is_meta_document: true }];

test("failed rejection motion means the project survives", () => {
  assert.equal(voteMeaning(vote({ motion_polarity: "reject", topic: "wniosek o odrzucenie projektu", yes: 201, majority_votes: 242 })).label, "Wniosek o odrzucenie projektu upadł");
  assert.equal(voteMeaning(vote({ motion_polarity: "reject", topic: "wniosek o odrzucenie projektu" })).label, "Sejm odrzucił projekt");
});
test("veto requires the declared qualified majority even with more yes than no", () => {
  assert.equal(voteMeaning(vote({ title: "Pkt. 17 wniosku Prezydenta o ponowne rozpatrzenie ustawy", majority_votes: 266 })).label, "Weto prezydenta pozostaje w mocy");
});
test("rejection of a Senate amendment does not mean rejection of the bill", () => {
  assert.equal(voteMeaning(vote({ topic: "wniosek o odrzucenie poprawki Senatu", motion_polarity: "reject", yes: 0, majority_votes: 216 })).label, "Poprawka przyjęta");
});
test("bare Senate amendment topic still means voting on its rejection", () => {
  const meaning = voteMeaning(vote({ title:"Pkt. 27 Sprawozdanie Komisji o uchwale Senatu", topic:"poprawka 1", motion_polarity:null, yes:0, no:409, abstain:21, majority_votes:216 }));
  assert.equal(meaning.label, "Poprawka przyjęta");
  assert.match(meaning.question, /odrzuceniem poprawek Senatu/);
});
test("a resolution is not a law", () => {
  assert.equal(voteMeaning(vote({ description: "całość projektu uchwały" })).label, "Sejm przyjął uchwałę");
});
test("candidate votes never use aggregate zero tallies as a rejected motion", () => {
  assert.equal(voteMeaning(vote({ kind: "ON_LIST", yes: 0, no: 0, abstain: 0 })).label, "Głosowanie nad kandydaturami");
  assert.equal(voteMeaning(vote({ kind: "ON_LIST", options: [{name:"Kandydat A", votes:230}], majority_votes:219 })).label, "Wybrano: Kandydat A");
});
test("the final vote takes priority over earlier rejection and amendments", () => {
  const final = vote({ id: 3, voting_number: 3 });
  assert.equal(principalVote([vote({ id: 1, motion_polarity: "reject" }), final, vote({ id: 2, voting_number: 2, motion_polarity: "amendment" })]).id, 3);
});
test("parse only source preamble, not mentions in the speech", () => {
  assert.equal(transcriptContext("W dyskusji omawiam 1. punkt porządku dziennego: druk nr 999."), null);
  assert.deepEqual(transcriptContext(body(2, "100 i 200", "Dotyczy również druku nr 999.")).printNumbers, ["100", "200"]);
});
test("one story joins debate, report and all votes using actual agenda numbering", () => {
  const stories = buildWeeklyStories(10, [speech(), speech({ id: 2, body_text: body(1, "100", quote) })], [vote(), vote({ id: 2, motion_polarity: "reject" })], prints);
  assert.equal(stories.length, 1);
  assert.equal(stories[0].speechCount, 2);
  assert.equal(stories[0].votes.length, 2);
  assert.equal(stories[0].prints.length, 1);
  assert.equal(stories[0].quote.text, quote);
});
test("joint debate remains one preview with two projects", () => {
  const stories = buildWeeklyStories(10, [speech()], [], [prints[0], { ...prints[1], document_category: "projekt_ustawy", is_meta_document: false }]);
  assert.equal(stories.length, 1);
  assert.equal(stories[0].prints.length, 2);
});
test("a real sentence fills a missing viral quote without inventing one", () => {
  const story = buildWeeklyStories(10, [speech({ viral_quote: "Invented words that never occurred in this source transcript." })], [], prints)[0];
  assert.equal(story.quote.text, quote);
});
test("interruptions by other speakers cannot be attributed to the current speaker", () => {
  const interruption = "To zupełnie inne słowa wypowiedziane przez osobę, która przerwała przemówienie.";
  const story = buildWeeklyStories(10, [speech({ body_text: body(1, "100", `(Poseł Inny Poseł: ${interruption}) Dziękuję.`), viral_quote: interruption })], [], prints)[0];
  assert.equal(story.quote, null);
});
test("viral excerpt beats a keyword-rich ordinary summary of the same debate", () => {
  const punchline = "To nie jest reforma. To policzek wymierzony ludziom, którzy wam zaufali!";
  const story = buildWeeklyStories(10, [speech(), speech({ id: 2, body_text: body(1, "100", punchline), viral_quote: punchline, viral_score: 0.9 })], [], prints)[0];
  assert.equal(story.quote.text, punchline);
});
test("highest viral score takes priority over title keyword overlap", () => {
  const calmer = "Sprawy urzędowe online to ważna zmiana dla mieszkańców naszych miejscowości.";
  const punchline = "Obiecaliście ludziom pomoc. Zostawiliście ich samych z rachunkami!";
  const story = buildWeeklyStories(10, [speech({body_text: body(1,"100",calmer), viral_quote:calmer,viral_score:0.5}), speech({id:2,body_text:body(1,"100",punchline),viral_quote:punchline,viral_score:0.95})], [], prints)[0];
  assert.equal(story.quote.text, punchline);
});
test("short viral punchlines survive the ordinary sentence length threshold", () => {
  const punchline = "Nawet złodzieje mają swój honor. A wy?";
  const story = buildWeeklyStories(10, [speech({body_text:body(1,"100",punchline),viral_quote:punchline,viral_score:0.9})], [], prints)[0];
  assert.equal(story.quote.text, punchline);
});
test("a viral excerpt cut mid-sentence is completed using its original source", () => {
  const fragment = "Obiecaliście ludziom pomoc, a teraz";
  const whole = fragment + " zostawiacie ich samych z rachunkami!";
  const story = buildWeeklyStories(10, [speech({body_text:body(1,"100",whole),viral_quote:fragment,viral_score:0.9})], [], prints)[0];
  assert.equal(story.quote.text, whole);
});

test("citizen summary keeps concrete conditions instead of using the impact headline", () => {
  const details = "Projekt obejmuje pracowników. Limit wynosi 20 dni. Dotyczy umów zawartych po ogłoszeniu. Wniosek składa się u pracodawcy. Podany limit obejmuje cały rok. Termin wejścia w życie nie jest ustalony.";
  const story = buildWeeklyStories(10, [speech()], [], [{ ...prints[0], summary_plain: details, impact_punch: "Więcej praw dla pracowników" }])[0];
  assert.equal(story.summary, details);
});

test("joint debate preserves separate summaries and conditions for every proposal", () => {
  const first = "Pierwszy projekt dotyczy pracowników.";
  const second = "Drugi projekt dotyczy pracodawców.";
  const story = buildWeeklyStories(10, [speech()], [], [
    { ...prints[0], summary_plain: first },
    { ...prints[1], document_category: "projekt_ustawy", is_meta_document: false, summary_plain: second },
  ])[0];
  assert.deepEqual(story.projectSummaries.map(p => [p.number, p.text]), [["100", first], ["200", second]]);
});

const { readWeeklyFilters, matchesWeeklyFilters } = load(root + "lib/weekly-filters.ts");
test("an ordinary edition link always includes stories without classification", () => {
  assert.equal(matchesWeeklyFilters({ topics: [], personas: [] }, readWeeklyFilters({})), true);
});

test("invalid or duplicated URL filters cannot create an invisible active filter", () => {
  assert.deepEqual(readWeeklyFilters({ topics: "unknown,zdrowie,zdrowie", personas: "unknown" }), { topics: ["zdrowie"], personas: [] });
  assert.deepEqual(readWeeklyFilters({ topics: "", personas: "" }), { topics: [], personas: [] });
});

test("only explicitly selected topics narrow an edition", () => {
  const filters = readWeeklyFilters({ topics: "zdrowie" });
  assert.equal(matchesWeeklyFilters({ topics: ["zdrowie"], personas: [] }, filters), true);
  assert.equal(matchesWeeklyFilters({ topics: ["transport"], personas: [] }, filters), false);
});
