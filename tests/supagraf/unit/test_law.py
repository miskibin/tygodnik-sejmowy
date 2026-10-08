import pytest

from supagraf.law.embed import validate_vector, embedding_input, db_request
from supagraf.law.extract import html_units
from supagraf.law.ingest import metadata_hash, related
from supagraf.schema.acts import ActIn


def document(extra=""):
    return f'''<html><script>injected text</script><div id="toc">not an article</div>
    <div class="unit unit_chpt"><h2>Rozdział II — Zasady</h2><div class="unit-inner">
    <div class="unit unit_arti" id="art-1"><h3>Art. 1.</h3><div class="unit-inner">
    <div>Reguła nadrzędna:</div><div>1) pierwszy warunek;</div><div>2) drugi warunek;</div>
    <div>Wyjątek z art. 2 ust. 3 pozostaje częścią artykułu.</div>{extra}</div></div>
    <div class="unit unit_arti" id="art-2"><h3>Art. 2<sup>1</sup>.</h3><div>Dalszy przepis.</div></div>
    </div></div></html>'''.encode()


def test_preserves_parent_sentence_enumeration_exception_and_footnote():
    parsed = html_units(document('<div class="gloss-section">Ważna uwaga źródłowa.</div>'))
    assert parsed.quality == "structured"
    first = parsed.units[0]
    assert "Reguła nadrzędna:" in first["body"]
    assert "1) pierwszy warunek;" in first["body"] and "2) drugi warunek;" in first["body"]
    assert "Wyjątek z art. 2 ust. 3" in first["body"] and "Ważna uwaga" in first["body"]
    assert first["context"] == ["Rozdział II — Zasady"]
    assert "art. 2 ust. 3" in first["references"]
    assert "injected text" not in first["body"]
    assert parsed.units[1]["article_number"] == "2¹"


def test_unknown_html_structure_and_duplicate_anchors_are_not_verified():
    assert html_units(b"<p>Art. 1. Text</p>").quality == "needs_review"
    duplicate = document().replace(b'id="art-2"', b'id="art-1"')
    parsed = html_units(duplicate)
    assert parsed.quality == "needs_review" and parsed.warnings
    assert len(parsed.units) == 2 and parsed.units[0]["anchor"] != parsed.units[1]["anchor"]


def test_official_empty_heading_uses_sibling_titles_and_nested_amendments_stay_inside_parent():
    source = '''<div class="unit unit_chpt"><h3></h3><p>Rozdział 1</p><p>Przepisy ogólne</p>
    <div class="unit-inner"><div class="unit unit_arti" id="a1"><h3>Art. 1.</h3><div>Zmiana:
    <div class="unit unit_arti" id="quoted-a2"><h3>Art. 2.</h3><div>Przytoczone brzmienie.</div></div>
    </div></div></div></div>'''.encode()
    result = html_units(source)
    assert len(result.units) == 1
    assert result.units[0]["context"] == ["Rozdział 1 — Przepisy ogólne"]
    assert "Przytoczone brzmienie." in result.units[0]["body"]


def test_pdf_notice_superscripts_chapters_notes_and_annexes_are_distinct(monkeypatch):
    import pymupdf
    from types import SimpleNamespace
    from supagraf.law.extract import pdf_units

    def line(text, *, size=9.96, centered=False, spans=None):
        return {"bbox": [250 if centered else 72, 100, 345 if centered else 540, 112],
                "spans": spans or [{"text": text, "size": size, "flags": 4, "bbox": [72, 100, 540, 112]}]}

    records = [line("Art. 31. Cytat z innej ustawy."), line("Załącznik do obwieszczenia"), line("USTAWA"),
               line("DZIAŁ I", centered=True),
               {"bbox": [51, 100, 544, 112], "spans": [{"text": "Szeroki tytuł rozdziału", "size": 9.96, "flags": 20, "bbox": [51, 100, 544, 112]}]},
               line("Przepisy ogólne", centered=True), line("Art. 1. Reguła."),
               line("1) Przypis źródłowy.", size=9), line("", spans=[
                   {"text": "Art. 3", "size": 9.96, "flags": 20, "bbox": [72, 100, 98, 112]},
                   {"text": "[1]", "size": 6.48, "flags": 21, "bbox": [98, 97, 103, 109]},
                   {"text": ". § 1. Dalsza reguła.", "size": 9.96, "flags": 4, "bbox": [103, 100, 540, 112]},
               ]), line("Załącznik nr 1"), line("Formularz do zachowania.")]
    class Page:
        rect = SimpleNamespace(width=595)
        def get_text(self, *args, **kwargs):
            return {"blocks": [{"lines": records}]}
    class Document:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def __iter__(self): return iter([Page()])
    monkeypatch.setattr(pymupdf, "open", lambda **kwargs: Document())
    result = pdf_units(b"source")
    assert [u["article_number"] for u in result.units] == ["1", "3¹"]
    assert result.units[0]["context"] == ["DZIAŁ I — Szeroki tytuł rozdziału Przepisy ogólne"]
    assert "Przypis" not in result.units[0]["body"] and "Formularz" not in result.units[-1]["body"]
    assert "Cytat z innej ustawy" in result.preamble
    assert result.footnotes[0]["text"] == "1) Przypis źródłowy."
    assert "Formularz do zachowania" in result.attachments[0]["text"]
    assert result.quality == "needs_review"


def test_body_is_not_truncated_to_search_preview_length():
    body = "Pełna treść " * 3000
    assert body.strip() in html_units(document(f"<div>{body}</div>")).units[0]["body"]


def test_cached_vectors_bind_the_complete_input_including_parent_context():
    unit = {"act_title": "Akt", "context": ["Rozdział", "Definicje"], "body": "Art. 1. Treść."}
    first = embedding_input(unit)
    assert first == "Akt\nRozdział\nDefinicje\nArt. 1. Treść."
    unit["context"] = ["Wyjątki"]
    assert embedding_input(unit) != first


def test_gateway_retry_is_idempotent_and_schema_errors_are_not_hidden(monkeypatch):
    from postgrest.exceptions import APIError
    attempts = []
    monkeypatch.setattr("supagraf.law.embed.time.sleep", lambda _: None)
    def temporary():
        attempts.append(1)
        if len(attempts) == 1:
            raise APIError({"message": "upstream", "code": "502", "details": "", "hint": ""})
        return "stored"
    assert db_request(temporary) == "stored" and len(attempts) == 2
    def schema_error():
        raise APIError({"message": "unknown column", "code": "42703", "details": "", "hint": ""})
    with pytest.raises(APIError):
        db_request(schema_error)


@pytest.mark.parametrize("vec,dimension", [([1, 2], 3), ([True, 1], 2), ([float("nan")], 1), ([float("inf")], 1)])
def test_embedding_space_is_strict(vec, dimension):
    with pytest.raises(ValueError):
        validate_vector(vec, dimension)


def test_legal_dates_have_separate_meanings():
    act = ActIn.model_validate({"ELI": "DU/2026/1", "publisher": "DU", "year": 2026, "pos": 1,
        "type": "Ustawa", "title": "Test", "legalStatusDate": "2026-01-05", "entryIntoForce": "2026-04-01"})
    assert act.legal_status_date != act.entry_into_force


def test_metadata_hash_is_order_independent_and_dependency_scope_retains_future_changes():
    assert metadata_hash({"a": 1, "b": 2}) == metadata_hash({"b": 2, "a": 1})
    assert metadata_hash({"a": 1}) != metadata_hash({"a": 2})
    edges = related({"references": {"Nowelizacje po tekście jednolitym": [{"id": "DU/2026/1", "date": "2027-01-01"}],
                                    "Orzeczenie TK": [{"id": "DU/2025/1"}]}})
    assert edges == [("Nowelizacje po tekście jednolitym", "DU/2026/1")]
