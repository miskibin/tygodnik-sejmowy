# Tygodnik Sejmowy

Weekly digest of Polish parliamentary activity. Open data pipeline + Next.js
frontend that ingests Sejm + ELI (Dziennik Ustaw / Monitor Polski) sources,
enriches them with LLM/embeddings, and surfaces what actually happened in
parliament this week — votes, prints, committees, promises, statements.

Backend (`supagraf/`) runs on Supabase. Frontend (`frontend/`) is a Next.js
app under active development.

## Setup

```bash
cp .env.example .env       # fill in Supabase + LLM creds
uv sync
```

Frontend:

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

## Fixtures

```bash
# everything (term 10, year 2026), small binary samples per resource
uv run python -m supagraf fixtures all --binary-cap 5

# JSON only
uv run python -m supagraf fixtures all --no-binaries

# one resource
uv run python -m supagraf fixtures votings --limit 50
uv run python -m supagraf fixtures prints --binary-cap 3
```

Output:
- `fixtures/sejm/<resource>/<id>.json` + `_index.json`
- `fixtures/eli/<publisher>/<year>/<pos>.json` + `_index.json`
- `fixtures/disclosures/` — research stub (zeznania majątkowe)

JSON is git-tracked; PDFs / images / HTML transcripts are gitignored.

## Ingest pipeline

Stage fixtures into Supabase, then load via SQL transforms.

```bash
# stage all (clubs, mps, votings)
uv run python -m supagraf stage

# load via SQL load functions (idempotent on natural keys)
uv run python -m supagraf load

# both at once
uv run python -m supagraf run-all
```

Migrations live under `supabase/migrations/` and are applied via the
Supabase CLI or MCP `apply_migration`.

## Tests

```bash
# contract + unit (fast, no live DB)
uv run pytest tests/supagraf -q --ignore=tests/supagraf/e2e

# end-to-end (hits live Supabase project; ~45s)
RUN_E2E=1 uv run pytest tests/supagraf/e2e -q
```

See [docs/v1-skeleton-findings.md](docs/v1-skeleton-findings.md) for the
v1 skeleton run report and data-quality findings.

## Working with Claude Code

The project ships an in-repo skill at
[`.agents/skills/polski-proces-legislacyjny/`](.agents/skills/polski-proces-legislacyjny/)
covering the Polish legislative process (initiative types, three readings,
committee work, Senate stage, President decisions, Dz.U. publication, data
model). Claude Code auto-loads it when working in this repo.

To re-fetch optional Supabase/Postgres dev skills locally:

```bash
npx skills add supabase/agent-skills
```

## License

[PolyForm Noncommercial License 1.0.0](LICENSE) — source-available, free for
noncommercial, personal, research, and nonprofit use. Commercial use requires
a separate agreement.
