---
name: polski-proces-legislacyjny
description: "Complete reference for the Polish legislative process (proces legislacyjny). Use whenever working with Polish parliamentary documents, sejmograf data, Sejm/Senate proceedings, druki sejmowe, glosowania, komisje, or any task requiring knowledge of how a Polish bill becomes law. Covers initiative types, three readings, committee work, Senate stage, President decisions, Constitutional Tribunal, publication in Dz.U., and data-model entities (Druk lifecycle states, vote types, document taxonomies). Load this skill before modeling, querying, or analyzing any Polish legislative data."
---

# Polski Proces Legislacyjny

## Process at a glance

```
Inicjatywa -> Druk sejmowy (nadanie numeru) -> I czytanie -> komisja
  -> sprawozdanie -> II czytanie -> [komisja - dodatkowe sprawozdanie]
  -> III czytanie (glosowanie) -> Senat (30/20/14/60 dni)
  -> [powrot do Sejmu po poprawkach/wecie Senatu]
  -> Prezydent (21/7 dni): podpis / weto / TK
  -> publikacja w Dz.U. -> vacatio legis (domyslnie 14 dni) -> OBOWIAZUJACA
```

**Terminal states:** `UCHWALONY_OPUBLIKOWANY` | `ODRZUCONY` | `WYCOFANY` | `ZWROCONY_WNIOSKODAWCY` | `WYGASLY_NA_KONIEC_KADENCJI`

---

## Critical numbers

| Actor | Deadline | Notes |
|---|---|---|
| I czytanie | min. **7 days** from doreczenie druku | |
| II czytanie | min. **7 days** from doreczenie sprawozdania | |
| Senat - zwykla ustawa | **30 days** | No resolution = accepted in Sejm wording |
| Senat - budzet | **20 days** | |
| Senat - pilna | **14 days** | |
| Senat - zmiana Konstytucji | **60 days** | |
| Prezydent - zwykla | **21 days** | |
| Prezydent - pilna / budzet | **7 days** | |
| TK - budzet | **2 months** from Prezydent's motion | |
| Vacatio legis | **14 days** default; min. **1 month** for tax laws | |
| Quorum Sejmu | **230 poslow** (half of 460) | |

| Majority | Rule | When used |
|---|---|---|
| Zwykla | za > przeciw (wstrzymujacy nie licza sie) | Standard bill passage |
| Bezwzgledna | za > (przeciw + wstrzymujacy) | Reject Senate amendments / Senate veto |
| Kwalifikowana **3/5** | 3/5 of votes cast at quorum | Reject President's veto |
| Kwalifikowana **2/3** | 2/3 of votes cast at quorum | Constitutional amendment in Sejm; ratyfikacja art. 90 |

---

## Initiative types (art. 118 Konstytucji)

| Type | Entity | Threshold | Exclusions |
|---|---|---|---|
| **Rzadowy** | Rada Ministrow | uchwala RM | Only RM can file budget (art. 221) |
| **Poselski** | Poslowie / komisja | min. **15 signatures**; komisja without threshold | Cannot initiate zmiana Konstytucji |
| **Senacki** | Senat (as chamber) | Senate majority resolution | - |
| **Prezydencki** | Prezydent RP | prerogative; no countersignature | - |
| **Obywatelski** | Komitet inicjatywy | **100,000** signatures within 3 months | Not for budget, not for zmiana Konstytucji |

**Tryb pilny** (art. 123): only Rada Ministrow can designate. Excluded subjects: tax, electoral law, public authority structure/jurisdiction, kodeksy.

**Zmiana Konstytucji** (art. 235): only min. 1/5 poslow (92), Senat, or Prezydent. NOT obywatelski, NOT Rada Ministrow.

---

## Druk sejmowy

`Druk` = parliamentary document with its own sequential number within a kadencja.
**Composite primary key: (kadencja, nr_druku)** - numbering resets each kadencja.

Documents that each get their own druk number:
- projekt ustawy / uchwaly
- sprawozdanie komisji (zwykle and dodatkowe)
- autopoprawka wnioskodawcy
- uchwala Senatu (re: the bill)
- sprawozdanie z rozpatrzenia uchwaly Senatu
- wniosek Prezydenta o ponowne rozpatrzenie (weto)
- sprawozdanie z rozpatrzenia weta

**Marszalek Sejmu** controls flow: nadaje bieg projektowi, may return it for formal deficiencies, or after Komisja Ustawodawcza opinion (3/5 majority finding legal inadmissibility - art. 34 ust. 8).

---

## When to read which reference

| Need | Reference file |
|---|---|
| Pre-submission requirements, czytania, committee work, wnioski mniejszosci, II/III czytanie voting order, dyskontynuacja | `references/stages-and-readings.md` |
| Senate timelines, Senate outcomes, Sejm override of Senate, President options, veto override, TK, Dz.U. publication, vacatio legis, constitutional amendment procedure | `references/senate-and-president.md` |
| Quorum rules, majority types, voting methods (imienne/tajne), reasumpcja, formal motions (art. 184 - all 12), committee voting subjects, special procedures (pilny/budzet/kodeksy/UE/ratyfikacja), vote count estimates | `references/voting-mechanics.md` |
| Lifecycle states (full ordered list), document type taxonomy, vote type taxonomy, amendment statuses, entity relationships (ERD), committee codes, MP activity types, data quality caveats | `references/data-model.md` |
