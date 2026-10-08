import json
import multiprocessing
from concurrent.futures import ProcessPoolExecutor
from types import SimpleNamespace

import pymupdf
import pytest

from supagraf.law.extract import Extraction, pdf_units
from supagraf.law.fulltext import (
    consolidated_targets, existing_documents, load_catalog, preserve_html, preserve_pdf, statutory_catalog,
    initialize_worker,
)


def act(position):
    return {"ELI": f"DU/2026/{position}", "type": "Ustawa", "title": f"Ustawa {position}"}


def test_catalog_exhausts_pages_and_includes_repealed_and_future_statutes():
    records = [act(i) for i in range(610)]
    records[0]["inForce"] = "NOT_IN_FORCE"
    records[-1]["entryIntoForce"] = "2027-01-01"
    paths = []
    def get(path):
        paths.append(path)
        offset = 500 if "offset=500" in path else 0
        return json.dumps({"items": records[offset:offset + 500], "totalCount": 610}).encode()
    result = statutory_catalog(SimpleNamespace(get=get))
    assert result["total"] == len(result["acts"]) == 610
    assert len(paths) == 2 and "inForce" not in paths[0]
    assert result["acts"]["DU/2026/0"]["inForce"] == "NOT_IN_FORCE"


@pytest.mark.parametrize("second", [
    {"items": [], "totalCount": 501},
    {"items": [act(0)], "totalCount": 501},
    {"items": [act(500)], "totalCount": 502},
])
def test_incomplete_duplicate_or_changing_catalog_never_passes(second):
    pages = iter([{"items": [act(i) for i in range(500)], "totalCount": 501}, second])
    with pytest.raises(ValueError):
        statutory_catalog(SimpleNamespace(get=lambda _: json.dumps(next(pages)).encode()))


def test_resume_validates_frozen_manifest_hash(tmp_path):
    (tmp_path / "catalog.json").write_text(json.dumps({"total": 1, "acts": {"DU/2026/1": act(1)},
                                                     "metadata_sha256": "wrong"}))
    with pytest.raises(ValueError, match="corrupt"):
        load_catalog(tmp_path)


def test_full_html_keeps_preamble_and_signature_without_pretending_article_structure():
    raw = b"<html><script>Untrusted script</script><p>Preamble of historical act.</p><p>Complete legal text.</p><p>Signature of authority.</p></html>"
    result = preserve_html(raw, Extraction())
    assert "Preamble" in result.document_text and "Signature" in result.units[0]["body"]
    assert "Untrusted" not in result.document_text
    assert result.quality == "needs_review" and result.units[0]["article_number"] is None


def test_complete_pdf_retains_text_outside_parsed_articles():
    pdf = pymupdf.open()
    page = pdf.new_page()
    page.insert_text((72, 100), "USTAWA\nPreamble and date of act.\nArt. 1. Complete rule.\nSignature of authority.")
    raw = pdf.tobytes()
    pdf.close()
    result = preserve_pdf(raw, pdf_units(raw), ocr=False)
    assert "Preamble and date" in result.document_text
    assert "Signature of authority" in result.document_text
    assert result.units and "Complete rule" in result.units[0]["body"]


def test_scanned_annex_is_a_gap_until_ocr_is_enabled(monkeypatch):
    class Page:
        def get_text(self, *args, **kwargs): return ""
        def get_images(self): return ["scan"]
    class Document:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def __iter__(self): return iter([Page()])
    monkeypatch.setattr(pymupdf, "open", lambda **kwargs: Document())
    with pytest.raises(ValueError, match="requires OCR"):
        preserve_pdf(b"scan", Extraction(), ocr=False)


def test_resume_reads_beyond_the_postgrest_response_limit_and_binds_metadata():
    rows = [{"root_eli_id": f"DU/2026/{i}", "document_eli_id": f"DU/2026/{i}", "metadata": act(i)} for i in range(1250)]
    class Query:
        def table(self, *args): return self
        def select(self, *args): return self
        def eq(self, *args): return self
        def order(self, *args): return self
        def range(self, start, end): self.bounds = start, end; return self
        def execute(self): return SimpleNamespace(data=rows[self.bounds[0]:self.bounds[1] + 1])
    found = existing_documents(Query())
    assert len(found) == 1250 and ("DU/2026/1249", "DU/2026/1249") in found
    from supagraf.law.ingest import metadata_hash
    assert found[("DU/2026/1", "DU/2026/1")] == metadata_hash(act(1))


def test_latest_consolidation_is_numeric_and_distinct_from_amendments():
    document = {"references": {"Inf. o tekście jednolitym": [{"id": "DU/2025/999"}, {"id": "DU/2025/1000"}],
                               "Akty zmieniające": [{"id": "DU/2026/2000"}]}}
    assert consolidated_targets(document) == ["DU/2025/1000", "DU/2025/999"]


def _worker_state():
    import os
    from supagraf.law import fulltext
    with fulltext.OCR_LOCK:
        result = fulltext.preserve_html(b"<p>Complete independent statutory source text.</p>", Extraction())
        return os.getpid(), fulltext._EXISTING_DOCUMENTS, result.document_text


def test_spawned_parser_preserves_resume_snapshot_and_shared_ocr_lock():
    import os
    context = multiprocessing.get_context("spawn")
    existing = {("DU/2026/1", "DU/2026/1"): "immutable-metadata-hash"}
    with ProcessPoolExecutor(max_workers=2, mp_context=context, initializer=initialize_worker,
                             initargs=(existing, context.Lock())) as pool:
        results = [future.result(timeout=30) for future in [pool.submit(_worker_state) for _ in range(4)]]
    assert all(pid != os.getpid() and snapshot == existing and "statutory source text" in text
               for pid, snapshot, text in results)
