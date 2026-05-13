// Validate bill-outcome truth table against REAL term-10 production data.
//
// Issue #25: print 10/2449 rendered "ustawa odrzucona" because the only Sejm
// vote (1517) was a "wniosek o odrzucenie" that FAILED — the old predict_stages
// logic mapped that to "law rejected" when in fact the bill survives and goes
// to committee.
//
// This harness:
//   1. Fetches a representative cohort of `votings` rows by motion_polarity.
//   2. Applies the TS-mirrored truth table client-side.
//   3. Asserts each row produces the expected BillOutcome.
//
// Run: `node frontend/scripts/test_bill_outcome.mjs`
// Exits non-zero on any mismatch; CI-friendly.
//
// Production code lives in frontend/lib/voting/bill_outcome.ts — keep this
// mirror in sync (the same way frontend/scripts/test_voting_stages_prediction.mjs
// mirrors predict_stages constants).

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const envPath = join(ROOT, "..", ".env.local");
try {
  const envText = readFileSync(envPath, "utf8");
  for (const line of envText.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  // .env.local optional — env may already be exported.
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Set SUPABASE_URL + SUPABASE_(ANON|KEY) in env or frontend/.env.local");
  process.exit(2);
}

// ── TS mirror (must match frontend/lib/voting/bill_outcome.ts) ────────────────
function computeBillOutcome(polarity, motionPassed) {
  if (polarity === "pass") return motionPassed ? "passed" : "rejected";
  if (polarity === "reject") return motionPassed ? "rejected" : "continues";
  return "indeterminate";
}

function motionPassed(row) {
  // Matches frontend/lib/db/voting.ts isPassed():
  //   majority_votes is the precomputed threshold; fallback to yes>no.
  if (row.majority_votes != null) return row.yes >= row.majority_votes;
  return row.yes > row.no;
}

function expectedOutcome(row) {
  const passed = motionPassed(row);
  return computeBillOutcome(row.motion_polarity, passed);
}

// ── Curated real fixtures (mirror of tests/supagraf/unit/test_bill_outcome.py) ─
// voting_id → expected BillOutcome. These IDs were sampled 2026-05-13 from
// production. Adjust only when the underlying tally or polarity changes.
const EXPECTED = new Map([
  // reject-motion failed → bill continues (issue #25 bug case + peers)
  [1517, "continues"], [446, "continues"], [55, "continues"], [58, "continues"],
  [60, "continues"], [77, "continues"], [108, "continues"], [151, "continues"],
  [207, "continues"], [214, "continues"], [216, "continues"],
  // reject-motion passed → bill rejected
  [65, "rejected"], [147, "rejected"], [148, "rejected"], [232, "rejected"],
  [1148, "rejected"], [1513, "rejected"], [2024, "rejected"],
  // third-reading pass succeeded → bill passed
  [299, "passed"], [527, "passed"], [579, "passed"],
  [774, "passed"], [899, "passed"], [1113, "passed"],
  // third-reading pass failed → bill rejected
  [1978, "rejected"],
  // amendment / minority / procedural / null → indeterminate
  [136, "indeterminate"], [135, "indeterminate"],
  [900, "indeterminate"], [935, "indeterminate"],
  [44, "indeterminate"], [157, "indeterminate"],
  [20, "indeterminate"],
]);

async function fetchVoting(id) {
  const url = `${SUPABASE_URL}/rest/v1/votings?id=eq.${id}&select=id,topic,yes,no,majority_votes,motion_polarity`;
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(`fetch ${id} failed: ${res.status} ${await res.text()}`);
  const rows = await res.json();
  return rows[0] ?? null;
}

let failures = 0;
let checked = 0;
for (const [id, expected] of EXPECTED) {
  const row = await fetchVoting(id);
  if (!row) {
    console.error(`✗ voting ${id} missing in DB`);
    failures++;
    continue;
  }
  const actual = expectedOutcome(row);
  checked++;
  if (actual !== expected) {
    failures++;
    console.error(
      `✗ voting ${id} polarity=${row.motion_polarity} yes=${row.yes}/no=${row.no} ` +
      `maj=${row.majority_votes} → got ${actual}, expected ${expected}\n` +
      `    topic: ${row.topic}`
    );
  } else {
    console.log(`✓ voting ${id} [${row.motion_polarity ?? "null"}] → ${actual}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} / ${checked} mismatches — truth table broken.`);
  process.exit(1);
}
console.log(`\n${checked} real-case fixtures validated.`);
