---
name: playwright-frontend-screenshot
description: "Use when the user asks to run the Tygodnik Sejmowy frontend and capture a screenshot via Playwright (e.g. \"odpal apkę i wyślij mi screen z tygodnika\", \"zrób screenshot z /tygodnik\", \"spawnuj Next.js i daj mi PNG\"). Covers: bringing up `frontend/` Next dev server against the prod self-hosted Supabase, installing Playwright + chromium in a sandboxed dir, and shooting full-page or viewport PNGs that the agent can render back inline."
metadata:
  author: claude-code
  version: "0.1.0"
---

# Playwright frontend screenshot

End-to-end recipe for an agent on this repo to: (1) start the Next.js frontend
locally, (2) install Playwright once, (3) capture a PNG of any route, and
(4) display it inline. Tested against `/tygodnik`.

## Prereqs in this environment

- `node` 22 + `pnpm` 10 are on PATH (`/opt/node22/bin`).
- Supabase keys are in the shell env: `SUPABASE_URL`, `SUPABASE_KEY`,
  `SUPABASE_PUBLISHABLE_KEY` (anon). They point at `https://db.msulawiak.pl`
  (self-hosted prod). Do NOT swap these for managed-Supabase URLs.
- The frontend reads `frontend/.env.local`, NOT the parent shell. You must
  write that file.

## Step 1 — write `frontend/.env.local`

`frontend/lib/supabase.ts` requires `SUPABASE_URL` plus
`SUPABASE_ANON_KEY` (or `SUPABASE_KEY`). Use the publishable/anon key — never
the service-role key in a browser-reachable build.

```bash
cat > frontend/.env.local <<EOF
SUPABASE_URL=$SUPABASE_URL
SUPABASE_KEY=$SUPABASE_PUBLISHABLE_KEY
SUPABASE_ANON_KEY=$SUPABASE_PUBLISHABLE_KEY
EOF
```

If `$SUPABASE_PUBLISHABLE_KEY` isn't set, fall back to `$SUPABASE_KEY` only
after confirming it's the anon JWT (decoded `role` claim must be `anon`,
not `service_role`).

## Step 2 — install + start dev server

```bash
cd frontend && pnpm install --prefer-offline
PORT=3000 pnpm dev > /tmp/next-dev.log 2>&1 &
```

Run this with Bash `run_in_background: true`. The harness will report it
as "completed" almost immediately because pnpm forks Next and detaches —
that does NOT mean the server died. Verify with:

```bash
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/tygodnik
```

Cold render of `/tygodnik` is ~10 s (PostgREST round-trips against
`db.msulawiak.pl`). Don't bail on the first slow request.

## Step 3 — install Playwright once

The frontend uses pnpm workspaces (`frontend/pnpm-workspace.yaml`); adding
playwright there with `-w` fails ("--workspace-root may only be used inside
a workspace"). Install in a throwaway dir instead:

```bash
mkdir -p /tmp/pw && cd /tmp/pw
npm init -y >/dev/null
npm install --no-audit --no-fund playwright
npx playwright install chromium   # ~290 MB, one-time
```

Browsers land in `/opt/pw-browsers/` (preconfigured `PLAYWRIGHT_BROWSERS_PATH`).

## Step 4 — shoot the screenshot

`/tmp/pw/shoot.js`:

```js
const { chromium } = require('playwright');
(async () => {
  const url = process.argv[2] || 'http://localhost:3000/tygodnik';
  const out = process.argv[3] || '/tmp/shot.png';
  const fullPage = process.argv[4] !== 'viewport';
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') console.error('PAGE ERR:', m.text()); });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: out, fullPage });
  console.log('saved', out);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
```

Run:

```bash
node /tmp/pw/shoot.js http://localhost:3000/tygodnik /tmp/tygodnik.png
node /tmp/pw/shoot.js http://localhost:3000/tygodnik /tmp/tygodnik-top.png viewport
```

Then `Read` the PNG path — Claude Code renders it inline so the user sees
the screenshot in chat.

## Gotchas seen in the wild

- **`waitUntil: 'networkidle'`** is required for Tygodnik. The page issues
  parallel PostgREST fetches; `'load'` returns before data lands and you get
  a half-empty layout.
- **Cert warning** in console (`ERR_CERT_AUTHORITY_INVALID` for some asset)
  is harmless — it's an avatar/CDN cert chain, page renders fine.
- **Full-page on `/tygodnik`** produces a ~10 000 px tall PNG (~1 MB). Fine
  to Read, but for a quick "does it render" check prefer the viewport crop.
- **Don't `cd frontend`** in repeated Bash calls expecting persistence;
  cwd resets. Use absolute paths or chain with `&&`.
- **`pnpm dev` background "exit 0"** notification is cosmetic; the actual
  Next server keeps running. Confirm with `ps aux | grep next-server` or
  the `curl` check above.
- **Never put the service-role JWT into `.env.local`**. It would be bundled
  into client chunks and exfiltrate full DB write access.

## Other useful routes to screenshot

- `/tygodnik` — index of latest sitting
- `/tygodnik/p/<sittingNum>` — historical sitting brief
- `/proces/<term>/<number>` — single legislative process page
- `/posel/<id>` — MP profile
- `/glosowanie/<id>` — single vote
