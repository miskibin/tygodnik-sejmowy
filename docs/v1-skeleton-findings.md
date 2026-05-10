# supagraf v1 skeleton — autonomous run findings

Date: 2026-05-04
Scope: end-to-end ingest of mps + clubs + votings from `fixtures/sejm/` into
Supabase, with full data-quality validation.

## What landed

- Pydantic schemas: `mps`, `clubs`, `votings` (with `VoteRow`, `Link`).
  Strict — `extra="forbid"` flags any new API field as a contract failure.
- Migrations:
  - `0001_core.sql` — `terms`, `clubs`, `mps`, `mp_club_membership`,
    `votings`, `votes` + `_stage_*` tables. Enums `vote_choice`, `voting_kind`,
    `majority_type`. Extensions: `pg_trgm`, `unaccent`, `fuzzystrmatch`,
    `ltree`, `vector`. Immutable wrapper `f_unaccent` because Supabase's
    `unaccent` isn't immutable by default — needed for the
    `mps.normalized_full_name` generated column + GIN index.
  - `0002_core_load_fns.sql` — pure-SQL load functions, idempotent on natural
    keys via `INSERT … ON CONFLICT DO UPDATE`.
  - `0003_membership_history.sql` — `load_mp_club_membership` extended to
    derive historical clubs from vote rows (captures party switches).
  - `0004_assert_invariants_fn.sql` — single RPC returning all integrity
    checks as a JSONB struct.
  - `0006_batched_load.sql` — `load_votes_for_sitting` + `staged_sittings`
    so each RPC fits under the anon-role 8s `statement_timeout`.
- Python:
  - `supagraf/schema/` — Pydantic models.
  - `supagraf/stage/{base,mps,clubs,votings}.py` — fixture → `_stage_*`.
  - `supagraf/load/__init__.py` — orchestrates per-step + per-sitting RPCs.
  - `supagraf/cli.py` (+ wired into `__main__`) — `stage`, `load`, `run-all`.
- Tests (1168 green excluding e2e):
  - `tests/supagraf/contract/` — every fixture file × Pydantic model
    (1135 cases).
  - `tests/supagraf/unit/` — schema edge cases + natural-key derivation.
  - `tests/supagraf/e2e/test_skeleton.py` — runs the full pipeline against
    live Supabase and asserts integrity invariants. Gated by `RUN_E2E=1`.
    Took ~46s wall, all 8 tests pass.

## Final loaded state (term 10)

| Entity                          | Rows    |
|---------------------------------|---------|
| mps                             | 498     |
| clubs (fixture-sourced)         | 11      |
| clubs (inferred from MP/votes)  | 2       |
| votings                         | 623     |
| votes                           | 286,541 |
| mp_club_membership              | 522     |
| mps with multiple memberships   | 23      |

Date range of votings: 2026-01-08 .. 2026-04-30 across 8 sittings (49–56).

## Issues found and how they were handled

### 1. Clubs referenced but missing from clubs fixtures

- `Republikanie` appears in 244 vote rows but has no club fixture.
- `Polska2050-TD` appears as `mp.club` for at least one MP, no club fixture.

This is expected — fixtures aren't a complete dump of every club that has
ever existed in term 10. Fix: `load_inferred_clubs` discovers club codes
referenced from `_stage_mps.payload->>club` ∪
`_stage_votings.payload->'votes'[*]->>'club'` and inserts stubs marked
`is_inferred = true`. Result: 0 orphan FKs, every vote/MP resolves cleanly.

### 2. MP club switches across the term (Polska2050 → Centrum, etc.)

5,263 vote rows showed `vote.club_ref ≠ mp.club_ref`. Investigation:
22 distinct MPs have switched club mid-term (the Polska2050 → Centrum
migration in particular). This is real history, not a bug.

The original `mp_club_membership` upsert only captured the *current* club
(from `mps.club_ref`). Migration `0003_membership_history.sql` extends it to
also insert distinct `(mp_id, club_id)` pairs from `votes`. Now 23 MPs
have ≥2 memberships, faithfully representing what the votes show.

### 3. 38 inactive MPs with zero votes

All 38 MPs whose `(mp_id, term)` doesn't appear in any `votes` row are
`active = false` and 38/38 carry a `waiver_desc`. Not a bug — these are
MPs who left office.

### 4. `total_voted` field excludes ABSENT, not all vote rows

The Sejm API's `totalVoted` = YES + NO + ABSTAIN + PRESENT. ABSENT is
counted separately as `notParticipating`. My initial integrity check
incorrectly compared `total_voted` against `count(*)` of vote rows;
all 623 mismatched. Once corrected, 0 mismatches.

The invariant now baked into `assert_invariants`:
- `total_voted == YES + NO + ABSTAIN + PRESENT`
- `not_participating == ABSENT`
- `total_voted + not_participating == count(votes for this voting)`

All 623 votings satisfy both invariants.

### 5. `unaccent()` isn't IMMUTABLE on Supabase

A generated column `lower(unaccent(...))` was rejected with
`generation expression is not immutable`. Workaround: created an immutable
wrapper `public.f_unaccent(text)` in `0001_core.sql`. Same approach
recommended by Supabase docs for trigram/full-text indexes.

### 6. `anon` role's 8s `statement_timeout` rejects bulk loads

`load_votes` upserts ~286k rows in one statement → ~13s on the cluster →
postgrest cancels with `57014`. Two unsuccessful attempts (request to
modify role default was correctly denied; `set local statement_timeout`
inside the function didn't help because postgrest sets its own timeout
later in the request lifecycle). Actual fix: split into per-sitting
batches. Each `load_votes_for_sitting` call processes one of the 8 sittings
(17k–60k rows) in 0.85–2.65s — comfortably under 8s.

The Python orchestrator (`supagraf/load/__init__.py`) calls each load
function as its own RPC, then iterates `staged_sittings()` to drive the
per-sitting fan-out.

## Verified invariants (assert_invariants RPC)

All zero / correct after the final load:

- `orphan_votes_no_voting = 0`
- `orphan_votes_no_mp = 0`
- `orphan_membership_no_mp = 0`
- `orphan_membership_no_club = 0`
- `votings_where_yes_no_abstain_present_neq_total_voted = 0`
- `votings_where_total_voted_plus_not_participating_neq_voting_size = 0`
- `tally_mismatches = {yes: 0, no: 0, abstain: 0, present: 0,
  not_participating: 0, total_voted: 0}` across all 623 votings

Idempotency: a second `run_core_load(10)` immediately after the first
left every count unchanged (0 row diffs).

## What's next (per plan, deferred)

- prints + processes (with ltree-keyed stage tree)
- committees + proceedings
- interpellations + written_questions
- ELI acts + references + keywords
- LLM enrichment (summary, stance, mention extraction) via Ollama
- Embeddings (pgvector + nomic-embed-text-v2-moe) on prints + acts
- OCR/PDF (pypdf primary, PaddleOCR-VL-1.5 fallback)
- Person resolver (`supagraf/resolve/person.py`) using `pg_trgm` + Levenshtein

The skeleton pattern (Pydantic schema → migration → stage → SQL load fn
→ Python orchestrator → contract/unit/e2e tests) is now in place and
copy-pasteable for each remaining resource.
