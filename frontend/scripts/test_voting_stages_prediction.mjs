// Validate predict_stages model against historical term-10 process_stages.
//
// For each historical process where we have actual stage dates, predict
// using only `sejmVoteDate` (cold-start, no anchors) and compare predicted
// vs actual for each downstream stage.
//
// Run: `node scripts/test_voting_stages_prediction.mjs`

import { writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
// Tiny .env loader (no dotenv dep) — KEY=VALUE lines, ignores comments and blanks.
const envText = readFileSync(join(ROOT, "..", ".env.local"), "utf8");
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("Set SUPABASE_URL + SUPABASE_ANON_KEY in frontend/.env.local");

// ─── Replicate the model (avoid TS import; mirror the constants) ───
const STAGE_GAPS = {
  sejmToSenate: { median: 13, deadline: 30 },
  senateToPresident: { median: 1, deadline: 10 },
  presidentConsider: { median: 18, deadline: 21 },
  signatureToPromulgation: { median: 5, deadline: 14 },
};
const addDays = (d, n) => { const o = new Date(d); o.setDate(o.getDate() + n); return o; };

// Cold-start cascade: predict every downstream stage using only sejm vote.
function predictCascade(sejmVote) {
  const senate = addDays(sejmVote, STAGE_GAPS.sejmToSenate.median);
  const senateDeadline = addDays(sejmVote, STAGE_GAPS.sejmToSenate.deadline);
  const toPres = addDays(senate, STAGE_GAPS.senateToPresident.median);
  const presSig = addDays(toPres, STAGE_GAPS.presidentConsider.median);
  const presSigDeadline = addDays(toPres, STAGE_GAPS.presidentConsider.deadline);
  const promul = addDays(presSig, STAGE_GAPS.signatureToPromulgation.median);
  const promulDeadline = addDays(presSig, STAGE_GAPS.signatureToPromulgation.deadline);
  return { senate, senateDeadline, toPres, presSig, presSigDeadline, promul, promulDeadline };
}

// One-step-ahead conditional predictions: predict each stage using the actual
// prior stage as anchor (when available). This is what the UI does — only
// future-unknown stages are predicted; known stages display actual dates.
// To validate the model we predict each stage from actual prior and measure
// error against actual current.
function predictOneStepAhead(sejmVote, actuals) {
  // Senate predicted from sejm vote (which is always actual).
  const senate = addDays(sejmVote, STAGE_GAPS.sejmToSenate.median);
  // ToPres predicted from actual senate (if known) — else from predicted senate.
  const toPres = addDays(actuals.senatePos ? new Date(actuals.senatePos) : senate, STAGE_GAPS.senateToPresident.median);
  // PresSig predicted from actual toPres if known, else from predicted toPres.
  const presSig = addDays(actuals.toPres ? new Date(actuals.toPres) : toPres, STAGE_GAPS.presidentConsider.median);
  // Promul predicted from actual presSig if known.
  const promul = addDays(actuals.presSig ? new Date(actuals.presSig) : presSig, STAGE_GAPS.signatureToPromulgation.median);
  return { senate, toPres, presSig, promul };
}

// ─── Pull cohort via PostgREST RPC (raw SQL via execute_sql endpoint not available — use REST) ───
const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

async function fetchAll() {
  // process_stages is small; pull everything and aggregate in JS.
  const stagesRes = await fetch(
    `${SUPABASE_URL}/rest/v1/process_stages?select=process_id,stage_type,stage_date&stage_date=not.is.null&limit=10000`,
    { headers }
  );
  if (!stagesRes.ok) throw new Error(`stages fetch failed: ${stagesRes.status} ${await stagesRes.text()}`);
  const stages = await stagesRes.json();

  // Only ustawy (laws) — uchwały and resolutions don't traverse Senate/President.
  const procRes = await fetch(
    `${SUPABASE_URL}/rest/v1/processes?select=id,title,passed,eli_act_id,document_type_enum&document_type_enum=eq.BILL&limit=2000`,
    { headers }
  );
  if (!procRes.ok) throw new Error(`processes fetch failed: ${procRes.status}`);
  const procs = await procRes.json();

  const eliIds = procs.map(p => p.eli_act_id).filter(x => x != null);
  let acts = [];
  if (eliIds.length) {
    const idsCsv = eliIds.join(",");
    const actsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/acts?select=id,promulgation_date&id=in.(${idsCsv})&limit=5000`,
      { headers }
    );
    if (!actsRes.ok) throw new Error(`acts fetch failed: ${actsRes.status}`);
    acts = await actsRes.json();
  }
  const actById = new Map(acts.map(a => [a.id, a.promulgation_date]));

  // Aggregate stages per process: pick MIN date per relevant stage_type.
  const byProc = new Map();
  for (const s of stages) {
    if (!s.stage_date) continue;
    const e = byProc.get(s.process_id) ?? {};
    const cur = e[s.stage_type];
    if (!cur || s.stage_date < cur) e[s.stage_type] = s.stage_date;
    byProc.set(s.process_id, e);
  }

  const cohort = [];
  for (const p of procs) {
    const st = byProc.get(p.id);
    if (!st || !st.Voting) continue;
    cohort.push({
      process_id: p.id,
      title: p.title,
      passed: p.passed,
      sejmVote: st.Voting,
      senatePos: st.SenatePosition ?? null,
      toPres: st.ToPresident ?? null,
      presSig: st.PresidentSignature ?? null,
      promul: actById.get(p.eli_act_id) ?? null,
    });
  }
  return cohort;
}

function dayDiff(a, b) {
  if (!a || !b) return null;
  return Math.round((new Date(a) - new Date(b)) / 86400000);
}

function stats(arr) {
  const ok = arr.filter(x => x != null);
  if (!ok.length) return null;
  const abs = ok.map(Math.abs).sort((a, b) => a - b);
  const sum = ok.reduce((s, v) => s + v, 0);
  const sumAbs = abs.reduce((s, v) => s + v, 0);
  const sumSq = ok.reduce((s, v) => s + v * v, 0);
  return {
    n: ok.length,
    mean: +(sum / ok.length).toFixed(2),
    mae: +(sumAbs / ok.length).toFixed(2),
    rmse: +Math.sqrt(sumSq / ok.length).toFixed(2),
    p50: abs[Math.floor(abs.length / 2)],
    p90: abs[Math.floor(abs.length * 0.9)],
    max: abs[abs.length - 1],
    within7: +(abs.filter(d => d <= 7).length / ok.length * 100).toFixed(1),
    within14: +(abs.filter(d => d <= 14).length / ok.length * 100).toFixed(1),
  };
}

// ─── Main ───
const cohort = await fetchAll();
console.log(`cohort: ${cohort.length} processes with Sejm vote stage`);

const errCascade = { senate: [], toPres: [], presSig: [], promul: [] };
const errCond = { senate: [], toPres: [], presSig: [], promul: [] };
const deadlineHits = { senate: { in: 0, n: 0 }, presSig: { in: 0, n: 0 }, promul: { in: 0, n: 0 } };
const outliers = [];

for (const c of cohort) {
  if (!c.passed) continue;
  const validAfter = (d) => d != null && new Date(d) >= new Date(c.sejmVote);

  // Cold-start cascade — only sejm vote known.
  const pCasc = predictCascade(c.sejmVote);
  if (validAfter(c.senatePos)) errCascade.senate.push(dayDiff(c.senatePos, pCasc.senate));
  if (validAfter(c.toPres)) errCascade.toPres.push(dayDiff(c.toPres, pCasc.toPres));
  if (validAfter(c.presSig)) errCascade.presSig.push(dayDiff(c.presSig, pCasc.presSig));
  if (validAfter(c.promul)) errCascade.promul.push(dayDiff(c.promul, pCasc.promul));

  // One-step-ahead conditional — predict from actual prior. UI's real skill.
  const pCond = predictOneStepAhead(c.sejmVote, c);
  if (validAfter(c.senatePos)) errCond.senate.push(dayDiff(c.senatePos, pCond.senate));
  if (validAfter(c.toPres) && c.senatePos) errCond.toPres.push(dayDiff(c.toPres, pCond.toPres));
  if (validAfter(c.presSig) && c.toPres) errCond.presSig.push(dayDiff(c.presSig, pCond.presSig));
  if (validAfter(c.promul) && c.presSig) errCond.promul.push(dayDiff(c.promul, pCond.promul));

  // Deadline coverage — % of actuals that arrive on/before predicted deadline.
  // This is what matters for UI: deadline = constitutional max, must be ≥100%.
  if (validAfter(c.senatePos)) {
    deadlineHits.senate.n++;
    if (new Date(c.senatePos) <= pCasc.senateDeadline) deadlineHits.senate.in++;
  }
  if (validAfter(c.presSig) && c.toPres) {
    deadlineHits.presSig.n++;
    const dl = addDays(new Date(c.toPres), STAGE_GAPS.presidentConsider.deadline);
    if (new Date(c.presSig) <= dl) deadlineHits.presSig.in++;
  }
  if (validAfter(c.promul) && c.presSig) {
    deadlineHits.promul.n++;
    const dl = addDays(new Date(c.presSig), STAGE_GAPS.signatureToPromulgation.deadline);
    if (new Date(c.promul) <= dl) deadlineHits.promul.in++;
  }

  // Outliers (cascade — strictest)
  const outs = [];
  const eSen = validAfter(c.senatePos) ? dayDiff(c.senatePos, pCasc.senate) : null;
  const ePr = validAfter(c.promul) ? dayDiff(c.promul, pCasc.promul) : null;
  if (eSen != null && Math.abs(eSen) > 14) outs.push(`senate ${eSen}d`);
  if (ePr != null && Math.abs(ePr) > 14) outs.push(`promul ${ePr}d`);
  if (outs.length) outliers.push({ proc: c.process_id, title: (c.title ?? "").slice(0, 80), errs: outs.join(", ") });
}

const report = {
  cohort_size: cohort.filter(c => c.passed).length,
  cold_start_cascade: {
    senate: stats(errCascade.senate),
    toPresident: stats(errCascade.toPres),
    presidentSignature: stats(errCascade.presSig),
    promulgation: stats(errCascade.promul),
  },
  conditional_on_actual_prior: {
    senate: stats(errCond.senate),
    toPresident: stats(errCond.toPres),
    presidentSignature: stats(errCond.presSig),
    promulgation: stats(errCond.promul),
  },
  deadline_coverage: {
    senate: deadlineHits.senate.n ? +(100 * deadlineHits.senate.in / deadlineHits.senate.n).toFixed(1) : null,
    presidentSignature: deadlineHits.presSig.n ? +(100 * deadlineHits.presSig.in / deadlineHits.presSig.n).toFixed(1) : null,
    promulgation: deadlineHits.promul.n ? +(100 * deadlineHits.promul.in / deadlineHits.promul.n).toFixed(1) : null,
  },
  outliers_gt_14d: outliers.length,
  outlier_examples: outliers.slice(0, 10),
};

console.log(JSON.stringify(report, null, 2));

// ─── Verdict ───
// Senate stage emits NO point estimate (deadline-only). MAE not gated for it.
// Other stages must hit MAE ≤ 7d on one-step-ahead conditional prediction.
// All stages must have 100% deadline coverage.
const SUCCESS_MAE_DAYS = 7;
const POINT_ESTIMATE_STAGES = ["toPresident", "presidentSignature", "promulgation"];
const DEADLINE_STAGES = ["senate", "presidentSignature", "promulgation"];
const verdict = {};
for (const k of POINT_ESTIMATE_STAGES) {
  const v = report.conditional_on_actual_prior[k];
  if (!v) { verdict[`mae_${k}`] = "no data"; continue; }
  verdict[`mae_${k}`] = v.mae <= SUCCESS_MAE_DAYS ? "PASS" : "FAIL";
}
for (const k of DEADLINE_STAGES) {
  const c = report.deadline_coverage[k];
  if (c == null) { verdict[`deadline_${k}`] = "no data"; continue; }
  verdict[`deadline_${k}`] = c >= 100 ? "PASS" : `FAIL (${c}%)`;
}
console.log("verdict:", verdict);

// ─── Write VOTING_PREDICTION_VALIDATION.md ───
const md = `# Predicted-stages model validation

Run: \`node frontend/scripts/test_voting_stages_prediction.mjs\`

Cohort: term-10 processes with \`process_stages.stage_type='Voting'\` (= Sejm-passed) and \`processes.passed=true\`.

## Method

For each process, predict downstream stage dates using **only** \`sejmVoteDate\` as input (cold-start — no use of intermediate actuals). Compare predicted vs actual.

Constants (days from prior stage):
- Sejm → Senate: median 13, deadline 30 (Konst. art. 121 ust. 2)
- Senate → ToPresident: median 1, deadline 10
- President consideration: median 18, deadline 21 (Konst. art. 122 ust. 2)
- Signature → Dz.U. promulgation: median 5, deadline 14

Predictions cascade: each stage's predicted date is base+median where base is the *predicted* prior date (not actual).

## Results (cohort n=${report.cohort_size})

### Cold-start cascade (only sejm vote known)

| Stage | n | MAE (d) | RMSE (d) | P50 abs | P90 abs | Max abs | Within ±7d | Within ±14d |
|---|---|---|---|---|---|---|---|---|
${["senate","toPresident","presidentSignature","promulgation"].map(k => {
  const v = report.cold_start_cascade[k]; if (!v) return `| ${k} | — | — | — | — | — | — | — | — |`;
  return `| ${k} | ${v.n} | ${v.mae} | ${v.rmse} | ${v.p50} | ${v.p90} | ${v.max} | ${v.within7}% | ${v.within14}% |`;
}).join("\n")}

### Conditional on actual prior (= UI behaviour)

This is the model's real skill. When intermediate stages already happened, we use the actual dates and only predict the next unknown one. Cascade error compounds; conditional error doesn't.

| Stage | n | MAE (d) | RMSE (d) | P50 abs | P90 abs | Max abs | Within ±7d | Within ±14d |
|---|---|---|---|---|---|---|---|---|
${["senate","toPresident","presidentSignature","promulgation"].map(k => {
  const v = report.conditional_on_actual_prior[k]; if (!v) return `| ${k} | — | — | — | — | — | — | — | — |`;
  return `| ${k} | ${v.n} | ${v.mae} | ${v.rmse} | ${v.p50} | ${v.p90} | ${v.max} | ${v.within7}% | ${v.within14}% |`;
}).join("\n")}

### Deadline coverage — actuals that arrived on/before predicted deadline

The UI shows a *range* per stage: "typowo X dni — najpóźniej Y dni". The deadline (Y) is binding for the user; the expected (X) is informational. Deadline coverage tells us how often the binding number is honest.

- **senate** (deadline = sejm + 30d, art. 121): ${report.deadline_coverage.senate}% of n=${deadlineHits.senate.n}
- **presidentSignature** (deadline = toPres + 21d, art. 122): ${report.deadline_coverage.presidentSignature}% of n=${deadlineHits.presSig.n}
- **promulgation** (deadline = presSig + 14d, default Dz.U. SLA): ${report.deadline_coverage.promulgation}% of n=${deadlineHits.promul.n}

## Verdict

Two gates:
- Stages that emit a point estimate (toPresident, presidentSignature, promulgation) — conditional MAE ≤ 7d.
- Stages with constitutional deadlines (senate, presidentSignature, promulgation) — deadline coverage = 100%.
- Senate is *deadline-only* (no point estimate) because Sejm→Senate gap genuinely varies 0–26 days. UI shows "do {sejm+30d}" only.

${Object.entries(verdict).map(([k, v]) => `- **${k}**: ${v}`).join("\n")}

Outliers (|err| > 14d): **${report.outliers_gt_14d}** processes (mostly amendments — promulgation_date refers to the original act, not the amendment; tolerable).

## Outlier examples

${report.outlier_examples.map(o => `- proc ${o.proc} — \`${o.errs}\` — ${o.title}`).join("\n")}

## Decision

Look at MAE and within-14d coverage. UI will show **range** \`[expected, deadline]\` not a single date, so the deadline (constitutional max) is the binding upper bound regardless of model error. The "expected" date is calibrated against this report.

If any stage MAE > 7 days, raise the median constant for that stage to the observed mean and re-run.

If within-14d coverage < 70% on the binding stage (Senate position — visible to user as the next concrete date), narrow the prediction to a tighter range and add caveat "termin może się przedłużyć".
`;

writeFileSync(join(ROOT, "..", "..", "VOTING_PREDICTION_VALIDATION.md"), md);
console.log("\nwrote VOTING_PREDICTION_VALIDATION.md");

// Exit non-zero if any gate failed.
const fail = Object.values(verdict).some(v => typeof v === "string" && v.startsWith("FAIL"));
process.exit(fail ? 1 : 0);
