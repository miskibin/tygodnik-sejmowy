"""Model routing for the unified print enricher.

Default routing is "single": every print goes to the vision-capable flash
model (same price as flash, only model that can read scans). The legacy
pro/flash split survives behind SUPAGRAF_LLM_ROUTING=pro_flash.
"""
from __future__ import annotations

import pytest

from supagraf.enrich import LLM_MODELS
from supagraf.enrich.print_unified import pick_model, trim_body


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    monkeypatch.delenv("SUPAGRAF_LLM_MODEL", raising=False)
    monkeypatch.delenv("SUPAGRAF_LLM_ROUTING", raising=False)


def test_default_routing_is_single_vision_model():
    assert pick_model({"document_category": "projekt_ustawy"}) == "deepseek-v4-flash-vision-exp"
    assert pick_model({"document_category": "opinia_organu"}) == LLM_MODELS["vision"]
    assert pick_model({"is_meta_document": True}) == LLM_MODELS["vision"]


def test_legacy_pro_flash_routing_behind_env(monkeypatch):
    monkeypatch.setenv("SUPAGRAF_LLM_ROUTING", "pro_flash")
    assert pick_model({"document_category": "projekt_ustawy"}) == "deepseek-v4-pro"
    assert pick_model({"document_category": "opinia_organu"}) == "deepseek-v4-flash"
    assert pick_model({"is_meta_document": True}) == "deepseek-v4-flash"


def test_env_override_pins_every_print(monkeypatch):
    """Documented escape hatch for cost-capped runs — it has to beat the
    routing, including for prints the picker would send to pro."""
    monkeypatch.setenv("SUPAGRAF_LLM_MODEL", "deepseek-v4-flash")
    assert pick_model({"document_category": "projekt_ustawy"}) == "deepseek-v4-flash"
    monkeypatch.setenv("SUPAGRAF_LLM_ROUTING", "pro_flash")
    assert pick_model({"document_category": "sprawozdanie_komisji"}) == "deepseek-v4-flash"


def test_over_long_mention_is_truncated_not_rejected():
    """A 200+ char committee name used to fail PrintUnifiedOutput validation,
    discarding the whole print's enrichment over one mention."""
    from supagraf.enrich.print_unified import UnifiedMention

    m = UnifiedMention(raw_text="Komisji Śledczej " * 20, mention_type="committee")
    assert len(m.raw_text) == 200


def test_trim_body_keeps_head_and_tail_within_budget():
    text = "A" * 5000 + "B" * 5000
    out = trim_body(text, 1000)
    assert len(out) <= 1000
    assert out.startswith("A")
    assert out.endswith("B")
    assert "pominięto" in out
    assert trim_body("short", 1000) == "short"
    assert trim_body("x", 0) == ""


def test_unknown_topic_tag_is_dropped_not_rejected():
    """v4-flash with thinking off occasionally invents a tag ("konsument");
    one off-list label must not discard the whole print's enrichment."""
    from supagraf.enrich.print_unified import PrintUnifiedOutput

    fn = PrintUnifiedOutput._drop_unknown_topic_tags
    assert fn(["zdrowie", "konsument", "transport"]) == ["zdrowie", "transport"]
    assert fn("not-a-list") == "not-a-list"


def test_unknown_persona_tag_is_dropped_not_rejected():
    from supagraf.enrich.print_unified import PrintUnifiedOutput

    fn = PrintUnifiedOutput._drop_unknown_persona_tags
    assert fn(["rolnik", "zdrowie"]) == ["rolnik"]
