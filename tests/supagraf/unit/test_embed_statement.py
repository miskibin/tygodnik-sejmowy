"""Unit tests for supagraf.enrich.embed_statement."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

import supagraf.enrich.embed_statement as mod


class _SelectRes:
    def __init__(self, data):
        self.data = data


class _FakeStmtSelect:
    """Mimics supabase().table("proceeding_statements").select(...).eq(...).single().execute()."""

    def __init__(self, data):
        self._data = data
        self.calls = []

    def select(self, *a, **k):
        self.calls.append(("select", a, k))
        return self

    def eq(self, *a, **k):
        self.calls.append(("eq", a, k))
        return self

    def single(self):
        self.calls.append(("single",))
        return self

    def execute(self):
        return _SelectRes(self._data)

    def update(self, payload):
        self.calls.append(("update", payload))
        return self


class _FakeClient:
    def __init__(self, stmt_table: _FakeStmtSelect):
        self.stmt_table = stmt_table
        self.tables: list[str] = []

    def table(self, name):
        self.tables.append(name)
        return self.stmt_table


@pytest.fixture(autouse=True)
def stub_audit(monkeypatch):
    """Replace @with_model_run by an identity decorator so tests stay focused
    on the body of embed_statement, not the audit ceremony."""
    # Strip the decorator: the underlying function is still the wrapped target.
    # Easiest path: re-import the symbol from the source object.
    # Instead, monkeypatch _insert_run + _finish_run + _record_failure on the
    # audit module so the real wrapper runs but does nothing externally.
    from supagraf.enrich import audit
    monkeypatch.setattr(audit, "_insert_run", lambda *a, **k: 1)
    monkeypatch.setattr(audit, "_finish_run", lambda *a, **k: None)
    monkeypatch.setattr(audit, "_record_failure", lambda *a, **k: None)


def test_embed_statement_happy(monkeypatch):
    # Include vocative + substantive content; strip_speech_boilerplate removes
    # the salutation but the topic survives. The test asserts the substantive
    # text is what gets embedded, not the boilerplate.
    fake = _FakeStmtSelect(
        {"id": 7, "body_text": "Panie Marszałku! Wysoka Izbo! Apeluję o zmianę ustawy o kredytach hipotecznych."}
    )
    fake_cli = _FakeClient(fake)
    monkeypatch.setattr(mod, "supabase", lambda: fake_cli)

    fake_result = MagicMock()
    fake_result.vec = [0.0] * mod.EMBED_DIM
    captured: dict = {}

    def fake_embed_and_store(*, text, entity_type, entity_id, model):
        captured["text"] = text
        captured["entity_type"] = entity_type
        captured["entity_id"] = entity_id
        captured["model"] = model
        return fake_result

    monkeypatch.setattr(mod, "embed_and_store", fake_embed_and_store)

    res = mod.embed_statement(
        entity_type="proceeding_statement",
        entity_id="7",
    )
    assert res is fake_result
    assert "Apeluję o zmianę ustawy o kredytach hipotecznych" in captured["text"]
    assert "Panie Marszałku" not in captured["text"]
    assert "Wysoka Izbo" not in captured["text"]
    assert captured["entity_type"] == "proceeding_statement"
    assert captured["entity_id"] == "7"
    # Provenance update must have been issued.
    update_calls = [c for c in fake.calls if c[0] == "update"]
    assert len(update_calls) == 1
    payload = update_calls[0][1]
    assert payload["embedding_model"] == mod.DEFAULT_EMBED_MODEL
    assert "embedded_at" in payload


def test_embed_statement_empty_body_raises(monkeypatch):
    fake = _FakeStmtSelect({"id": 1, "body_text": "   "})
    fake_cli = _FakeClient(fake)
    monkeypatch.setattr(mod, "supabase", lambda: fake_cli)
    monkeypatch.setattr(mod, "embed_and_store", lambda **k: pytest.fail("should not embed"))

    with pytest.raises(ValueError, match="empty body_text"):
        mod.embed_statement(entity_type="proceeding_statement", entity_id="1")


def test_embed_statement_truncates_to_max_chars(monkeypatch):
    big = "ABC " * (mod.MAX_INPUT_CHARS // 4 + 1000)
    fake = _FakeStmtSelect({"id": 9, "body_text": big})
    fake_cli = _FakeClient(fake)
    monkeypatch.setattr(mod, "supabase", lambda: fake_cli)

    fake_result = MagicMock()
    fake_result.vec = [0.0] * mod.EMBED_DIM
    captured: dict = {}

    def fake_embed_and_store(*, text, entity_type, entity_id, model):
        captured["text"] = text
        return fake_result

    monkeypatch.setattr(mod, "embed_and_store", fake_embed_and_store)
    mod.embed_statement(entity_type="proceeding_statement", entity_id="9")
    assert len(captured["text"]) == mod.MAX_INPUT_CHARS
