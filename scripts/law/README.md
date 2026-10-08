# Odbiór wyszukiwania prawa

`evals/law/review-template.jsonl` zawiera 16 propozycji formatu, bez odpowiedzi i etykiet. Nie jest zbiorem odbiorowym. Recenzent przygotowuje 100–200 niezależnych pytań, co najmniej 30 w zamrożonej części `holdout`, oraz zapisuje dokładne identyfikatory jednostek z oceną trafności 0–3, dopuszczalne wersje, decyzję o możliwości odpowiedzi, swoje oznaczenie i źródła kontroli. Przepisy przejściowe, definicje i wyjątki ocenia osobno. Po akceptacji ustawia `review_status=human_accepted`; agent nie nadaje tego statusu swoim propozycjom.

```powershell
uv run python scripts/law/evaluate.py accepted.jsonl --base-url http://127.0.0.1:3077 --split dev --output dev-qwen.json
```

Runner odrzuca niepełny lub niezaakceptowany zbiór przed pierwszym zapytaniem. Raport wiąże wyniki z SHA-256 zbioru; mierzy ranking 10 kandydatów, odmowy, identyfikatory wersji, obecność źródeł i opóźnienie. Nie ocenia samodzielnie poprawności porady ani kompletności podstawy prawnej. Części odbiorowej nie używać do strojenia. Warianty uruchamiać na tym samym zamrożonym zbiorze i zapisać identyfikator indeksu, hash modelu, konfigurację oraz zasoby hosta obok raportu.

## Opcjonalny reranker CPU

Worker ma odrębne zależności w metadanych skryptu; nie zmienia środowiska ETL. Nie używa GPU. Oficjalny model: [Qwen3-Reranker-0.6B](https://huggingface.co/Qwen/Qwen3-Reranker-0.6B). Rewizja sprawdzona 8 października 2026: `e61197ed45024b0ed8a2d74b80b4d909f1255473`.

```powershell
uv run scripts/law/reranker.py --revision e61197ed45024b0ed8a2d74b80b4d909f1255473
```

`GET /health` podaje model i rewizję; `POST /rerank` przyjmuje `{query, documents}` i zwraca `{scores, model, revision, score_kind}`. Maksymalnie 50 całych fragmentów, 8192 tokeny na parę, jeden aktywny przebieg. Przekroczenie budżetu odrzuca całą parę, bez urywania tekstu. Wynik jest różnicą logitów trafności, nie prawdopodobieństwem poprawności porady. Frontend korzysta z `LAW_RERANK_URL=http://...:9121/rerank` i przy awarii lub przekroczeniu czasu zachowuje wyszukiwanie bez rerankera z jawnym komunikatem. Nie włączać go do odbioru produkcyjnego bez pomiaru na zaakceptowanym zbiorze.

Qwen i Gemma wymagają odrębnych indeksów i encoderów zapytań. W bazie może być tylko jeden indeks domyślny; przełączenie następuje po odbiorze. `law_search` pozwala porównać wskazany indeks bez zmiany domyślnego, sprawdzając jego wymiar. Bieżąca Ollama na mixvm odrzuciła instalację `embeddinggemma-2:270m` z wymaganiem nowszej wersji. Nie aktualizowano wspólnego serwisu; porównanie Gemmy pozostaje do wykonania w zgodnym runtime.
