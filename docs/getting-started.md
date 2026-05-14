# Getting Started

Instrukcja pierwszego uruchomienia każdego z trzech modułów: **supagraf** (ETL),
**frontend** (web) i **mobile** (Android/Expo).

---

## Wymagania

- Python 3.10+ oraz [`uv`](https://docs.astral.sh/uv/)
- Node.js 20+ oraz `pnpm` (frontend) / `npm` (mobile)
- Konto Supabase (lub self-hosted) + klucze API
- Klucz LLM: `DEEPSEEK_API_KEY` (domyślny backend) lub `GOOGLE_API_KEY` (Gemini)
- Opcjonalnie: Ollama dla embeddingów (`qwen3-embedding:0.6b`)

---

## 1. supagraf — ETL

Pythonowy pipeline pobierający dane z Sejmu / ELI, ładujący je do Supabase,
wzbogacający LLM-em oraz embeddingami, OCR-ujący skany druków.

```bash
cp .env.example .env       # uzupełnij Supabase + LLM
uv sync
```

### Fixtures (lokalne próbki danych)

```bash
# wszystko (kadencja 10, rok 2026), małe próbki binarne
uv run python -m supagraf fixtures all --binary-cap 5

# tylko JSON
uv run python -m supagraf fixtures all --no-binaries

# pojedynczy zasób
uv run python -m supagraf fixtures votings --limit 50
uv run python -m supagraf fixtures prints --binary-cap 3
```

JSON jest trzymany w gicie; PDF-y / obrazki / HTML-owe transkrypcje są w `.gitignore`.

### Ingest pipeline

```bash
uv run python -m supagraf stage      # fixtures → tabele _stage_*
uv run python -m supagraf load       # funkcje SQL load (idempotentne)
uv run python -m supagraf run-all    # stage + load
uv run python -m supagraf daily      # pełny inkrement: fetch → stage → load → enrich → embed
```

Migracje znajdują się w `supabase/migrations/`, aplikowane przez Supabase CLI
lub MCP `apply_migration`.

---

## 2. frontend — Tygodnik Sejmowy (web)

Aplikacja Next.js 16 czytająca bezpośrednio z Supabase.

> ⚠️ Uwaga: to Next.js z breaking changes w stosunku do starszych wersji.
> Przy modyfikacjach kodu zajrzyj do `frontend/node_modules/next/dist/docs/`.

```bash
cd frontend
cp .env.local.example .env.local
pnpm install
pnpm dev
```

Aplikacja wystartuje pod `http://localhost:3000`.

Trasy: `/atlas`, `/druki`, `/glosowania`, `/komisje`, `/obietnice`, `/sondaze`, `/tygodnik`.

---

## 3. mobile — aplikacja mobilna (Android / Expo)

React Native MVP: onboarding + Tygodnik (druki) + widok szczegółów druku.
Korzysta z tego samego backendu Supabase (klucz anon, tylko odczyt).

### Uruchomienie lokalne

```bash
cd mobile
npm install
# skopiuj klucz anon do .env (najpewniej tę samą wartość co frontend/.env.local)
npx expo start --android
```

Wymaga Android Studio + emulatora **lub** fizycznego urządzenia z Expo Go
w tej samej sieci.

### Build APK

```bash
npx eas-cli build --platform android --profile preview
```

Powstanie instalowalny `.apk`, który można side-loadować.

### Reset onboardingu

Ustawienia systemu → wyczyść dane aplikacji, albo wywołaj `resetOnboarding()`
z `lib/onboarding.ts`.

---

## Testy

```bash
uv run pytest tests/supagraf -q --ignore=tests/supagraf/e2e
RUN_E2E=1 uv run pytest tests/supagraf/e2e -q   # uderza w żywe Supabase
```

---

## Troubleshooting

- **`uv sync` nie znajduje libpq** — na Windowsie zainstaluj `psycopg[binary]`
  zamiast `psycopg`.
- **Frontend zwraca 401 od Supabase** — sprawdź, czy `NEXT_PUBLIC_SUPABASE_URL`
  i `NEXT_PUBLIC_SUPABASE_ANON_KEY` w `.env.local` zgadzają się z instancją.
- **Mobile: Expo nie widzi telefonu** — telefon musi być w tej samej sieci LAN
  co maszyna deweloperska.
- **OCR psuje polskie znaki** — pymupdf4llm uruchamia angielski tesseract.
  Pipeline wykrywa skany przed wywołaniem pymupdf4llm i przełącza na
  tesseract z `pol` traineddata.
