# Sejmograf AI Coding Instructions

## Architecture Overview

Sejmograf is a **parliamentary data synchronization system** that fetches data from the Polish Sejm API and maintains a Neo4j knowledge graph. The system follows a **modular updater pattern** where each entity type has its own updater class.

### Core Components

1. **Updater Pattern**: All data synchronization follows `BaseUpdater` in `sejmograf/updaters/base.py`
   - Each updater has: `endpoint`, `model`, `unique_fields`, `prepare_item()`, `process_item()`
   - Example: `ClubUpdater` syncs political clubs from `/clubs` endpoint to `Club` model
   - Run order matters: `clubs → envoys → committees → prints → votings → topics → processes`

2. **Entity Matching with AI**: The `matchers/` system uses LLM + embeddings for fuzzy matching
   - `EntityMatcher` base class supports exact and similarity-based matching
   - Each matcher can create new nodes when no match found (threshold in config)
   - Usage: `match_node(tx, "some text", "person", llm)` returns node ID

3. **Pydantic + Neo4j Models**: All entities inherit from `Neo4jBaseModel`
   - `to_neo4j_properties()` handles date/enum serialization
   - `create()` method uses MERGE on `unique_fields` to avoid duplicates
   - Models in `sejmograf/models/` define node labels and field constraints

## Critical Development Workflows

### Running Updaters
```bash
# Individual updaters (most common during development)
python -m sejmograf clubs
python -m sejmograf envoys --value "specific envoy"

# Full sync (production)
python -m sejmograf all
```

### Testing Pattern
- Use pytest with mocked `session`, `llm`, and `transaction` fixtures
- Tests in `tests/updaters/` for business logic, `tests/models/` for data models
- Mock Neo4j transactions: `mock_tx.run.return_value.data.return_value = []`

### Environment Setup
- **Required**: Create `.env` with Neo4j credentials, API keys (OpenAI/Vertex AI)
- **Dependencies**: `uv sync` (uses UV package manager, not pip)
- **External tools**: Poppler + Tesseract with Polish language for PDF processing

## Project-Specific Conventions

### LLM Provider Abstraction
The system supports multiple LLM providers via `LLMClient` in `llm_analyzer.py`:
- Switch with `LLM_PROVIDER` env var ("openai" or "vertexai")
- Always use dependency injection: pass `llm` parameter to updaters/matchers
- JSON generation uses structured output: `llm.generate_json(content, system_prompt)`

### Configuration Management
- Single source: `AppCfg` in `config.py` using Pydantic Settings
- Environment override pattern: `Field(default, env="ENV_VAR")`
- API URLs auto-constructed from `TERM` variable for Sejm API versioning

### Error Handling & Transactions
- **Transaction context**: Use `_transaction_context()` in base updater for auto-rollback
- **Logging**: Loguru configured for file (`logs/`) + colored console output
- **Graceful failures**: Updaters continue on individual item failures, log and move on

## Integration Points

### External APIs
- **Sejm API**: REST endpoints at `api.sejm.gov.pl/sejm/term{TERM}/`
- **OpenAI/Vertex AI**: For text embeddings and LLM analysis
- **Neo4j**: Primary data store with Cypher queries in model methods

### Data Flow Patterns
1. **Fetch** → `httpx` calls to Sejm API endpoints
2. **Transform** → Pydantic model validation + LLM enhancement
3. **Match** → Entity resolution using embeddings similarity
4. **Store** → Neo4j MERGE operations to avoid duplicates

### Key Directories
- `sejmograf/updaters/`: Data sync logic (implement BaseUpdater)
- `sejmograf/matchers/`: Entity resolution with AI (implement EntityMatcher)  
- `sejmograf/models/`: Pydantic models with Neo4j integration
- `sejmograf/utils/`: PDF text extraction, Wikipedia integration, embeddings

When adding new entity types: create model → updater → matcher → add to `UPDATERS`/`MATCHERS` dicts in respective modules.
