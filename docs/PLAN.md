# Product Strategy: A Polish Parliament App That Actually Earns Its Place on a Voter's Phone

## TL;DR

- **The killer thesis is "Twój Sejm w tym tygodniu" — not another parliamentary database, but a personalised, plain-language briefing engine that answers one question for every engaged Polish citizen: "What did Sejm do this week that changes my life, and what should I do about it?"** Everything else (MP profiles, vote tables, druki, ELI graphs) exists only to power that one experience. sejm-stats.pl already shows that "raw data plus charts" gets dismissed as "bezużyteczna" (Wykop comments) once the novelty wears off; sejmofil and Sejmometr are warnings of what happens when civic tech is judged by data completeness rather than by whether anyone comes back next week.
- **Five product pillars genuinely solve unmet needs**: (1) a personal-impact "Brief" pushed weekly by email/Telegram/RSS, segmented by life situation (najemca, rodzic, przedsiębiorca, pacjent NFZ, rolnik, kierowca, emeryt, mieszkaniec okręgu X); (2) a "Twój poseł" living dossier that fuses votes + speeches + interpellations + committee work + promises + delays in answering; (3) plain-Polish ("jasnopis"-grade) LLM summaries of every druk and uchwalona ustawa, with a non-negotiable "Co się dla mnie zmienia?" section; (4) a TheyWorkForYou-style keyword alert system over the entire pgvector/pgroonga corpus ("powiadom mnie, gdy w Sejmie pada 'najem instytucjonalny'"); (5) a *promise-vs-vote ledger* that automatically pairs party programmes and "100 konkretów" with the actual votes cast — the one feature MamPrawoWiedziec.pl gestures at but has never operationalised at scale.
- **Donation sustainability requires an emotional contract, not a feature list.** Polish civic-media benchmarks (Radio 357 ~830k zł/mies., OKO.press ~132k zł/mies. from regular donors, Demagog and Stowarzyszenie 61 visibly Patronite-funded) prove Poles will pay monthly for civic infrastructure they perceive as *existentially mine*. The user's app must become "the tool I use to feel less helpless about Polish politics", positioned against a backdrop of 60% public distrust of politicians and only 7% trust (Ipsos) — the donation pitch is "patrzymy im na ręce za nas wszystkich", not "wspieraj fajny dashboard".

---

## Key Findings

### 1. What existing Polish civic tech is missing (PART A synthesis)

**sejm-stats.pl (the user's own previous project) — accurate diagnosis from public reactions.** The most upvoted Wykop reactions to the original launch were not about data depth but about *usability and meaning*: "Zróbcie listę posłów, konkretnie kto za czym głosował, ile nieobecności, interpelacji aby przed następnymi wyborami moc sprawdzić efekty ich pracy" — and the brutal "@Wolfr: myślałem, że właśnie tego dotyczy ta strona xD W obecnej postaci wg mnie jest bezużyteczna." UX critiques piled up: posłowie sortowani po imieniu, nie nazwisku; the AI assistant (chat.sejm-stats.pl) was publicly mocked by lawyers on Wykop ("Chat zmyśla orzeczenia, przekręca terminy sądowe / przedawnienia, swobodnie i od czapy interpretuje przepisy. Co ciekawe, miesza prawdę i fałsz w ten sposób, że trzeba być praktykiem żeby to wychwycić"). Even the creator self-admits "póki co nie ma tu nic oryginalnego". The lesson is unambiguous: **a Polish citizen tool that hallucinates legal advice is worse than no tool — it actively destroys trust the moment a journalist or lawyer notices.**

**MamPrawoWiedziec.pl (Stowarzyszenie 61).** Strong on candidate questionnaires, promise archives ("ponad 1 200 obietnic" stored), and contact info to MP biura. Weaknesses: campaign-cycle oriented, dependent on volunteers and on whether MPs deign to fill in surveys (Panoptykon notes "wielu z kandydatów… nie zdecydowało się na udzielenie odpowiedzi"), no live legislative feed, dated UX, no semantic/AI surfacing, no personal-impact lens. The "Krótka Piłka" model proves that *structured opinion data on MPs is high-value* but it is not connected to votes in real time.

**Sejmometr / mojepanstwo (Fundacja ePaństwo).** Pioneered the "Facebook-style activity feed" for posłowie back in 2011 but is essentially in maintenance mode — its public Google Group is dead since 2013, the GitHub repo has 1 star, and the API documentation is broken in places. A salutary reminder that *grant-funded civic tech without a paying audience decays into a museum piece*.

**Official sejm.gov.pl, ISAP, BIP.** Functional but punishing: ISAP's search "nie obsługuje odmiany wyrazów", links break ("po wyszukaniu… kliknij w link, ręcznie zmień w pasku 'prawo' na 'isap'"), no plain-language layer, no cross-referencing of MPs to votes to laws to consequences. This is the single biggest leverage point: every Pole who has ever tried to find a law has hit the ISAP wall.

**Newer entrants (jakglosuja.pl, ktoglosowal.pl, sejm.life).** Each picks one slice (votes, voting comparison, AI Q&A) but none integrates the full graph — and the "AI chat about Sejm" pattern is now commoditised; competing on it is a losing race.

**OKO.press, Demagog, money.pl licznik wyborczy.** Best-in-class *editorial* layers, not tools. They demonstrate willingness to pay for civic accountability content (Demagog's full Patronite tier system, OKO.press's ~132k zł monthly from donors) and that promise-tracking *as journalism* works — but no one has yet automated the boring parts of promise-tracking with the ETL-plus-LLM stack the user has.

**International benchmarks worth studying (and *not* copying wholesale).** TheyWorkForYou's most-cited concrete impact is its **email alerts** — ~30,000 emails/day going out to people who set keyword/MP triggers, with academic evidence (Tobias Escher; mySociety's Rebecca Rumbul) that this drives *return engagement* far better than dashboards. GovTrack's lesson is the opposite: it has 7-10M annual users on a tiny budget, but mySociety's own research found the audience skews retired, male, and already politically engaged. **The unsolved problem in global civic tech is reach beyond the already-engaged minority** — and that gap is also visible in Poland, where CBOS finds ~53% of Poles say they are disengaged from politics entirely.

### 2. What engaged Polish citizens actually want (PART B synthesis)

- **Trust deficit is the core market condition.** Ipsos Global Trustworthiness Index: only 7% of Poles trust politicians (second-lowest globally). GUS spójność społeczna: ~25% trust Sejm/Senat; 27% trust the rząd; ~50% trust local government. The product is selling *not* "be informed" but "feel less powerless".
- **Concrete legislative anxieties, ranked by search and media volume**: housing (kataster, najem instytucjonalny, "luka czynszowa", 1.5–2 mln deficyt mieszkań, 34% przeludnienie — Habitat for Humanity 2025), healthcare wait times, taxation (kwota wolna, składka zdrowotna, kasowy PIT, VAT na żywność), pracownicze prawa (jawność wynagrodzeń od grudnia 2025, urlop stażowy, Wigilia wolna), świadczenia (renta wdowia, świadczenie wspierające, 800+, czternastka), energetyka i ceny prądu, edukacja (lex Czarnek dziedzictwo, podstawa programowa), demograficzny kryzys, judicial / constitutional crisis (neosędziowie, KRS, TK).
- **The dominant high-traffic content format is "Co się zmienia od 1 stycznia / 1 czerwca / 1 lipca?"** Prawo.pl, GazetaPrawna, Infor, EY, Money.pl all run this format on every legislative threshold. It is the proven mass-market hook — and currently it is produced as listicle-journalism with weeks of lag. **An always-on, automated, personalised version is the obvious open lane.**
- **Polish "prosty język" / "jasnopisanie" is now an institutionally legitimate movement** (Pracownia Prostej Polszczyzny UWr, Fundacja Języka Polskiego UW, Jasnopis tool, ISO 24495-1:2023, gov.pl's own "10 zasad prostego języka"). LLM-generated summaries can plausibly meet a known, citable standard rather than a vague "easy version" — which matters legally and reputationally.
- **Promise-tracking demand is real and undersupplied.** Demagog runs analizy obietnic; Money.pl ran #licznikwyborczy with FOR; an indie developer's "Skrót Internetowy" tracked KO's "100 konkretów" the day the rząd Tuska was sworn in; politics.pl publishes ad-hoc score cards. Yet there is *no* tool that automatically reconciles a party's manifesto promises against the party's actual votes in the current term — even though the user's data inventory contains everything needed (vote affinity, druki, processes, attendance, club switches).
- **"Mój poseł" remains the strongest personal hook.** mObywatel surfaces your okręg; sejm.gov.pl exposes per-poseł pages; MamPrawoWiedziec.pl provides contact details — but no platform makes the leap to "this is *your* MP, here is what *they* personally did this month, and here is the one-click email/X post that holds them accountable on a specific vote you care about". TheyWorkForYou's postcode→MP→voting record→email-alerts pipeline is the proven template. Polish okręgi map cleanly enough (PKW data) that this is feasible.
- **Civic engagement tools (writing to MPs, organising, petitions) are widely demanded but bureaucratically painful.** Inicjatywa obywatelska (100k podpisów, 3 miesiące) is well-known, but the "zamrażarka / pralka / kosz sejmowy" problem is publicly documented (Instytut Spraw Obywatelskich). Citizens want to *signal* that they are watching — not to file lawsuits (Sąd Najwyższy explicitly ruled obietnice wyborcze are not enforceable contracts). This argues for low-friction expressive features (one-tap "napisz do swojego posła w tej sprawie", tracked petition support), not heavy participatory governance fantasies.
- **Polish-specific civic frustrations the app must respect:** the constitutional / KRS / neosędziowie crisis is unresolved as of May 2026 and is genuinely affecting bezpieczeństwo obrotu prawnego; migration policy is polarising; energy transition (atom, OZE, ceny prądu, Czyste Powietrze) is a daily-life issue; demographic collapse and housing affordability dominate young voters' priorities (Fundacja Batorego, More in Common Polska 2025: "Rozczarowani państwem, zadowoleni z życia"). The product *cannot* pretend to be apolitical — but it *must* be procedurally non-partisan, explicitly modelled on GovTrack's charter ("we won't take sides on policies or politicians").

---

## Details: The Opinionated Product Vision

### Core thesis (one sentence)
**Build the only Polish app that, every Friday, tells me — me, personally, by district, by life situation — exactly what the Sejm did this week that changes my life, in language a fifteen-year-old understands, with the receipts.**

Everything else is plumbing for that promise. The data inventory the user has assembled (286k votes, druki with embeddings, ELI graph, processy, transcripts, interpelacje, committee meetings) is precisely what makes this thesis feasible solo — and *nothing else* in the Polish ecosystem has that combination of breadth and ETL maturity right now. The differentiator is not the data, it is the **synthesis layer**.

### The five product pillars

**Pillar 1 — "Twój Tygodnik Sejmowy" (the killer feature).**
A personalised weekly digest delivered by email, with optional push (web push, Telegram, RSS, ICS). Generated each Friday after the week's posiedzenie closes. Three sections in fixed order:
1. *Co się zmieniło dla Ciebie* — three to seven items, max, ranked by impact on the user's declared persona/profile (najemca w Warszawie, rodzic dwójki dzieci w wieku szkolnym, jednoosobowa działalność gospodarcza, kierowca-zawodowiec, emeryt z rentą wdowią, etc.). Each item is one paragraph in jasnopis-grade plain Polish, with one-line "co możesz teraz zrobić" (e.g. "wniosek o świadczenie złóż od 1 stycznia 2026 w ZUS").
2. *Twój poseł w tym tygodniu* — the user's okręg-mapped MP's votes, attendance, key speeches, any committee work; flagged if they broke party discipline (the "klubowa kohezja" metric is in the inventory).
3. *Watchlista* — anything the user explicitly subscribed to (keyword, druk number, process, committee).

This is the experience the entire app is organised around. Open rate, not DAU, is the north-star metric.

**Pillar 2 — "Twój poseł" living dossier.**
Postcode/okręg search → single MP page that fuses: profile, club history (with switch dates — the "club switches over time" already in ETL), all votes with party-discipline flag, attendance, all interpelacje + minister response delays (slowest-minister rankings already aggregated), committee work + workload, statements with full-text search, embedding-based "similar speeches in Sejm", and *promise reconciliation* (see Pillar 5). One-click "napisz do tego posła w sprawie głosowania nr X" with a draft generated by the LLM, editable, sent through user's own email client (no platform middleman — keeps trust and avoids spam-platform liability). This is functionally the Polish TheyWorkForYou — but with the AI summarisation layer no UK equivalent has.

**Pillar 3 — "Co to znaczy" plain-Polish layer on every druk, ustawa, and ELI act.**
The user already has druki with LLM-generated summaries, stance/sentiment, and resolved person mentions. Productise that as a **three-level reading layer** on every legal artefact:
- *Po polsku, prosto* — a 4–6 sentence summary, jasnopis class 1–3, citing the ISO 24495-1:2023 standard the app commits to.
- *Dla kogo* — auto-extracted target groups (najemcy, lekarze, rolnicy, kierowcy zawodowi…) with semantic-search-backed evidence.
- *Pełny tekst z linkami* — the original PDF/HTML, with hover-explanations on legal jargon (a small custom glossary, not a chat — chat fails badly on legal language).

The "stance / sentiment with confidence" field must NOT be exposed as a partisan label; expose it only internally as a sorting heuristic. (This is one of the core ways sejm-stats.pl gets criticised — it implies opinion where none should exist.)

**Pillar 4 — Alerts as the engagement engine (TheyWorkForYou-grade).**
Subscribe to: a phrase (with quotes for exact match), a poseł, a klub, a komisja, a process, a druk, an okręg, an ELI act lifecycle (so the user is told the moment a law they care about is amended or repealed). Push channels: email (default), RSS, Telegram bot, web push, ICS calendar feed for upcoming first readings on subscribed processes. **This single feature is the most empirically validated retention driver in parliamentary monitoring civic tech worldwide** (mySociety reports ~30k alert emails/day from TheyWorkForYou alone) and nothing in Polish civic tech ships it well.

**Pillar 5 — "Obietnica vs głosowanie" automated ledger.**
At launch, manually seed a 200–400 promise corpus from the 2023 manifestos, the 100 konkretów, Polska 2050's 12 gwarancji, koalicyjna umowa, and post-election ministerial declarations (sources are public, Demagog and Money.pl have already done some of the curation — get explicit permission or build a complementary index that links out to them rather than competing). Use embedding similarity (1024-dim nomic-embed-text-v2-moe is already in the inventory) to **auto-suggest** which votes, druki, and processes are candidates for fulfilment/breach of each promise — but require human (initially the developer; later trusted volunteers via a clear workflow) confirmation before publication. Status flags: zrealizowane / w toku / złamane / sprzeczne głosowanie / brak działań. This is the moral spine of the product. It is also the single feature most likely to get the project written about in OKO.press, Demagog, Polityka, and TVN24 — earned media is the indie developer's only realistic acquisition channel.

### The non-negotiable AI/LLM-powered features (only these, nothing else)

The user's instinct should be aggressive about *not* shipping a generic "Asystent RP" chatbot, because the Polish public has already learned (loudly, on Wykop) that legal-advice chatbots confabulate. Instead, ship **constrained, pipeline-style** AI:

1. **Plain-Polish summaries of druki, ustawy, and ELI acts**, generated offline, version-stamped (model + prompt hash exposed in UI for reproducibility), with mandatory citation back to specific paragraphs of the source. Run two passes: factual extraction (constrained, lower temperature) and rewrite into ISO 24495 plain Polish (higher fluency). Store both. Display the plain version as default, the source paragraph on hover/click.
2. **Personal-impact classifier.** For each druk/ustawa, an LLM classifies which of ~25 predefined life-situation tags it affects (najemca, właściciel mieszkania, rodzic ucznia, pacjent NFZ, kierowca zawodowy, rolnik, JDG, etc.). This drives Pillar 1 personalisation. Crucially: this is a *retrieval* problem dressed as classification, not a generation problem — far less hallucination risk.
3. **Promise-to-vote candidate matcher** (Pillar 5).
4. **Semantic search across the entire corpus** — the embeddings already exist; just ship the UI. "Pokaż mi wszystkie głosowania dotyczące najmu instytucjonalnego od 2023" should work in one query.
5. **"Wyjaśnij to głosowanie" expander** on any vote: takes the druk title + party stances + counts and produces a 3-sentence neutral summary of what was actually being voted on (not who was right). Same constrained pipeline, same versioned model stamp.
6. **Speaker-attributed transcript navigation** — given a poseł and a date, jump to their spoken contributions; given a topic, show all speeches across all posłowie ranked by relevance. This unlocks the parliamentary-video archive that currently nobody surfaces well.

Conspicuously **NOT** building: a free-form legal-advice chat. Polish citizens deserve better than a hallucinating GPT wrapper for legal questions, and the reputational cost of one viral screenshot of the bot inventing case law would be larger than any engagement gain.

### UX / IA principles (the mental model the app exposes)

The mental model is **"Sejm jako serwis informacyjny o moim życiu"**, not "Sejm jako baza danych dla badaczy". Concretely:

- **Default landing screen is *not* a dashboard.** It is either (a) the user's most recent personalised Brief, or (b) for a first-time visitor, a single field: "Wpisz kod pocztowy, żeby zobaczyć, co Sejm robi w Twojej sprawie."
- **Three primary navigation entry points only**: *Twój tygodnik*, *Twój poseł*, *Szukaj w prawie*. Posłowie / Kluby / Druki / Ustawy / Komisje are reachable but tucked behind these doors. Resist the temptation to expose the relational graph as the primary IA — that is a researcher's mental model.
- **Every page answers "co to dla mnie znaczy" before "jakie są dane".** Plain-Polish summary on top, data tables collapsed below.
- **Time-based, not entity-based.** The "wątek ustawy" view (full lifecycle tree from first reading to ELI act) should be the default deep-dive view of any process, presented as a *Twitter-style timeline*, not as a tree. Citizens think in stories, not in graphs.
- **Anonymous by default, account optional.** Alerts can be set without login (just confirm email — TheyWorkForYou pattern). This dramatically lowers friction and protects privacy in a country where political surveillance fears are real (Panoptykon's audience).
- **Polish first, English second.** Niche but: scholars and EU institutions are a meaningful secondary audience; an English toggle on every page using the same LLM pipeline costs little.
- **No gamification.** No badges, no "civic score", no leaderboards of users. The product's seriousness is its product.
- **Performance is a feature.** Pages must load on a 4G connection in a podkarpacka village in under 2s. SSR + pgroonga + careful caching. ISAP's loading times are part of why ISAP is hated.

### What to explicitly NOT build (anti-features)

These are the traps every previous Polish parliamentary tool has fallen into:

- **No "ranking najaktywniejszych posłów"** as a headline feature. The Times of London demonstrated in 2006 that activity-rankings on TheyWorkForYou perversely incentivise MPs to file low-quality questions to game the metric. Sejm-stats.pl has flirted with this and it generates noise, not insight.
- **No partisan "sentiment" or "stance" badges on MPs or parties.** Compute them internally to power similarity; never show a coloured arrow next to a polityk. The moment users perceive bias, the donation pitch dies.
- **No native commenting / forum / "społeczność".** This is where civic tech becomes a comments-section hellscape. Discussion belongs on X, Mastodon, Wykop, Reddit — link out, don't host.
- **No legal-advice chatbot.** Already covered. The reputational asymmetry is fatal.
- **No party programme generator, no "jaką partię powinieneś poprzeć" Latarnik-style quiz.** That space is owned by MamPrawoWiedziec/Latarnik; competing on it dilutes the focus.
- **No NFTs, no blockchain, no AI agent autonomously emailing posłowie.** All three have been pitched in the Polish civic-tech space; all three poison credibility.
- **No paywall, ever, on the core experience.** Donation-based means donation-based.
- **Don't try to scrape live video transcription if the official feeds give you HLS + transcripts.** The inventory says "transcription flags" exist; rely on those, ship them, don't build an own ASR pipeline that will eat 70% of the developer's time.
- **Don't compete with ISAP on completeness.** The app should *index* ISAP/ELI links and offer a vastly better UI on top — but never claim to be a primary legal source. Be the front-end people *prefer*; let ISAP own the canonical text.
- **No mobile app at launch.** A great PWA + email + Telegram covers ≥95% of mobile use cases for a solo dev. Native iOS/Android is a tarpit.

### Donation model (how Patronite-style sustainability actually works for this in Poland)

The Polish data on civic-media donor revenue is encouraging but shows a clear pattern: **what gets funded is media that audiences perceive as "ours" against a hostile institutional backdrop.** Radio 357 raised 831k zł/month from ~45k patrons in May 2022. OKO.press takes ~132k zł/month. Demagog has tiered Patronite ("Patron Faktów", "Obserwator Narracji"). Bracia Sekielscy — 40.7k zł/month from 1.6k patrons. Religious and animal-welfare causes also rank high (Langusta na palmie, Dolnośląski Inspektorat Ochrony Zwierząt). The pattern: **regular-monthly Patronite donors give to causes that produce public-interest information their other media will not.**

The user should design accordingly:

1. **Brand the project around accountability, not data.** Working name proposal: *"Sejm dla Obywatela"* or *"Twój Sejm"*. (Sejmofil and Sejm-stats are already taken — and the user's previous brands carry baggage from the "data-dumpy" reputation. A new brand is a clean reset.)
2. **Three Patronite tiers, no more.** *Obserwator/Obserwatorka* (10–15 zł): personalised Brief, alerts, full app — i.e., the same product, but you sponsor. *Strażnik/Strażniczka demokracji* (30–40 zł): early-access to weekly long-form analysis, monthly "co Sejm zrobił, czego prawie nikt nie zauważył" deep dive, ability to suggest investigation topics. *Mecenas/Mecenaska* (100+ zł): named in transparency report, quarterly Zoom Q&A. **Crucially: no tier removes features for non-payers.** This is the Wikipedia / OKO.press / Radio 357 pattern, and it is the only one that doesn't poison the public-interest brand.
3. **Run a transparent monthly cost dashboard** ("ile kosztuje serwer w tym miesiącu, ile patroni wpłacili, ile brakuje do kolejnego celu") on the homepage. Patronite users overwhelmingly cite transparency as the trust-builder.
4. **Pursue 1,5% OPP status as soon as legally feasible** (Stowarzyszenie 61 / Demagog model). 1,5% revenue is a March/April spike that, in civic-tech-Polska, can equal 6–8 months of regular Patronite income.
5. **Earned-media engine over paid acquisition.** Plant stories with OKO.press, Polityka, TVN24 Magazyn, Wyborcza, Demagog, Konkret24. The "obietnica vs głosowanie" ledger is news-bait. The "Twój Sejm w tym tygodniu" newsletter is something journalists themselves will subscribe to and quote — TheyWorkForYou is now routinely cited in UK Parliament itself, and every quote is a free user-acquisition event.
6. **Avoid grant addiction.** NIW PROO grants and EU funds are tempting, but the discontinuity literature on civic tech (ACM Interactions 2024, mySociety, MIT GOV/LAB "Don't Build It") is brutal: research-grant-funded civic tech disappears at end-of-grant. Patronite + 1,5% are the only durable Polish models.
7. **Pricing reality check.** A solo developer's realistic ceiling at 3 years is probably 4–8k zł/mies. from Patronite if the product *and* the communication are excellent — enough to cover infra, an occasional contractor, and a partial salary. That requires roughly 400–1,000 paying patrons. The lever to get there is *not* features; it is **a recurring weekly product moment** (the Brief) that gives patrons something to share, screenshot, and praise on X.

### Differentiation from sejm-stats and sejmofil specifically

**vs. sejm-stats.pl**: the user is competing with their own past project, which is the trickiest position. Be ruthless about the difference. *Sejm-stats was a database with charts; this is a service that talks to me on Friday and tells me what changed for me.* The new app should not have a "statystyki" tab on the homepage navigation; it should not lead with charts; it should not have a free-form chat. If the user keeps both projects alive, position sejm-stats as the *researcher's API and bulk-data layer* (complete, public, dry) and the new app as the *citizen's interface* (personal, weekly, plain Polish). Different brands, possibly shared backend, complementary positioning. Public commitment to "no AI legal-advice chat" should be made explicitly to dispel association with the chat.sejm-stats.pl reputation.

**vs. sejmofil**: sejmofil's positioning is unclear in public discourse — appears to be "pretty UI" leaning. Differentiate on three axes: (1) personalisation (the Brief, the okręg-mapping), (2) plain-Polish standardisation (jasnopis / ISO 24495 commitment), (3) accountability ledger (promise-vs-vote). Visually, resist the temptation to be "ładne" — civic tech that looks like a fintech onboarding screen reads as untrustworthy to the engaged-citizen audience. The aesthetic to aim for is *quiet, legible, slightly typographic, public-broadcaster-ish* — closer to a Polish-language version of GOV.UK than to Sejmofil-style consumer polish.

**vs. MamPrawoWiedziec.pl**: don't compete; partner. Their questionnaires + your live legislative + your AI summaries is a 1+1=3. Even if no formal partnership materialises, link out generously — citizens benefit, and Stowarzyszenie 61 has institutional credibility your solo project initially won't.

### What success looks like in 12 / 24 / 36 months

- **Month 12**: 5,000 weekly Brief subscribers, 200 paying patrons (~2,500 zł/mies.), at least one OKO.press / Polityka / Demagog citation, a working alert system, the obietnica ledger covering ≥300 promises with ≥40% auto-matched to actual votes.
- **Month 24**: 25,000 weekly subscribers, 600 patrons, OPP status, journalists routinely quoting the app, 1,5% campaign yields ≥30k zł.
- **Month 36**: position as the default "where do I check what Sejm did this week?" reference for engaged Poles; first hire (part-time editor for the obietnica ledger).

If by Month 12 the weekly Brief open rate is below ~35% and Patronite is below ~80 paying patrons, the thesis is wrong and the product needs to pivot — not add features. *That* is the discipline most Polish civic-tech projects have lacked.

---

## Caveats and Honest Limits of This Research

- **Estimates of donor revenue are point-in-time** (Press.pl's 2022 Patronite ranking; Radio 357's 2022 figures; OKO.press's ~132k figure cited in older NGO.pl reporting). The Polish donation market in 2026 may be more crowded; numbers should be treated as orders of magnitude, not promises.
- **CBOS's "53% disengaged from politics" figure** comes from Tygodnik Powszechny's reporting around the 2023 cycle and may not perfectly match the current term-10 environment, especially after the 2025 presidential election. The disengagement direction is robust; the exact number is not load-bearing for the strategy.
- **Wykop / Reddit / forum sentiment about sejm-stats.pl reflects a vocal subset of users** (mostly tech-literate men), not the general engaged-citizen audience the app should target. The "useless dashboard" critique is nonetheless directionally consistent with the global civic-tech literature on dashboards (MIT GOV/LAB's "Don't Build It"), so the product implication holds.
- **The promise-vs-vote ledger is operationally the hardest pillar** because manifesto-promise text is fuzzy and votes are formal. The recommendation to seed manually and *suggest* algorithmically (not auto-publish) is deliberate — fully automated promise-tracking would invite Demagog-style fact-check disputes that a solo dev cannot win.
- **Constitutional/judicial crisis content is a partisan minefield.** The recommendation is procedural neutrality, not topical avoidance — track every relevant uchwała, druk, and ELI act, summarise them in plain Polish, and let users draw conclusions. A perception of partisan slant in either direction would collapse the donation economics.
- **The "no native mobile app" recommendation is a solo-developer constraint, not a product preference.** If donation revenue funds a second contributor in Year 2, a native app rises in priority — but not before email + PWA hits product-market fit.
- **"Mój poseł by postcode"** depends on PKW okręg boundaries data being available cleanly, which it largely is, but post-election re-districting (PKW has flagged that 11 okręgi need fewer mandaty, 9 more, 1 +2) may cause edge cases that need manual curation. Plan for it; don't be surprised by it.
- **The app's biggest existential risk is not technical** — it is that a major news organisation (Onet, WP, Gazeta Wyborcza) clones the personal-impact Brief format with their newsroom muscle. The defensive moat is the ETL inventory, the pgvector embeddings, the LLM pipelines, and — most importantly — the *trust* built up among patrons. Move fast on the Brief; that is the feature most likely to be copied.
- **None of this guarantees success.** Polish civic tech's graveyard is large (Sejmometr, ePaństwo's mojepanstwo, the abandoned "Aplikacja Parlament", multiple grant-funded NGO projects). The only durable pattern in Polish civic media is *weekly habit + emotional contract with a paying audience + niche it owns*. Build for that pattern from day one or accept that the project will join the graveyard within 24 months of launch.