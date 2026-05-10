"""Unit tests for supagraf.enrich.embed — mock httpx.post and supabase()."""
from __future__ import annotations

import json

import httpx
import pytest
from tenacity import wait_none

from supagraf.enrich import embed as embed_mod
from supagraf.enrich.embed import (
    EMBED_DIM,
    EmbedHTTPError,
    EmbedResponseError,
    _to_vec_literal,
    embed_and_store,
    embed_text,
    top_k_similar,
    upsert_embedding,
)


@pytest.fixture(autouse=True)
def no_retry_sleep(monkeypatch: pytest.MonkeyPatch) -> None:
    """Eliminate tenacity backoff so retry tests run fast."""
    monkeypatch.setattr(embed_mod._post_embed.retry, "wait", wait_none())
    monkeypatch.setattr(embed_mod.upsert_embedding.retry, "wait", wait_none())


class _FakeResponse:
    def __init__(self, status_code: int, json_body: dict | None = None, text: str = ""):
        self.status_code = status_code
        self._json = json_body
        self.text = text or (json.dumps(json_body) if json_body is not None else "")

    def json(self):
        if self._json is None:
            raise json.JSONDecodeError("no json", "", 0)
        return self._json


def _ok(vec: list[float]) -> _FakeResponse:
    return _FakeResponse(200, {"embedding": vec})


# ---------- embed_text ----------


def test_happy_path(monkeypatch):
    calls = []

    def fake_post(url, json, timeout):
        calls.append((url, json, timeout))
        return _ok([0.1] * EMBED_DIM)

    monkeypatch.setattr(embed_mod.httpx, "post", fake_post)
    vec = embed_text("hello world", model="m1")
    assert len(vec) == EMBED_DIM
    assert all(isinstance(x, float) for x in vec)
    assert len(calls) == 1
    assert calls[0][1] == {"model": "m1", "prompt": "hello world"}


def test_wrong_dim_raises(monkeypatch):
    monkeypatch.setattr(embed_mod.httpx, "post", lambda *a, **k: _ok([0.1] * 512))
    with pytest.raises(EmbedResponseError, match="expected dim 1024"):
        embed_text("x")


def test_missing_embedding_field(monkeypatch):
    monkeypatch.setattr(
        embed_mod.httpx, "post", lambda *a, **k: _FakeResponse(200, {"foo": "bar"})
    )
    with pytest.raises(EmbedResponseError, match="missing/invalid"):
        embed_text("x")


def test_non_numeric_in_array(monkeypatch):
    bad = [0.1] * (EMBED_DIM - 1) + ["x"]
    monkeypatch.setattr(
        embed_mod.httpx, "post", lambda *a, **k: _FakeResponse(200, {"embedding": bad})
    )
    with pytest.raises(EmbedResponseError, match="missing/invalid"):
        embed_text("x")


def test_5xx_retry_then_success(monkeypatch):
    n = {"i": 0}

    def fake_post(url, json, timeout):
        n["i"] += 1
        if n["i"] < 3:
            return _FakeResponse(500, text="boom")
        return _ok([0.0] * EMBED_DIM)

    monkeypatch.setattr(embed_mod.httpx, "post", fake_post)
    vec = embed_text("retry-me")
    assert len(vec) == EMBED_DIM
    assert n["i"] == 3


def test_5xx_exhausted(monkeypatch):
    monkeypatch.setattr(
        embed_mod.httpx, "post", lambda *a, **k: _FakeResponse(503, text="down")
    )
    with pytest.raises(EmbedHTTPError):
        embed_text("x")


def test_4xx_no_retry(monkeypatch):
    n = {"i": 0}

    def fake_post(url, json, timeout):
        n["i"] += 1
        return _FakeResponse(401, text="nope")

    monkeypatch.setattr(embed_mod.httpx, "post", fake_post)
    with pytest.raises(EmbedResponseError, match="401"):
        embed_text("x")
    assert n["i"] == 1


def test_timeout_retry_exhausted(monkeypatch):
    n = {"i": 0}

    def fake_post(url, json, timeout):
        n["i"] += 1
        raise httpx.TimeoutException("slow")

    monkeypatch.setattr(embed_mod.httpx, "post", fake_post)
    with pytest.raises(httpx.TimeoutException):
        embed_text("x")
    assert n["i"] == 3  # stop_after_attempt(3)


def test_timeout_then_success(monkeypatch):
    n = {"i": 0}

    def fake_post(url, json, timeout):
        n["i"] += 1
        if n["i"] == 1:
            raise httpx.TimeoutException("once")
        return _ok([0.0] * EMBED_DIM)

    monkeypatch.setattr(embed_mod.httpx, "post", fake_post)
    vec = embed_text("x")
    assert len(vec) == EMBED_DIM
    assert n["i"] == 2


# ---------- upsert_embedding ----------


class _FakeChain:
    """Mimic supabase().table(...).upsert(...).execute() chain."""

    def __init__(self, log: list):
        self.log = log

    def upsert(self, payload, on_conflict):
        self.log.append(("upsert", payload, on_conflict))
        return self

    def execute(self):
        self.log.append(("execute",))
        return self


class _FakeClient:
    def __init__(self, log: list):
        self.log = log

    def table(self, name):
        self.log.append(("table", name))
        return _FakeChain(self.log)


def test_upsert_invalid_entity_type():
    with pytest.raises(EmbedResponseError, match="unknown entity_type"):
        upsert_embedding(entity_type="foo", entity_id="x", vec=[0.0] * EMBED_DIM)


def test_upsert_wrong_dim():
    with pytest.raises(EmbedResponseError, match="expected dim 1024"):
        upsert_embedding(entity_type="print", entity_id="x", vec=[0.0] * 512)


def test_upsert_happy(monkeypatch):
    log: list = []
    monkeypatch.setattr(embed_mod, "supabase", lambda: _FakeClient(log))
    upsert_embedding(
        entity_type="print",
        entity_id="abc",
        vec=[0.5] * EMBED_DIM,
        model="m1",
    )
    assert ("table", "embeddings") in log
    upserted = [c for c in log if c[0] == "upsert"][0]
    payload = upserted[1]
    assert payload["entity_type"] == "print"
    assert payload["entity_id"] == "abc"
    assert payload["model"] == "m1"
    assert payload["vec"].startswith("[") and payload["vec"].endswith("]")
    assert upserted[2] == "entity_type,entity_id,model"


# ---------- embed_and_store ----------


def test_embed_and_store_invalid_entity_type_pre_http(monkeypatch):
    """Bad entity_type must fail BEFORE the network call."""
    n = {"i": 0}

    def fake_post(*a, **k):
        n["i"] += 1
        return _ok([0.0] * EMBED_DIM)

    monkeypatch.setattr(embed_mod.httpx, "post", fake_post)
    with pytest.raises(EmbedResponseError, match="unknown entity_type"):
        embed_and_store(text="x", entity_type="bogus", entity_id="1")
    assert n["i"] == 0


def test_embed_and_store_happy(monkeypatch):
    log: list = []
    monkeypatch.setattr(embed_mod, "supabase", lambda: _FakeClient(log))
    monkeypatch.setattr(
        embed_mod.httpx, "post", lambda *a, **k: _ok([0.123] * EMBED_DIM)
    )
    res = embed_and_store(text="hello", entity_type="act", entity_id="42", model="m")
    assert res.entity_type == "act"
    assert res.entity_id == "42"
    assert res.model == "m"
    assert len(res.vec) == EMBED_DIM
    upserted = [c for c in log if c[0] == "upsert"][0]
    assert upserted[1]["entity_type"] == "act"
    assert upserted[1]["entity_id"] == "42"


# ---------- top_k_similar ----------


def test_top_k_invalid_entity_type():
    with pytest.raises(EmbedResponseError, match="unknown entity_type"):
        top_k_similar(query_vec=[0.0] * EMBED_DIM, entity_type="foo")


def test_top_k_wrong_dim():
    with pytest.raises(EmbedResponseError, match="expected dim 1024"):
        top_k_similar(query_vec=[0.0] * 64, entity_type="print")


def test_top_k_happy(monkeypatch):
    captured = {}

    class _RpcRes:
        data = [{"entity_id": "a", "distance": 0.0}, {"entity_id": "b", "distance": 0.5}]

    class _RpcChain:
        def execute(self):
            return _RpcRes()

    class _Client:
        def rpc(self, name, params):
            captured["name"] = name
            captured["params"] = params
            return _RpcChain()

    monkeypatch.setattr(embed_mod, "supabase", lambda: _Client())
    rows = top_k_similar(
        query_vec=[0.1] * EMBED_DIM, entity_type="print", model="m1", k=5
    )
    assert len(rows) == 2
    assert captured["name"] == "embeddings_top_k"
    assert captured["params"]["p_entity_type"] == "print"
    assert captured["params"]["p_model"] == "m1"
    assert captured["params"]["p_k"] == 5
    assert captured["params"]["p_query"].startswith("[")


# ---------- _to_vec_literal ----------


def test_vec_literal_format():
    assert _to_vec_literal([0.1, 0.2, 0.3]) == "[0.100000,0.200000,0.300000]"
    assert _to_vec_literal([1.0]) == "[1.000000]"
    assert _to_vec_literal([-0.5, 0.0]) == "[-0.500000,0.000000]"


def test_vec_literal_deterministic():
    """Same input -> same output (snapshot)."""
    v = [i * 0.001 for i in range(5)]
    assert _to_vec_literal(v) == _to_vec_literal(v)
    assert _to_vec_literal(v) == "[0.000000,0.001000,0.002000,0.003000,0.004000]"
