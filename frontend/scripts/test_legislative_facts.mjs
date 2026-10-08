import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";
const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
function load(path) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInThisContext(`(function(exports,require){${code}\n})`)(exports, name => name.startsWith("@/") ? load(root + name.slice(2) + ".ts") : name.startsWith(".") ? load(resolve(dirname(path), name) + ".ts") : require(name));
  return exports;
}
const { predictStages } = load(root + "lib/voting/predict_stages.ts");
const { voteMeaning } = load(root + "lib/weekly-stories.ts");
const { shouldProjectLawTimeline } = load(root + "lib/process-timeline.ts");
const date = s => new Date(s + "T00:00:00Z");
const base = { sejmVoteDate: date("2026-09-01"), passed: true, motionPolarity: "pass", documentType: "BILL" };
test("passage alone supplies no Senate, signature or publication date", () => {
 const stages = predictStages(base);
 assert.equal(stages.length, 4);
 for (const stage of stages.slice(1)) { assert.equal(stage.expectedDate, null); assert.equal(stage.deadlineDate, null); }
 assert.equal(stages[3].label, "Publikacja w Dzienniku Ustaw");
});
test("Senate deadline starts at transmission, not the vote", () => {
 const stage = predictStages({ ...base, procedure:"ordinary", toSenateDate:date("2026-09-05") })[1];
 assert.equal(stage.deadlineDate.toISOString().slice(0,10), "2026-10-05");
});
test("special procedures have distinct Senate and presidential deadlines", () => {
 for (const [procedure,senate,president] of [["urgent",14,7],["budget",20,7],["constitutional",null,21]]) {
  const stages = predictStages({ ...base, procedure, toSenateDate:base.sejmVoteDate, toPresidentDate:base.sejmVoteDate });
  if (senate == null) assert.equal(stages[1].deadlineDate,null);
  else assert.equal((stages[1].deadlineDate-base.sejmVoteDate)/86400000,senate);
  assert.equal((stages[2].deadlineDate-base.sejmVoteDate)/86400000,president);
 }
});
test("unknown procedure and presidential suspension produce no false deadline", () => {
 assert.equal(predictStages({ ...base, toPresidentDate:base.sejmVoteDate })[2].deadlineDate,null);
 assert.equal(predictStages({ ...base, procedure:"ordinary", toPresidentDate:base.sejmVoteDate, presidentialDeadlineSuspended:true })[2].deadlineDate,null);
});
test("resolution and unclassified motion do not acquire a law timeline", () => {
 assert.equal(predictStages({ ...base, documentType:"RESOLUTION" }).length,1);
 assert.equal(predictStages({ ...base, documentType:null }).length,1);
 assert.equal(predictStages({ ...base, motionPolarity:null }).length,1);
 assert.equal(predictStages({ ...base, motionPolarity:"reject", passed:false }).length,1);
});
test("only a bill receives projected Senate, President and publication stages", () => {
 assert.equal(shouldProjectLawTimeline("projekt_ustawy"), true);
 for (const category of ["projekt_uchwaly", "wniosek_personalny", "sprawozdanie_komisji", null]) {
  assert.equal(shouldProjectLawTimeline(category), false);
 }
});
test("a recorded publication date is never called entry into force", () => {
 const stage=predictStages({ ...base, promulgationDate:date("2026-09-12") })[3];
 assert.equal(stage.expectedDate.toISOString().slice(0,10),"2026-09-12");
 assert.equal(stage.deadlineDate,null);
 assert.notEqual(stage.label,"Wejście w życie");
});
test("resolution title suffices without description", () => {
 assert.equal(voteMeaning({ title:"Pkt. 1 projekt uchwały", description:null, topic:"całość projektu", motion_polarity:"pass", yes:250,no:190,abstain:20,majority_votes:191 }).label,"Sejm przyjął uchwałę");
});

const { isSourceQuote, sourceSnippet } = load(root + "lib/source-quote.ts");
test("process quotes exclude invented text and other speakers' interruptions", () => {
 const body="3. punkt porządku dziennego: dyskusja. Jan Kowalski: To moje słowa. (Głos z sali: To cudze słowa.) Dalszy ciąg.";
 assert.equal(isSourceQuote(body,"Jan Kowalski","To moje słowa."),true);
 assert.equal(isSourceQuote(body,"Jan Kowalski","To cudze słowa."),false);
 assert.equal(isSourceQuote(body,"Jan Kowalski","Nie padło to zdanie."),false);
 assert.equal(isSourceQuote(body,"Inna Osoba","To moje słowa."),false);
});

test("fallback excerpt is a literal sentence from its speaker, not an interruption or preamble", () => {
 const own = "Proponujemy zmianę zasad, która pozwoli mieszkańcom załatwiać sprawy urzędowe przez internet.";
 const interruption = "To jest zupełnie inna wypowiedź osoby, która akurat zabrała głos z sali.";
 const body = `10. kadencja, 66. posiedzenie Sejmu. Jan Kowalski: (Inny Poseł: ${interruption}) ${own}`;
 assert.equal(sourceSnippet(body, "Jan Kowalski"), own);
 assert.equal(isSourceQuote(body, "Jan Kowalski", sourceSnippet(body, "Jan Kowalski")), true);
 assert.equal(sourceSnippet(body, "Nieznany Mówca"), null);
});

const { chronologicalVotings, latestProcessVoting, recordedStages, stageVoting, processStatus, warsawDay } = load(root + "lib/process-evidence.ts");
const { classifyInFlight } = load(root + "lib/proces-classify.ts");
const ballot = (overrides = {}) => ({ votingId: 1, sitting: 60, votingNumber: 200, date: "2026-09-01", ...overrides });
const processStage = (overrides = {}) => ({ ord: 0, depth: 0, stageType: "Start", stageDate: "2026-09-01", stageName: "", voting: null, ...overrides });

test("latest process voting respects sitting/date rather than restarted vote numbers", () => {
 const old = ballot(); const recent = ballot({ votingId: 2, sitting: 66, votingNumber: 2, date: "2026-10-07" });
 assert.equal(latestProcessVoting([recent,old]),recent);
 assert.deepEqual(chronologicalVotings([recent,old]),[old,recent]);
});
test("scheduled and undated stages never become recorded progress", () => {
 const past=processStage(); const planned=processStage({ord:1,stageDate:"2026-10-09"});
 assert.deepEqual(recordedStages([planned,processStage({stageDate:null}),past],"2026-10-08"),[past]);
 assert.equal(warsawDay(new Date("2026-10-08T23:30:00Z")),"2026-10-09");
});
test("same date alone cannot attach an unrelated motion to a stage", () => {
 const vote=ballot();
 assert.equal(stageVoting(processStage(),[vote]),null);
 assert.equal(stageVoting(processStage({sittingNum:60,voting:{votingNumber:200}}),[vote]),vote);
 assert.equal(stageVoting(processStage({sittingNum:61,voting:{votingNumber:200}}),[vote]),null);
});
test("publication is distinct from entry into force and from a vote result", () => {
 assert.equal(processStatus({documentCategory:"projekt_ustawy"},{act:{eliId:"DU/2026/123",publishedAt:"2026-10-07"}},[]),"Opublikowano w Dzienniku Ustaw");
 assert.equal(processStatus({documentCategory:"uchwala_upamietniajaca"},{passed:true},[]),"Przyjęto — brak dalszych etapów w danych");
});
test("Sejm consideration of a Senate position or veto is classified in Sejm", () => {
 for (const lastStageType of ["SenatePositionConsideration","SenateAmendments","PresidentMotionConsideration","Veto","PresidentVeto"]) {
  assert.equal(classifyInFlight({lastStageType}),"sejm");
 }
 for (const lastStageType of ["End","Rejected","Withdrawn"]) assert.equal(classifyInFlight({lastStageType}),"zakonczone");
});
const sourceVote = (overrides = {}) => ({ title:"Projekt ustawy", topic:"całość projektu", description:null, kind:"ELECTRONIC", yes:250,no:190,abstain:20,majority_votes:191,motion_polarity:"pass",...overrides });
test("missing qualified-majority evidence is not replaced by yes > no", () => {
 assert.equal(voteMeaning(sourceVote({title:"Wniosek Prezydenta o ponowne rozpatrzenie ustawy",majority_votes:null})).label,"Wynik nierozstrzygnięty w dostępnych danych");
 assert.equal(voteMeaning(sourceVote({title:"O uchwale Senatu",topic:"poprawka 1",majority_votes:null})).label,"Wynik nierozstrzygnięty w dostępnych danych");
});
test("zero or invalid tallies do not manufacture a verdict", () => {
 assert.equal(voteMeaning(sourceVote({yes:0,no:0,abstain:0})).tone,"neutral");
 assert.equal(voteMeaning(sourceVote({majority_votes:0})).tone,"neutral");
});
test("procedural source wording overrides an incorrect AI pass classification", () => {
 assert.equal(voteMeaning(sourceVote({topic:"wniosek o skrócenie terminu"})).label,"Wniosek przyjęty");
});
test("unclassified project is not automatically an act of law", () => {
 assert.equal(voteMeaning(sourceVote({title:"Projekt dokumentu"})).label,"Sejm przyjął projekt");
});
const { projectSeats } = load(root + "lib/polls/seats.ts");
test("a combined TD list and its components cannot receive seats twice", () => {
 const result=projectSeats([{party_code:"TD",percentage_avg:20},{party_code:"PSL",percentage_avg:10},{party_code:"Polska2050",percentage_avg:10},{party_code:"KO",percentage_avg:30}]);
 assert.deepEqual(result.map(r=>r.party_code),["TD","KO"]);
 assert.equal(result.reduce((sum,row)=>sum+row.seats,0),460);
});
