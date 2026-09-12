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
test("a recorded publication date is never called entry into force", () => {
 const stage=predictStages({ ...base, promulgationDate:date("2026-09-12") })[3];
 assert.equal(stage.expectedDate.toISOString().slice(0,10),"2026-09-12");
 assert.equal(stage.deadlineDate,null);
 assert.notEqual(stage.label,"Wejście w życie");
});
test("resolution title suffices without description", () => {
 assert.equal(voteMeaning({ title:"Pkt. 1 projekt uchwały", description:null, topic:"całość projektu", motion_polarity:"pass", yes:250,no:190,abstain:20,majority_votes:191 }).label,"Sejm przyjął uchwałę");
});

const { isSourceQuote } = load(root + "lib/source-quote.ts");
test("process quotes exclude invented text and other speakers' interruptions", () => {
 const body="3. punkt porządku dziennego: dyskusja. Jan Kowalski: To moje słowa. (Głos z sali: To cudze słowa.) Dalszy ciąg.";
 assert.equal(isSourceQuote(body,"Jan Kowalski","To moje słowa."),true);
 assert.equal(isSourceQuote(body,"Jan Kowalski","To cudze słowa."),false);
 assert.equal(isSourceQuote(body,"Jan Kowalski","Nie padło to zdanie."),false);
 assert.equal(isSourceQuote(body,"Inna Osoba","To moje słowa."),false);
});
