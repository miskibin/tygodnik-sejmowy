<div align="center">

<img src="frontend/public/logo-white.png" alt="Tygodnik Sejmowy" width="160" />

# Tygodnik Sejmowy

**Cotygodniowy przegląd działalności polskiego parlamentu.**
Otwarty pipeline danych + aplikacje webowa i mobilna, które pobierają dane z Sejmu i ELI,
wzbogacają je modelami językowymi oraz embeddingami i pokazują, co naprawdę
wydarzyło się w parlamencie w tym tygodniu — głosowania, druki, komisje,
obietnice, wypowiedzi.

[![License](https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-orange.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.10%2B-blue.svg)](pyproject.toml)
[![Next.js](https://img.shields.io/badge/next.js-16-black.svg)](frontend/package.json)
[![Expo](https://img.shields.io/badge/expo-mobile-000020.svg)](mobile/package.json)
[![Supabase](https://img.shields.io/badge/supabase-postgres%20%2B%20pgvector-3ECF8E.svg)](supabase/)

### 🔗 Linki

[![Strona](https://img.shields.io/badge/🌐_Strona-tygodniksejmowy.pl-8B1A1A?style=for-the-badge)](https://tygodniksejmowy.pl)
[![Wesprzyj](https://img.shields.io/badge/❤_Wesprzyj-Patronite-FF424D?style=for-the-badge)](https://patronite.pl/tygodniksejmowy)
[![Zgłoś błąd](https://img.shields.io/badge/🐛_Zgłoś_błąd-GitHub_Issues-181717?style=for-the-badge&logo=github)](https://github.com/miskibin/tygodnik-sejmowy/issues/new)
[![X](https://img.shields.io/badge/𝕏_Obserwuj-@sejmstats-000000?style=for-the-badge)](https://x.com/sejmstats)

</div>

---

## Co znajdziesz w repo

<table>
<tr>
<td align="center" width="33%">

### 🐍 supagraf
**ETL i wzbogacanie**

Pythonowy pipeline: pobiera dane z API Sejmu i ELI, ładuje do Supabase,
wzbogaca treści za pomocą LLM (DeepSeek) oraz embeddingów (qwen3),
OCR-uje skany druków (pymupdf + tesseract `pol`).

[`supagraf/`](supagraf/)

</td>
<td align="center" width="33%">

### 🌐 frontend
**Tygodnik Sejmowy (web)**

Aplikacja Next.js 16 czytająca bezpośrednio z Supabase.
Trasy: atlas, druki, głosowania, komisje, obietnice, sondaże, tygodnik.

[`frontend/`](frontend/)

</td>
<td align="center" width="33%">

### 📱 mobile
**Aplikacja mobilna**

React Native + Expo. Onboarding, tygodniowy przegląd druków oraz
widok szczegółów druku. Korzysta z tego samego backendu Supabase
(klucz anon, tylko odczyt).

[`mobile/`](mobile/)

</td>
</tr>
</table>

## Szybki start

Instrukcje konfiguracji środowiska, kluczy i pierwszego uruchomienia
każdego modułu znajdziesz w [docs/getting-started.md](docs/getting-started.md).

## Struktura repo

- **`supagraf/`** — pipeline ETL w Pythonie (fetch → stage → load → enrich → embed).
- **`frontend/`** — webowy Next.js 16.
- **`mobile/`** — mobilne Expo / React Native.
- **`supabase/migrations/`** — sekwencyjne migracje SQL.
- **`docs/`** — dokumentacja techniczna i raporty (m.in. `getting-started.md`, `v1-skeleton-findings.md`).
- **`.agents/skills/polski-proces-legislacyjny/`** — wewnętrzna umiejętność Claude Code opisująca polski proces legislacyjny (auto-ładowana w tym repo).

## Testy

```bash
uv run pytest tests/supagraf -q --ignore=tests/supagraf/e2e
RUN_E2E=1 uv run pytest tests/supagraf/e2e -q   # uderza w żywe Supabase
```

Raport z przebiegu szkieletu v1 i znalezisk jakości danych:
[docs/v1-skeleton-findings.md](docs/v1-skeleton-findings.md).

## Praca z Claude Code

Repo zawiera wewnętrzną umiejętność w
[`.agents/skills/polski-proces-legislacyjny/`](.agents/skills/polski-proces-legislacyjny/)
opisującą typy inicjatyw, trzy czytania, prace komisji, etap senacki,
decyzje Prezydenta i publikację w Dz.U. Claude Code ładuje ją automatycznie.

Aby ponownie pobrać opcjonalne umiejętności dev-owe Supabase / Postgres:

```bash
npx skills add supabase/agent-skills
```

## Licencja

[PolyForm Noncommercial License 1.0.0](LICENSE) — kod źródłowy dostępny,
darmowy do użytku niekomercyjnego, osobistego, badawczego i non-profit.
Użycie komercyjne wymaga osobnej umowy.

Historia rozwoju sprzed wydania jako open source (340 commitów) znajduje się
w oryginalnym prywatnym repo `github.com/miskibin/sejmograf`.
