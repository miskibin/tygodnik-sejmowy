"""Initial catalog import and bounded dependency audits, separate from changes feeds."""
from __future__ import annotations

import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote, urlsplit

import httpx

from supagraf.db import supabase
from supagraf.law.extract import PARSER_VERSION, html_units, pdf_units, sha256
from supagraf.sync.runlog import RunLedger

API = "https://api.sejm.gov.pl/eli"
SEEDS = {"DU/1974/141": "Prawo pracy", "DU/1964/93": "Prawo cywilne",
         "DU/2014/827": "Prawa konsumenta", "DU/1960/168": "Postępowanie administracyjne"}
RELEVANT = ("zmien", "uchyl", "jednolit", "wykonawc", "wprowadz")


def metadata_hash(body: dict) -> str:
    return sha256(json.dumps(body, ensure_ascii=False, sort_keys=True, separators=(",", ":")))


class Eli:
    def __init__(self, output: Path):
        self.output = output
        self.session = httpx.Client(timeout=45, follow_redirects=True, headers={"User-Agent": "TygodnikSejmowy/1.0"})

    def get(self, path: str) -> bytes:
        for attempt in range(4):
            try:
                response = self.session.get(API + path)
                response.raise_for_status()
                break
            except httpx.HTTPError as error:
                if isinstance(error, httpx.HTTPStatusError) and error.response.status_code not in {408, 429, 500, 502, 503, 504}:
                    raise
                if attempt == 3:
                    raise
                time.sleep(2 ** attempt)
        parsed = urlsplit(path)
        target = self.output / "sources" / parsed.path.lstrip("/")
        if not target.suffix:
            target = target.with_suffix(".json")
        target.parent.mkdir(parents=True, exist_ok=True)
        # Content-addressed copies preserve earlier evidence after an upstream change.
        target = target.with_name(target.stem + "-" + sha256(parsed.query)[:6] + "-" + sha256(response.content)[:12] + target.suffix)
        target.write_bytes(response.content)
        return response.content

    def act(self, eli: str) -> dict:
        if not re.fullmatch(r"(?:DU|MP)/\d{4}/\d+", eli):
            raise ValueError("Invalid ELI identifier")
        return json.loads(self.get("/acts/" + eli))


def store_metadata(sb, acts: list[dict]) -> None:
    now = datetime.now(timezone.utc).isoformat()
    for start in range(0, len(acts), 100):
        sb.table("_stage_acts").upsert([{"eli_id": a["ELI"], "payload": a,
            "source_path": API + "/acts/" + a["ELI"], "captured_at": now} for a in acts[start:start + 100]], on_conflict="eli_id").execute()
    # Direct metadata upserts avoid reloading the entire historical staging table.
    rows = []
    for a in acts:
        rows.append({"eli_id": a["ELI"], "term": a.get("term"), "publisher": a["publisher"], "year": a["year"],
                     "position": a.get("pos", a.get("position")), "type": a["type"], "title": a["title"],
                     "status": a.get("status"), "in_force": a.get("inForce"), "announcement_date": a.get("announcementDate"),
                     "promulgation_date": a.get("promulgation"), "legal_status_date": a.get("legalStatusDate"),
                     "change_date": a.get("changeDate"), "address": a.get("address"), "display_address": a.get("displayAddress"),
                     "keywords": a.get("keywords", []), "source_url": API + "/acts/" + a["ELI"],
                     "source_path": API + "/acts/" + a["ELI"]})
    for start in range(0, len(rows), 100):
        sb.table("acts").upsert(rows[start:start + 100], on_conflict="eli_id").execute()


def bootstrap_catalog(publisher: str, year_from: int, year_to: int, *, output: Path) -> dict:
    """Explicit year listing covers unchanged acts that changes feeds cannot discover."""
    if publisher not in {"DU", "MP"} or not 1918 <= year_from <= year_to <= datetime.now().year:
        raise ValueError("Invalid catalog bounds")
    sb, api = supabase(), Eli(output)
    counts = {"listed": 0, "stored": 0}
    try:
        for year in range(year_from, year_to + 1):
            offset = 0
            while True:
                page = json.loads(api.get(f"/acts/{publisher}/{year}?limit=500&offset={offset}"))
                items = page["items"]
                # Year listings omit references/dates: fetch each detail before storage.
                store_metadata(sb, [api.act(item["ELI"]) for item in items])
                counts["listed"] += len(items)
                counts["stored"] += len(items)
                offset += len(items)
                if not items or offset >= page["totalCount"]:
                    break
    finally:
        api.session.close()
    return counts


def related(act: dict) -> list[tuple[str, str]]:
    return [(category, entry["id"]) for category, entries in act.get("references", {}).items()
            if any(word in category.casefold() for word in RELEVANT) and isinstance(entries, list)
            for entry in entries if isinstance(entry, dict) and entry.get("id")]


def capture(api: Eli, sb, root: str, document: dict, dependency_hash: str, unresolved: list,
            *, full_text: bool = False, ocr: bool = False) -> dict:
    eli = document["ELI"]
    texts = document.get("texts", [])
    # Prefer a structured HTML document. The root's HTML is an original snapshot,
    # not a replacement for a later consolidated document or amendment.
    extraction = None
    if document.get("textHTML"):
        path, source_type = f"/acts/{eli}/text.html", "html_original_or_consolidated"
        try:
            raw = api.get(path)
            extraction = html_units(raw)
            if full_text:
                from supagraf.law.fulltext import preserve_html
                extraction = preserve_html(raw, extraction)
        except (httpx.HTTPError, ValueError):
            if not full_text:
                raise
            extraction = None
    if extraction is None:
        chosen = next((t for t in texts if t.get("type") == "U"), None) or next((t for t in texts if t.get("type") in {"T", "O"}), None)
        if not chosen:
            raise ValueError("No supported source document")
        path = f'/acts/{eli}/text/{chosen["type"]}/{quote(chosen["fileName"], safe="")}'
        source_type = "pdf_" + chosen["type"]
        raw = api.get(path)
        extraction = pdf_units(raw)
        if full_text:
            from supagraf.law.fulltext import preserve_pdf
            extraction = preserve_pdf(raw, extraction, ocr=ocr)
    if not extraction.units:
        raise ValueError("No complete articles extracted; previous document preserved")
    source_hash = sha256(raw)
    parser = PARSER_VERSION + ("+fulltext-v1" if full_text else "")
    version_id = sha256(f"{root}|{eli}|{source_hash}|{parser}")
    version = {"id": version_id, "root_eli_id": root, "document_eli_id": eli, "source_url": API + path,
               "source_sha256": source_hash, "source_type": source_type, "captured_at": datetime.now(timezone.utc).isoformat(),
               "document_date": document.get("promulgation") or document.get("announcementDate"), "metadata": document, "parser_version": parser,
               "extraction_method": extraction.method, "extraction_quality": extraction.quality,
               "warnings": extraction.warnings, "notes": json.dumps({"preamble": extraction.preamble, "footnotes": extraction.footnotes, "attachments": extraction.attachments,
                    **({"document_text": extraction.document_text} if full_text else {})}, ensure_ascii=False)}
    units = [{**{k: v for k, v in u.items() if k != "references"}, "id": sha256(version_id + "|" + u["anchor"]),
              "version_id": version_id, "references_json": u["references"]} for u in extraction.units]
    check = {"dependency_sha256": dependency_hash, "unresolved_changes": unresolved,
             "reason": "Official document snapshot; applicability and amendment completeness have not been verified"}
    inserted = sb.rpc("law_store_version", {"p_version": version, "p_units": units, "p_check": check}).execute().data
    return {"version_id": version_id, "document_eli_id": eli, "articles": len(units), "inserted": inserted,
            "extraction_quality": extraction.quality, "currency_status": "unverified"}


def sync_law(*, output: Path, max_dependencies: int = 5000, seeds: dict[str, str] | None = None) -> dict:
    sb, api = supabase(), Eli(output)
    roots = seeds or SEEDS
    ledger = RunLedger(kind="law", term=10, args={"roots": roots, "max_dependencies": max_dependencies})
    ledger.start()
    try:
        for root, family in roots.items():
            with ledger.step("law:" + root) as step:
                act = api.act(root)
                documents = {root: act}
                edges, missing = related(act), []
                # Audit all direct legal dependencies; related jurisprudence/links are separate.
                for category, eli in edges:
                    if eli in documents:
                        continue
                    if len(documents) - 1 >= max_dependencies:
                        missing.append({"eli_id": eli, "category": category, "reason": "scope_limit"})
                        continue
                    try:
                        documents[eli] = api.act(eli)
                    except (httpx.HTTPError, ValueError) as error:
                        missing.append({"eli_id": eli, "category": category, "reason": type(error).__name__})
                store_metadata(sb, list(documents.values()))
                dependency_hash = metadata_hash({eli: metadata_hash(a) for eli, a in sorted(documents.items())})
                sb.table("law_roots").upsert({"eli_id": root, "family": family, "metadata_sha256": metadata_hash(act),
                    "checked_at": datetime.now(timezone.utc).isoformat(), "last_error": None,
                    "coverage": {"direct_dependencies": len(set(eli for _, eli in edges)), "fetched": len(documents) - 1,
                        "missing": missing, "transitive_dependencies_verified": False, "dependency_sha256": dependency_hash}}).execute()
                dependencies = [{"root_eli_id": root, "dependency_eli_id": eli, "category": category,
                                 "metadata_sha256": metadata_hash(documents[eli]) if eli in documents else None}
                                for category, eli in set(edges)]
                if dependencies:
                    sb.table("law_dependencies").upsert(dependencies).execute()
                consolidated = [documents[eli] for category, eli in edges
                                if (category.casefold().startswith("inf. o tek") or category == "Akt jednolity") and eli in documents]
                latest = max(consolidated, key=lambda a: (a.get("promulgation") or "", a["ELI"]), default=act)
                versions = [capture(api, sb, root, a, dependency_hash, missing) for a in {root: act, latest["ELI"]: latest}.values()]
                step.counts = {"metadata": len(documents), "missing_dependencies": len(missing), "versions": versions,
                               "legal_currency": "unverified", "transitive_coverage": "not_verified"}
    finally:
        api.session.close()
        result = ledger.finish()
        output.mkdir(parents=True, exist_ok=True)
        (output / "summary.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return result
