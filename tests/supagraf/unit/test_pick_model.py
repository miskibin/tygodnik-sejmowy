"""Model routing for the unified print enricher.

Routing decides cost: pro is ~5x flash per token, and a catch-up run over a
months-long backlog is where that difference actually bites.
"""
from __future__ import annotations

from supagraf.enrich.print_unified import pick_model


def test_substantive_print_routes_to_pro(monkeypatch):
    monkeypatch.delenv("SUPAGRAF_LLM_MODEL", raising=False)
    assert pick_model({"document_category": "projekt_ustawy"}) == "deepseek-v4-pro"


def test_procedural_category_routes_to_flash(monkeypatch):
    monkeypatch.delenv("SUPAGRAF_LLM_MODEL", raising=False)
    assert pick_model({"document_category": "opinia_organu"}) == "deepseek-v4-flash"


def test_meta_document_routes_to_flash(monkeypatch):
    monkeypatch.delenv("SUPAGRAF_LLM_MODEL", raising=False)
    assert pick_model({"is_meta_document": True}) == "deepseek-v4-flash"


def test_env_override_pins_every_print(monkeypatch):
    """Documented escape hatch for cost-capped runs — it has to beat the
    routing, including for prints the picker would send to pro."""
    monkeypatch.setenv("SUPAGRAF_LLM_MODEL", "deepseek-v4-flash")
    assert pick_model({"document_category": "projekt_ustawy"}) == "deepseek-v4-flash"
    assert pick_model({"document_category": "sprawozdanie_komisji"}) == "deepseek-v4-flash"
