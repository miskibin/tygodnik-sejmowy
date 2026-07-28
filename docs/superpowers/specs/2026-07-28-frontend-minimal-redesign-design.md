# Frontend minimal redesign — design

Date: 2026-07-28
Scope: `frontend/` only. No backend, no data model, no routing changes.

## Problem

The UI is a newspaper pastiche: sepia paper background (`#f4efe4`), rust-red
accent (`#8a2a1f`), Source Serif on body copy and labels, near-black hairline
rules, decorative ornaments and drop caps, and ~234 mono/uppercase/wide-tracked
micro-labels. It reads as costume rather than product. The ask: cleaner, more
minimal, a normal color scheme.

## Decisions (settled with the user)

| Question | Decision |
| --- | --- |
| Depth | Palette swap **plus** strip newspaper chrome. Not a layout rework. |
| Palette | Zinc / white (`#ffffff` / `#09090b` / `#e4e4e7`). |
| Accent | Keep the red, sparingly — wordmark, active nav, destructive/error only. |
| Themes | Drop `.slate`. Light + dark only; `ThemeToggle` becomes a 2-step cycle. |

## Non-goals

- Layout grids, page structure, card density, spacing scale.
- Masthead information architecture (nav items, dropdown behaviour, search).
- Party brand colors (`app/sondaze/_components/partyMeta.ts`), topic colors in
  `app/atlas/_components/OCzymMowiSejm.tsx`, share-image canvases
  (`QuoteShareButton`, `ExpensesShareButton`, `CopyAsPngButton`), or
  `app/opengraph-image.tsx`. These carry meaning or render outside the theme.
- Copy, Polish wording, component APIs.

## Design

### 1. Tokens — `frontend/app/globals.css`

Rewrite `:root` and `.dark`; delete the `.slate` block.

Light:

| token | value |
| --- | --- |
| `--background`, `--card`, `--popover` | `#ffffff` |
| `--foreground`, `--card-foreground`, `--popover-foreground` | `#09090b` |
| `--primary` | `#18181b` |
| `--primary-foreground` | `#fafafa` |
| `--secondary`, `--muted`, `--accent` | `#f4f4f5` |
| `--secondary-foreground`, `--accent-foreground` | `#3f3f46` |
| `--muted-foreground` | `#71717a` |
| `--border`, `--input` | `#e4e4e7` |
| `--rule` | `#e4e4e7` |
| `--ring` | `#a1a1aa` |
| `--destructive` | `#b91c1c` |
| `--destructive-foreground` | `#ffffff` |
| `--destructive-deep` | `#7f1d1d` |
| `--highlight` | `#fef3c7` |
| `--success` / `--success-foreground` | `#15803d` / `#ffffff` |
| `--warning` / `--warning-foreground` | `#a16207` / `#ffffff` |

Dark:

| token | value |
| --- | --- |
| `--background` | `#09090b` |
| `--card`, `--popover` | `#101013` |
| `--foreground` | `#fafafa` |
| `--primary` | `#fafafa` |
| `--primary-foreground` | `#18181b` |
| `--secondary`, `--muted`, `--accent` | `#18181b` |
| `--secondary-foreground`, `--accent-foreground` | `#d4d4d8` |
| `--muted-foreground` | `#a1a1aa` |
| `--border`, `--input`, `--rule` | `#27272a` |
| `--ring` | `#52525b` |
| `--destructive` | `#ef4444` |
| `--destructive-deep` | `#b91c1c` |
| `--highlight` | `#3f3a12` |
| `--success` / `--warning` | `#4ade80` / `#facc15` |

Charts: neutral-first ramp so data viz stops shouting.
Light `--chart-1..5`: `#3f3f46`, `#71717a`, `#a1a1aa`, `#b91c1c`, `#d4d4d8`.
Dark: `#d4d4d8`, `#a1a1aa`, `#71717a`, `#ef4444`, `#52525b`.

Highest-leverage single change: `--rule` was `#1a1612` (near-black). Collapsing
it to `--border` flattens ~34 files that use `border-rule` with zero edits in
those files.

`app/layout.tsx` `viewport.themeColor` light value `#fdfcf8` → `#ffffff`.

### 2. Typography

Two-phase, so the visual result lands before the mechanical cleanup.

**Phase A (this change):** in `globals.css`'s `@theme inline`, repoint
`--font-serif: var(--font-inter)` and add `--font-display:
var(--font-source-serif)`. All 429 existing `font-serif` occurrences render as
Inter immediately; nothing else has to move. `--font-heading` also points at
Inter.

Then hand-apply `font-display` to the places serif should survive:

- `components/chrome/Masthead.tsx` wordmark.
- `components/chrome/MobileNav.tsx` wordmark, if present.
- Hero `<h1>` on the top-level pages (`app/page.tsx`, `app/tygodnik/**`,
  `app/posiedzenie/**`, `app/posel/[mpId]`, `app/proces/**`, `app/mowa/[id]`,
  `app/glosowanie/[id]`) — audited during implementation, expected ~15–20 sites.

Serif is then a headline face only, which is exactly its job.

**Phase B (follow-up commit, same session):** scripted removal of the now-inert
`font-serif` classes, and of decorative `italic` on non-quotation text (empty
states, subtitles, captions). Quotations keep their italic.

### 3. Micro-labels

234 mono/uppercase/wide-tracked labels. Apply a scripted normalization to every
class string that contains **both** `font-mono` and `tracking-[0.NNem]`:

- drop the `uppercase` token
- drop the `tracking-[0.NNem]` token
- drop `font-mono`
- normalize `text-[9px]` / `text-[9.5px]` / `text-[10px]` / `text-[10.5px]` →
  `text-[11px]`
- add `font-medium` when no weight is present

`font-mono` survives only where it was applied **without** wide tracking — dates,
counts, IDs, postcodes, tabular numerals. Those keep the mono face.

Review the full diff before committing; the script is a starting point, not the
authority.

### 4. Component chrome

| File | Change |
| --- | --- |
| `components/chrome/Ornament.tsx` | Delete. 11 call sites in `app/atlas/page.tsx`, `app/budzet/page.tsx`, `app/manifest/page.tsx`, `app/o-projekcie/page.tsx`, `app/tygodnik/_components/BriefList.tsx` removed; replace with plain vertical spacing where a separator is genuinely needed. |
| `components/chrome/DropCap.tsx` | Delete. Single call site `app/proces/[term]/[number]/_components/Summary.tsx` renders the full body through `MarkdownText`; the `LEADS_WITH_LETTER` / `canDropCap` / `firstChar` / `restBody` branch goes with it. |
| `components/tygodnik/atoms/SectionHead.tsx` | Drop the Roman numeral and serif italic. `<h2>` becomes sans semibold, `border-b-2` → `border-b`. `num` prop kept in the signature (call sites pass it) but no longer rendered — or removed if every call site can be updated cleanly. `Kicker`: sans, 11px, `font-medium`, `--muted-foreground`, no uppercase, no letter-spacing. |
| `components/statement/SectionLabel.tsx` | Red mono-uppercase `<h2>` → sans semibold `--foreground`. Icon loses `text-destructive`, becomes `text-muted-foreground`. Serif-italic subtitle → plain sans muted. |
| `components/chrome/ThemeToggle.tsx` | `CYCLE` reduced to `light ⇄ dark` (moon / sun). `ContrastIcon` import dropped. |
| `app/layout.tsx` | `themes={["light", "dark"]}`. |

### 5. Flatten

- Warm shadows `rgba(22,19,16,0.14)` / `rgba(22,19,16,0.06)` → `rgba(0,0,0,0.06)`
  / `rgba(0,0,0,0.04)`, and smaller radii. Currently in `Masthead.tsx`; grep for
  `rgba(22,19,16` to catch the rest.
- `.ts-shimmer` keyframe keeps its structure; the `color-mix` sweep picks up the
  new neutral `--background` automatically. No edit needed, verify visually.

### 6. Red budget

After this change `--destructive` may appear only in:

- Masthead wordmark (`Sejmowy`, italic).
- Active nav state.
- Genuine destructive / error / negative-vote semantics.
- `--chart-4`, as the single non-neutral series.

Every other `text-destructive` on a label, icon, bullet, or divider becomes
`text-muted-foreground` or `text-foreground`. Grep `text-destructive` across the
156 files that reference `destructive` and triage each.

## Verification

1. `pnpm lint` and `pnpm build` in `frontend/` — both clean.
2. Dev server; visually check light and dark on: `/`, `/tygodnik`,
   `/posiedzenie`, `/posel`, `/posel/[mpId]`, `/glosowanie/[id]`, `/mowa/[id]`,
   `/atlas`, `/budzet`, `/obietnice`, `/o-projekcie`.
3. Confirm no `.slate` class survives: `grep -rn '"slate"\|\.slate' frontend/`.
4. Contrast spot-check: `--muted-foreground` on `--background` must clear
   WCAG AA (`#71717a` on `#ffffff` = 4.84:1 ✓; `#a1a1aa` on `#09090b` = 7.8:1 ✓).
5. Confirm party colors, share images, and OG image are untouched:
   `git diff --stat` should not list `partyMeta.ts`, `opengraph-image.tsx`, or
   the `*ShareButton.tsx` / `CopyAsPngButton.tsx` files.

## Risks

- The scripted micro-label pass can mangle class strings that span lines or use
  template interpolation. Mitigation: script only rewrites single-line string
  literals; everything else is flagged for manual handling, and the whole diff is
  reviewed.
- Repointing `--font-serif` to Inter means `font-serif italic` becomes italic
  Inter on ~70 sites before Phase B cleans them up. Acceptable intermediate;
  Phase B lands in the same session.
- `SectionHead`'s `num` prop is load-bearing for call sites. Removing the render
  without removing the prop is the safe first move.
