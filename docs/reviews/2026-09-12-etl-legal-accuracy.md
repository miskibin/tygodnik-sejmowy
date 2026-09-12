# ETL and factual-accuracy review — 12 September 2026

## Result

The incremental source sync, data load, enrichment and network publication completed across recovery runs. Final run **18: ok**, with no failed stages and zero paid model calls. Earlier failed runs remain in the ledger; their results were recovered rather than hidden. The full sync processed **853 previously pending speeches** across runs 15–16 and completed five print enrichments, including repaired print 3077.

Total estimated DeepSeek usage for this task: **$0.25345458 USD**, **862 calls**. No spending cap was added. The estimate uses returned token usage and the published cache/off-peak rates, including billed retries; it is not an account invoice. The default text and vision identifier is **deepseek-flash**, currently DeepSeek V4.1 Flash. [Official model and pricing](https://api-docs.deepseek.com/quick_start/pricing/).

## Findings fixed

| Severity | Finding | Change and evidence |
| --- | --- | --- |
| High | Whole-term question loading timed out and replayed expensive transactions. An uncorrelated DELETE join multiplied work. | Removed that join; added an incremental SQL loader selected by normal daily runs. A rollback-only live test preserved 30,868 untouched reply IDs and verified a changed row loads once, then zero times. Migration 20260912070506 was applied through direct psql on mixvm. |
| High | A failed HTTP checkpoint after advancing source cursors could strand staged data. | Write an atomic local checkpoint before its database copy, merge both on recovery, and clear only after successful loading. Gateway timeouts no longer replay a potentially running SQL load. |
| High | Concurrent MuPDF operations failed; a text cover could hide scanned attachment pages. | Isolated native PDF work in one process, disabled implicit English OCR, added native-text fallback, and OCR only for missing pages. Complete existing caches are reused. Print 3077 now includes its scanned second page; its names and role labels were checked visually against the original. [Source PDF](https://api.sejm.gov.pl/sejm/term10/prints/3077/3077.pdf). |
| High | Voting cards confused a failed veto override with rejection of the bill; qualified thresholds were not used consistently. | Shared the weekly feed's interpretation with detail/process cards and used recorded majority thresholds. The real 241–198 vote with a 266 threshold now says the presidential veto remains in force. |
| High | The UI invented future voting events and dates, treated resolutions as laws, and conflated signature/publication with entry into force. | Removed fictional voting placeholders and predicted event dates. Only recorded dates are displayed; unknown document types do not acquire a law timeline. Publication remains distinct from entry into force. |
| Medium | Party voting patterns were labelled proven discipline violations, including unsupported historical ordinal counts. | Removed the historical counter/query and labelled the observed comparison with the club's voting majority. It does not establish a party instruction. |
| Medium | AI quotations could be stored or shown without being verbatim. | Reject unmatched new quotes. Process-page quotes must appear in the named speaker's source passage, outside parenthetical interruptions. Document summaries are labelled AI summaries of the dated document. |
| Medium | The legislative guide misstated initiators, readings, deadlines, and presidential powers. | Corrected those passages against primary sources; distinguishes a group's representative from its signatories. Prompt v8 adds these source/role safeguards and was exercised on print 3077. |
| Medium | Existing short titles expired automatically, causing repeated model calls. | Reuse them unless explicitly forced; preserve the separate source-date filter. Short JSON title responses use a small output allowance. |
| Medium | Some billed failures were absent from accounting; temporary HTTP failures could abort publication. | Count successful HTTP responses before output validation; reject truncated output. Retry transient graph gateway errors safely, preserving the previous snapshot. Do not retry permanent poll HTTP errors. |

## Legal basis

The distinctions between initiative, passage, Senate consideration, presidential action and promulgation were checked against Constitution articles 118–123, 224 and 235. Ordinary, urgent, budget and constitutional procedures have different rules; the constitutional procedure is not assigned a deadline using the ordinary transmission rule. [Constitution published by the Senate](https://www.senat.gov.pl/o-senacie/wybrane-akty-prawne/konstytucja/), [constitutional amendments](https://www.sejm.gov.pl/prawo/konst/polski/12.htm).

The MP initiative and reading/report rules were checked against the [Rules of Procedure of the Sejm](https://www.sejm.gov.pl/prawo/regulamin/regsejm.htm). Publication and commencement are separate under articles 3–4 of the [Act on promulgation of normative acts](https://eli.gov.pl/api/acts/DU/2019/1461/text.html).

## Validation

- Python unit and contract suite: **449 passed, 11 skipped**; external-fixture checks remain conditional on fixture availability. Two existing Supabase deprecation warnings remain.
- Frontend factual regression scripts: **24 passed** (8 legislative/source-quote cases and 16 weekly-story cases).
- TypeScript and production Next.js build passed. ESLint on changed frontend code: **0 errors, 0 warnings**.
- Browser checks used real database data after hydration at desktop and 360 px widths: weekly feed, guide, three voting details and two process pages; no page errors or horizontal overflow.
- Live network publication: **499 nodes, 1,144 question edges, 3,429 voting edges**.
- Machine-readable run/cost evidence and local logs, rollback SQL, and screenshots are retained in `artifacts/etl-review-20260912/` in this checkout.

## Scope and remaining gaps

Database migration and ETL data changes are live. Application code and prompt changes are in this checkout; no frontend release or deployment was performed.

Embeddings were explicitly skipped for these runs; existing embeddings were retained. Four GUID-like print records have no document attachment and two prior failures remain in backoff. These source gaps were not filled with generated content. The historical AI corpus has not been individually audited or regenerated; this review corrects the identified logic and presentation problems and strengthens future extraction.
