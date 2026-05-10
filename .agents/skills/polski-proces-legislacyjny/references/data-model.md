# Data Model — Model Danych

## Druk Identifier Rule

**Composite primary key: `(kadencja, nr_druku)`**

Numbering resets each kadencja. "Druk nr 100, kadencja X" is entirely different from "Druk nr 100, kadencja VIII". Never store or join on `nr_druku` alone.

---

## Lifecycle States (Stany Cyklu Życia Druku)

Ordered flow through the legislative process:

```
WPLYNAL                              → registered with Marszałek, druk number assigned
SKIEROWANY_DO_KONSULTACJI            → sent to Komisja Wspólna, BAS, etc.
SKIEROWANY_DO_I_CZYTANIA             → to committee or plenary
PO_I_CZYTANIU                        → I czytanie completed
W_KOMISJI                            → committee working (sprawozdanie + opinions in progress)
PO_SPRAWOZDANIU_KOMISJI              → sprawozdanie filed
SKIEROWANY_DO_II_CZYTANIA
PO_II_CZYTANIU                       → may return to committee for dodatkowe sprawozdanie
PO_DODATKOWYM_SPRAWOZDANIU
SKIEROWANY_DO_III_CZYTANIA
UCHWALONY_PRZEZ_SEJM                 → transmitted to Marszałek Senatu
W_SENACIE                            → Senate committees + plenary working
PRZYJETY_PRZEZ_SENAT_BEZ_POPRAWEK    → goes directly to Prezydent
ZWROCONY_PRZEZ_SENAT_Z_POPRAWKAMI    → Sejm must vote on each Senate amendment
ODRZUCONY_PRZEZ_SENAT                → "weto Senatu"; Sejm votes on override
SKIEROWANY_PONOWNIE_DO_SEJMU         → after Senate decision requiring Sejm action
PRZEKAZANY_PREZYDENTOWI
W_TRYBUNALE_KONSTYTUCYJNYM           → prewencyjna review; 21-day clock suspended
ZAWETOWANY                           → President's veto; back to Sejm for override vote
PODPISANY                            → signed by President
OPUBLIKOWANY                         → published in Dz.U.
W_VACATIO_LEGIS                      → published but not yet in force
OBOWIAZUJACY                         → entered into force
```

**Terminal states** (ostateczne — no further transitions):

| State | Cause |
|---|---|
| `UCHWALONY_OPUBLIKOWANY` | Success — published and in force |
| `ODRZUCONY` | Rejection at any stage (I czytanie, committee, III czytanie, Senate override failed, President veto not overridden, TK niezgodność) |
| `WYCOFANY` | Wnioskodawca withdrew (deadline: end of II czytanie) |
| `ZWROCONY_WNIOSKODAWCY` | Formal deficiencies in uzasadnienie |
| `WYGASLY_NA_KONIEC_KADENCJI` | Dyskontynuacja |
| `ZWROCONY_DO_SEJMU_W_CELU_USUNIECIA_NIEZGODNOSCI` | Transitory — after partial TK incompatibility ruling + President decision (art. 122 ust. 4); Sejm must fix |

---

## Document Type Taxonomy (`typ_dokumentu`)

```python
# Bills and resolutions
"projekt_ustawy"           # subtypes: rządowy, poselski, senacki, prezydencki, obywatelski, komisyjny
"projekt_uchwaly_sejmu"    # 2 czytania (NOT 3) — state machine differs
"projekt_ustawy_o_zmianie_konstytucji"
"projekt_ustawy_budzetowej"
"projekt_ustawy_o_wyrazeniu_zgody_na_ratyfikacje"

# Amendments and corrections
"autopoprawka"             # filed by wnioskodawca; not voted on; applied automatically
"poprawka"                 # has: filing_entity, stage, rozstrzyga_o_innych (bool), status
"wniosek_mniejszosci"      # rejected committee amendment requested by ≥5 member-MPs

# Reports
"sprawozdanie_komisji"     # subtypes: zwykłe, dodatkowe, po_wniosku_Prezydenta, po_wniosku_Senatu
"sprawozdanie_po_wecie"    # after President's veto returned to Sejm

# Opinions and analyses
"opinia"                   # subtypes: BAS_EU, BEOS_EU, komisja_o_projekcie, samorządy,
                           #           NSZZ, EBC, opinia_prawna, ekspertyza
"OSR"                      # Ocena Skutków Regulacji (rządowy projects)
"DSR"                      # Deklarowane Skutki Regulacji (poselski, from Aug 2024)
"stanowisko_RM"            # Rada Ministrów stance on non-government projects
"tekst_ujednolicony"

# Senate and President documents
"uchwala_senatu"           # subtypes: bez_poprawek, z_poprawkami, odrzucenie
"wniosek_prezydenta_o_ponowne_rozpatrzenie"  # weto
"wniosek_prezydenta_do_TK"                  # prewencyjna kontrola
"orzeczenie_TK"
```

---

## Vote Type Taxonomy

**By place:**
- `plenarne_sejmu`
- `plenarne_senatu`
- `komisyjne_sejmowej`
- `komisyjne_podkomisji`
- `komisyjne_senackiej`

**By subject:**
- `wniosek_o_odrzucenie_w_calosci`
- `poprawka` — with FK to specific poprawka record
- `ustawa_w_calosci` — final III czytanie vote
- `poprawka_senatu` — each Senate amendment voted separately
- `odrzucenie_weta_prezydenta`
- `wniosek_formalny` — 12 subtypes per art. 184
- `sprawozdanie_komisji`
- `reasumpcja`
- `wniosek_o_wysluchanie_publiczne`

**By technique:**
- `jawne_elektroniczne`
- `imienne`
- `tajne`

**By required majority (`wymagana_wiekszosc`):**
- `zwykla`
- `bezwzgledna`
- `kwalifikowana_3_5`
- `kwalifikowana_2_3`

---

## Amendment Status Values (`status` on `Poprawka`)

```python
"zgloszona_w_komisji_przyjeta"
"zgloszona_w_komisji_odrzucona"      # may become wniosek_mniejszości
"zgloszona_w_II_czytaniu"            # triggers return to committee for dodatkowe sprawozdanie
"zgloszona_przez_Senat"
"przyjeta_w_III_czytaniu"
"odrzucona_w_III_czytaniu"
"przyjeta_jako_wniosek_mniejszosci"
```

---

## Entity Relationships (ERD Outline)

```
Druk (kadencja, nr_druku)          ← COMPOSITE PK; never join on nr_druku alone
  ├── 1:N  Etap_procesu            (stan, timestamp)
  ├── 1:N  Glosowanie              (via etap; see vote type taxonomy above)
  ├── 1:N  Druk                    self-referential: sprawozdania/autopoprawki
  │         FK: dotyczy_druku      (e.g. sprawozdanie → projekt)
  ├── N:M  Komisja                 (via skierowanie_do_komisji)
  └── N:M  Opinia                  (typ, autor_instytucja, data)

Glosowanie
  ├── 1:N  Glos_poslany            (posel_id, jak_glosowal, klub_w_momencie_glosowania)
  └── FK → Poprawka                (nullable — set when voting on specific amendment)

Posel
  └── 1:N  Wystapienie             (typ: interpelacja/zapytanie/pytanie/oswiadczenie)

Etap_procesu ←→ Posiedzenie        (Sejmu or komisji)

Druk_obywatelski
  └── 1:1  Komitet_inicjatywy_ustawodawczej
             (liczba_podpisow, data_weryfikacji_PKW, data_zebrania)

Akt_w_Dz_U                        ← separate entity from Druk_sejmowy
  (rok_dzu, pozycja_dzu)          ← Dz.U. year + position identifier
  FK → Druk_sejmowy               (nullable until published)
```

---

## Parliamentary Committee Codes

| Code | Committee name |
|---|---|
| ASW | Administracji i Spraw Wewnętrznych |
| FPB | Finansów Publicznych |
| ENM | Edukacji i Nauki i Młodzieży |
| SUE | do Spraw Unii Europejskiej |
| KOP | Odpowiedzialności Konstytucyjnej |
| KSP | do Spraw Petycji |
| KU | Ustawodawcza |
| NKK | Nadzwyczajna ds. zmian w kodyfikacjach (permanent nadzwyczajna) |

Committee types: `stala` | `nadzwyczajna` | `sledcza` | `podkomisja_stala` | `podkomisja_nadzwyczajna`

Each stała committee has a **code** (2–3 letters) used in Sejm's systems.

---

## MP Activity Types

| Type | Filing | Response | Debate |
|---|---|---|---|
| **Interpelacja** | Pisemna; zasadniczy charakter; to member of RM | Pisemna, **21 days** | Possible |
| **Zapytanie poselskie** | Pisemna; jednostkowy charakter; to member of RM | Pisemna, **21 days** | Not held |
| **Pytanie w sprawach bieżących** | Ustne; filed by 21:00 day before posiedzenie | Oral, on the floor | Yes |
| **Informacja bieżąca** | Wniosek clubu or ≥15 posłów; Prezydium selects topics | Presented by member of RM | Yes |
| **Oświadczenie poselskie** | Off-floor; cannot duplicate interpelacja/zapytanie subject | — | — |

---

## Data Quality Caveats

**1. "Rządowy jako poselski"**
Government projects filed as poselski to bypass OSR and mandatory consultations. `typ_wnioskodawcy = POSELSKI` may mask actual government authorship. Pattern documented by RPO and Fundacja Batorego. Cannot be reliably detected from druk metadata alone.

**2. Kadencja-scoped numbering**
`nr_druku` restarts at 1 with each kadencja. Always store as `(kadencja, nr_druku)`. A druk from kadencja VIII and one from kadencja X may share the same nr_druku — they are different documents.

**3. Druk ≠ Akt prawny**
`Druk_sejmowy` (procedural, Sejm-scoped, kadencja-relative) and `Akt_w_Dz_U` (rok + pozycja, permanent Dz.U. identifier) are distinct entities. Model them separately and link via FK.

**4. BAS → BEOS (2024 reorganization)**
Kancelaria Sejmu reorganized in 2024: Biuro Ekspertyz i Oceny Skutków Regulacji (BEOS) took over some BAS functions. Old opinions labeled "BAS", newer ones "BEOS". Parse `autor_opinii` carefully; the underlying competence is similar.

**5. Projekty uchwał Sejmu — 2 czytania**
Resolutions (uchwały) go through **2 czytania**, not 3. Their lifecycle state machine is shorter. Do not apply the 3-reading state machine to these documents.

**6. Monitor Polski ≠ Dziennik Ustaw**
Sejm/Senate resolutions and Regulamin Sejmu are published in Monitor Polski. Ustawy go in Dz.U. These are separate publication journals with separate identifiers.

**7. TK legitimacy post-2015**
Status of some TK judges contested after 2015 political appointments ("sędziowie dublerzy"). TSUE/ETPC has issued relevant rulings. Affects reliability of prewencyjna control data from kadencja VIII onward — flag this in analysis outputs.
