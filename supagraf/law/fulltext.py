"""Complete statutory catalog and resumable source-text import, without currency claims."""
from __future__ import annotations

import json
import os
import multiprocessing
import threading
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode

from bs4 import BeautifulSoup
from loguru import logger

from supagraf.db import supabase
from supagraf.law.embed import db_request
from supagraf.law.extract import PARSER_VERSION, Extraction, sha256
from supagraf.law.ingest import Eli, SEEDS, capture, metadata_hash, related, store_metadata
from supagraf.sync.runlog import RunLedger

FULLTEXT_PARSER = PARSER_VERSION + "+fulltext-v1"
OCR_LOCK = threading.Lock()
_EXISTING_DOCUMENTS: dict[tuple[str, str], str] = {}


def initialize_worker(existing: dict, ocr_lock) -> None:
    """Spawned workers own HTTP clients; transfer the resume snapshot once per process."""
    global _EXISTING_DOCUMENTS, OCR_LOCK
    _EXISTING_DOCUMENTS = existing
    OCR_LOCK = ocr_lock


def import_worker(act: dict, *, output: Path, ocr: bool) -> dict:
    return import_statute(act, output=output, existing=_EXISTING_DOCUMENTS, ocr=ocr)


def write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)


def page_unit(text: str, index: int, *, ocr: bool = False) -> dict:
    return {"anchor": f"source-page-{index}", "label": f"Strona {index}", "article_number": None,
            "ordinal": index - 1, "context": ["Odczyt OCR" if ocr else "Tekst dokumentu źródłowego"],
            "body": text, "body_sha256": sha256(text), "references": []}


def preserve_html(raw: bytes, extraction: Extraction) -> Extraction:
    soup = BeautifulSoup(raw, "lxml")
    for element in soup.select("script, style, #toc, #show-all"):
        element.decompose()
    text = soup.get_text("\n", strip=True)
    if len(text) < 30:
        raise ValueError("Official HTML contains no usable full text")
    extraction.document_text = text
    if not extraction.units:
        extraction.units = [page_unit(text, 1)]
        extraction.method = "html_text"
        extraction.quality = "needs_review"
        extraction.warnings.append("Full HTML preserved; editorial article structure not recognized")
    return extraction


def preserve_pdf(raw: bytes, extraction: Extraction, *, ocr: bool) -> Extraction:
    import pymupdf
    from supagraf.law.source_reviews import VISUALLY_INSPECTED_BLANK_PAGES

    pages, scanned = [], []
    blank_pages = VISUALLY_INSPECTED_BLANK_PAGES.get(sha256(raw), frozenset())
    with pymupdf.open(stream=raw, filetype="pdf") as document:
        for index, page in enumerate(document, 1):
            if index in blank_pages:
                pages.append("")
                continue
            text = page.get_text("text", sort=True).strip()
            # Empty pages with images can hold historical scans or annexes.
            if len(text) < 30 and page.get_images():
                if not ocr:
                    raise ValueError(f"Scanned source page {index} requires OCR")
                import pytesseract
                from PIL import Image
                with OCR_LOCK:
                    image = page.get_pixmap(dpi=200)
                    text = pytesseract.image_to_string(
                        Image.frombytes("RGB", [image.width, image.height], image.samples), lang="pol",
                        config="--psm 3", timeout=180,
                    ).strip()
                scanned.append(index)
                if len(text) < 30:
                    raise ValueError(f"OCR could not recover full source page {index}")
            pages.append(text)
    if len("".join(pages)) < 30:
        raise ValueError("Official PDF contains no usable full text")
    extraction.document_text = "\n\n".join(f"[Strona {i}]\n{text}" for i, text in enumerate(pages, 1))
    if blank_pages:
        extraction.warnings.append(f"Visually inspected blank source pages: {sorted(blank_pages)}; bound to SHA256 {sha256(raw)}")
    if scanned or not extraction.units:
        # Do not combine partial machine-recognized articles with missing OCR pages.
        extraction.units = [page_unit(text, i, ocr=i in scanned) for i, text in enumerate(pages, 1) if text]
        extraction.method = "pdf_ocr" if scanned else "pdf_full_text"
        extraction.quality = "needs_review"
        extraction.warnings.append(f"Full source pages preserved; article boundaries unverified; OCR pages: {scanned}")
    return extraction


def statutory_catalog(api: Eli) -> dict:
    """Search listings return full metadata; validate an exhaustive, frozen manifest."""
    acts, total, offset = {}, None, 0
    while True:
        query = urlencode({"type": "Ustawa", "limit": 500, "offset": offset})
        page = json.loads(api.get("/acts/search?" + query))
        if total is None:
            total = page["totalCount"]
        if page["totalCount"] != total:
            raise ValueError("ELI statutory catalog changed during pagination; repeat snapshot")
        items = page["items"]
        if not items and offset < total:
            raise ValueError("ELI returned a premature empty statutory catalog page")
        for item in items:
            if item.get("type") != "Ustawa" or not item.get("ELI"):
                raise ValueError("ELI search returned an unexpected statutory catalog item")
            if item["ELI"] in acts:
                raise ValueError("Duplicate ELI across catalog pages; repeat snapshot")
            acts[item["ELI"]] = item
        offset += len(items)
        if offset >= total:
            break
    if len(acts) != total:
        raise ValueError("Incomplete statutory catalog")
    return {"captured_at": datetime.now(timezone.utc).isoformat(), "type": "Ustawa", "total": total,
            "metadata_sha256": metadata_hash(acts), "acts": acts}


def load_catalog(output: Path, *, refresh: bool = False) -> dict:
    path = output / "catalog.json"
    if path.exists() and not refresh:
        catalog = json.loads(path.read_text(encoding="utf-8"))
        if catalog["total"] != len(catalog["acts"]) or metadata_hash(catalog["acts"]) != catalog["metadata_sha256"]:
            raise ValueError("Catalog checkpoint is corrupt")
        return catalog
    api = Eli(output)
    try:
        catalog = statutory_catalog(api)
        write_json(path, catalog)
        return catalog
    finally:
        api.session.close()


def existing_documents(sb) -> dict[tuple[str, str], str]:
    found, offset = {}, 0
    while True:
        rows = db_request(lambda: sb.table("law_versions").select("root_eli_id,document_eli_id,metadata")
                          .eq("parser_version", FULLTEXT_PARSER).order("id").range(offset, offset + 499).execute()).data or []
        found.update({(row["root_eli_id"], row["document_eli_id"]): metadata_hash(row["metadata"]) for row in rows})
        if len(rows) < 500:
            return found
        offset += len(rows)


def consolidated_targets(act: dict) -> list[str]:
    candidates = {eli for category, eli in related(act)
                  if category.casefold().startswith("inf. o tek") or category == "Akt jednolity"}
    return sorted(candidates, key=lambda eli: tuple(int(n) for n in eli.split("/")[1:]), reverse=True)


def import_statute(act: dict, *, output: Path, existing: dict, ocr: bool) -> dict:
    sb, api = supabase(), Eli(output)
    root = act["ELI"]
    errors, versions, documents = [], [], {root: act}
    try:
        targets = consolidated_targets(act)
        if targets:
            latest = targets[0]
            try:
                documents[latest] = api.act(latest)
                db_request(lambda: store_metadata(sb, [documents[latest]]))
            except Exception as error:
                errors.append({"document_eli_id": latest, "error": str(error)[:400]})
        edges = related(act)
        unresolved = [{"eli_id": eli, "category": category, "reason": "applicability_not_verified"}
                      for category, eli in edges]
        dependency_hash = metadata_hash({"references": act.get("references", {}),
                                         "documents": {eli: metadata_hash(a) for eli, a in documents.items()}})
        coverage = {"catalog": "all_eli_statutes", "direct_dependencies": len(set(eli for _, eli in edges)),
                    "transitive_dependencies_verified": False, "dependency_sha256": dependency_hash,
                    "missing": [], "full_text_documents": [], "text_errors": errors}
        db_request(lambda: sb.table("law_roots").upsert({"eli_id": root, "family": SEEDS.get(root, "Ustawy"),
                   "metadata_sha256": metadata_hash(act), "checked_at": datetime.now(timezone.utc).isoformat(),
                   "coverage": coverage, "last_error": None}).execute())
        if edges:
            db_request(lambda: sb.table("law_dependencies").upsert([
                {"root_eli_id": root, "dependency_eli_id": eli, "category": category,
                 "metadata_sha256": metadata_hash(documents[eli]) if eli in documents else None}
                for category, eli in set(edges)]).execute())
        for eli, document in documents.items():
            if existing.get((root, eli)) == metadata_hash(document):
                versions.append({"document_eli_id": eli, "resumed": True})
                continue
            try:
                versions.append(db_request(lambda: capture(api, sb, root, document, dependency_hash, unresolved,
                                                          full_text=True, ocr=ocr)))
            except Exception as error:
                errors.append({"document_eli_id": eli, "error": str(error)[:400]})
        coverage["full_text_documents"] = [v["document_eli_id"] for v in versions]
        db_request(lambda: sb.table("law_roots").update({"coverage": coverage,
                   "last_error": json.dumps(errors, ensure_ascii=False)[:1000] if errors else None}).eq("eli_id", root).execute())
        return {"eli_id": root, "versions": versions, "errors": errors}
    finally:
        api.session.close()


def import_all_statutes(*, output: Path, workers: int = 3, ocr: bool = True, refresh_catalog: bool = False,
                        limit: int = 0) -> dict:
    if not 1 <= workers <= 6 or limit < 0:
        raise ValueError("Invalid full text import bounds")
    os.environ.setdefault("OMP_THREAD_LIMIT", "1")
    sb = supabase()
    ledger = RunLedger(kind="law_fulltext", term=10, args={"workers": workers, "ocr": ocr, "limit": limit})
    ledger.start()
    counts = {"catalog_total": 0, "selected": 0, "processed": 0, "complete": 0, "failed": 0, "articles": 0,
              "resumed_documents": 0, "errors": [], "legal_currency": "unverified", "embeddings": "not_run"}
    try:
        with ledger.step("statutory_catalog", fatal=True) as step:
            catalog = load_catalog(output, refresh=refresh_catalog)
            counts["catalog_total"] = catalog["total"]
            acts = sorted(catalog["acts"].values(), key=lambda a: (a["year"], a["pos"]), reverse=True)
            if limit:
                acts = acts[:limit]
            counts["selected"] = len(acts)
            db_request(lambda: store_metadata(sb, acts))
            step.counts = {"catalog_total": catalog["total"], "selected": len(acts), "sha256": catalog["metadata_sha256"]}
        with ledger.step("full_text_documents", fatal=True) as step:
            existing = existing_documents(sb)
            # Parsing historical HTML is CPU-bound. Spawn avoids sharing a live
            # Supabase client across processes and also works on Windows.
            context = multiprocessing.get_context("spawn")
            with (output / "results.jsonl").open("a", encoding="utf-8") as receipt, ProcessPoolExecutor(
                max_workers=workers, mp_context=context, initializer=initialize_worker,
                initargs=(existing, context.Lock()),
            ) as pool:
                futures = {pool.submit(import_worker, act, output=output, ocr=ocr): act["ELI"] for act in acts}
                for future in as_completed(futures):
                    root = futures[future]
                    try:
                        result = future.result()
                    except Exception as error:
                        result = {"eli_id": root, "versions": [], "errors": [{"error": str(error)[:400]}]}
                    receipt.write(json.dumps(result, ensure_ascii=False) + "\n")
                    receipt.flush()
                    counts["processed"] += 1
                    counts["failed" if result["errors"] else "complete"] += 1
                    counts["articles"] += sum(v.get("articles", 0) for v in result["versions"])
                    counts["resumed_documents"] += sum(bool(v.get("resumed")) for v in result["versions"])
                    if result["errors"]:
                        counts["errors"].append({"eli_id": root, "errors": result["errors"]})
                    if counts["processed"] % 20 == 0 or counts["processed"] == len(acts):
                        write_json(output / "progress.json", {**counts, "run_id": ledger.run_id,
                                   "updated_at": datetime.now(timezone.utc).isoformat()})
                        logger.info("Full statutory text: {}/{} complete={}, failures={}", counts["processed"],
                                    len(acts), counts["complete"], counts["failed"])
            step.counts = {k: v for k, v in counts.items() if k != "errors"}
            if counts["failed"]:
                step.fail(f'{counts["failed"]} statutes have document failures; see results.jsonl')
    except Exception as error:
        counts["errors"].append({"error": str(error)[:400]})
    finally:
        result = {**ledger.finish(), "counts": counts, "all_statutes_complete":
                  counts["selected"] == counts["catalog_total"] > 0 and counts["complete"] == counts["catalog_total"]}
        write_json(output / "summary.json", result)
    return result
