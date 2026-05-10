# Senate, President, TK, and Publication

## Senate Stage (art. 121, 124 Konstytucji; art. 67-73 Regulaminu Senatu)

### Timelines (from day bill is transmitted to Senate)

| Bill type | Senate deadline | If no resolution by deadline |
|---|---|---|
| Zwykla ustawa | **30 days** | Accepted in Sejm wording |
| Ustawa budzetowa | **20 days** | Accepted |
| Ustawa pilna | **14 days** | Accepted |
| Zmiana Konstytucji | **60 days** | - |

### Senate process

Marszalek Senatu refers bill to appropriate committees -> committees prepare project uchwaly (within 18 days; extendable by Marszalek Senatu) -> Senate plenary vote.

### Senate outcomes (uchwala Senatu - separate druk):
1. Accept **bez poprawek** -> goes directly to Prezydent
2. Accept **z poprawkami** (with specific, explicit amendment text)
3. **Odrzucenie ustawy w calosci** ("weto Senatu")

**Scope limit**: Senate amendments must stay within the subject matter of the bill passed by Sejm. Introducing topics not in the Sejm bill is inadmissible (TK case law - not explicit in Konstytucja but settled doctrine).

### Senate's own legislative initiative (art. 76-84 Regulaminu Senatu)

Senate projects go through **2 czytania** within Senate, then Marszalek Senatu transmits to Marszalek Sejmu as a Senacki project.

---

## Sejm Response to Senate (art. 121 ust. 3 Konstytucji)

Marszalek Sejmu refers Senate resolution to the **same committee** that worked on the bill. Committee (with senator sprawozdawca present) recommends accepting or rejecting each poprawka.

**Override threshold**: **Bezwzgledna wiekszosc** at quorum >= 230 to reject Senate's position.
- Each Senate amendment voted **separately** -> 30 Senate amendments = 30+ Sejm plenary votes
- Failure to achieve bezwzgledna wiekszosc = Senate's position is accepted

---

## President (art. 122 Konstytucji)

Marszalek Sejmu presents the passed bill to Prezydent.

### Three options

| Option | Deadline | Effect |
|---|---|---|
| **Podpisanie** + zarzadzenie ogloszenia w Dz.U. | 21 days (7 for urgent/budget) | Published in Dz.U., enters vacatio legis |
| **Wniosek do TK** (prewencyjna kontrola) | Before expiry of signing deadline | Suspends 21-day clock; see TK section below |
| **Weto** - odmowa podpisu, przekazanie do Sejmu | Within 21 days, written justification required | Returns to Sejm for override attempt |

### Veto override

Sejm needs **3/5 glosow** at quorum >= 230 to reject President's veto.

After override: Prezydent has **7 days** to sign, **cannot** refer to TK at this point.

### Bills where President has no veto right

| Bill type | Instead |
|---|---|
| **Ustawa budzetowa** (art. 224 ust. 1) | May only refer to TK (2-month TK deadline) |
| **Zmiana Konstytucji** (art. 235 ust. 7) | No veto, no TK referral |

### "Pocket veto" (weto kieszeniowe)

Applied near end of kadencja - parliament may not have time to consider it before dissolution. Effectively absolute veto via dyskontynuacja. Not a formal veto type but a real-world pattern to model.

---

## Constitutional Tribunal - TK (art. 188-197 Konstytucji)

### Kontrola prewencyjna (a priori) - before signing

Only **Prezydent** can trigger (art. 122 ust. 3).

| TK finding | President's obligation |
|---|---|
| **Compatible** | Must sign |
| **Incompatible** (fully) | Must refuse to sign |
| **Incompatible** (partially, not inseparably linked) | May sign with omission OR return to Sejm for removal (art. 122 ust. 4) |

After partial-incompatibility ruling: Prezydent consults Marszalek Sejmu's opinion, then signs (omitting incompatible provisions) or returns for Sejm to fix.

### Kontrola nasteprcza (a posteriori) - after signing

Triggered by: Prezydent, Marszalek Sejmu, Marszalek Senatu, PM, **50 poslow**, **30 senatorow**, I Prezes SN, Prezes NSA, Prokurator Generalny, Prezes NIK, RPO.

Also via: **pytania prawne** from courts during pending cases, **skargi konstytucyjne** from citizens.

Effect of ruling of incompatibility:
- Provisions lose force on date TK ruling is published in Dz.U.
- TK may defer the date (art. 190 ust. 3) - law may still be "in force" for a period after ruling

**Post-2015 caveat**: Legitimacy of some TK judges disputed due to political appointments ("sedziowie dublerzy"). TSUE and ETPC have weighed in. Relevant when analyzing prewencyjna outcomes in kadencja IX-X data.

---

## Publication and Entry into Force

### Publikatory (publication journals)

| Journal | What is published | Electronic since |
|---|---|---|
| **Dziennik Ustaw (Dz.U.)** | Konstytucja, ustawy, rozporzadzenia, ratified umowy miedzynarodowe, TK rulings | 1 Jan 2012 (dziennikustaw.gov.pl) |
| **Monitor Polski (M.P.)** | Sejm/Senate resolutions, some obwieszczenia, Regulamin Sejmu | - |

**Identification**: Dz.U. uses **rok + pozycja** - e.g. "Dz.U. 2024 poz. 1234". Never confuse with druk number.

**Model separately**: `Druk_sejmowy` (procedural, kadencja-scoped) <-> `Akt_w_Dz_U` (rok + pozycja). These are distinct entities linked via FK.

### Vacatio legis (ustawa z 20.07.2000)

| Situation | Vacatio legis |
|---|---|
| Default | **14 days** from ogloszenie |
| Law specifies longer | Any duration |
| Immediate entry ("wazny interes panstwa") | Day of ogloszenie - only if compatible with rule-of-law principle |
| Przepisy porzadkowe | 3 days |
| Tax laws (TK case law) | Min. **1 month**; for annual taxes enters force >= 1 month before new tax year |

**Day counting**: day of ogloszenie is not counted. 14-day vacatio -> enters force on the **15th day** after publication.

---

## Special Procedure: Constitutional Amendment (art. 235 Konstytucji; art. 86a-86k Regulaminu Sejmu)

| Step | Rule |
|---|---|
| Initiative | Min. **1/5 poslow** (92), Senat, or Prezydent - NOT obywatelski, NOT Rada Ministrow |
| I czytanie | Not earlier than **30 days** after filing |
| Sejm vote | **>= 2/3 glosow** at quorum >= 230 |
| Senat | **Bezwzgledna wiekszosc** at quorum >= 50 senatorow; Senat has **60 days** |
| Chapters I, II, XII | Vote no earlier than **60 days** after I czytanie |
| Referendum zatwierdzajace | On demand of 1/5 poslow, Senat, or Prezydent within 45 days of Senat vote; referendum held within 60 days |
| Prezydent | **No veto, no TK referral** (art. 235 ust. 7) |
