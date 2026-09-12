"""Publish only hashes explicitly approved in an editorial manifest."""
from __future__ import annotations
import hashlib, json
from pathlib import Path
from supagraf.db import supabase

def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def publish(manifest: Path, assets_root: Path, *, dry_run: bool = True) -> list[dict]:
    approved = json.loads(manifest.read_text(encoding="utf-8"))
    if not isinstance(approved, list) or not approved: raise ValueError("approved manifest required")
    sb = supabase(); out=[]
    for item in approved:
        term, number, expected = item["term"], item["number"], item["sha256"]
        filename = Path(item["url"]).name
        path = assets_root / f"term-{term}" / filename
        if not path.is_file() or sha(path) != expected: raise ValueError(f"asset hash mismatch: {term}/{number}")
        rows = sb.table("prints").select("id,title,short_title").eq("term",term).eq("number",number).limit(2).execute().data or []
        if len(rows) != 1: raise ValueError(f"print not uniquely found: {term}/{number}")
        title = " ".join(filter(None,[rows[0].get("title"),rows[0].get("short_title")]))
        image={"url":item["url"],"source_url":item.get("source_url", ""),"author":item.get("author", "Tygodnik Sejmowy"),"license":item.get("license", "Ilustracja AI — FLUX.2 [klein] 4B"),"license_url":item.get("license_url", ""),"caption":item["caption"],"alt":item["alt"],"provider":item["provider"],"editorial_selected":True,"width":1536 if filename.endswith(".png") else 1280,"height":1024 if filename.endswith(".png") else 853,"sha256":expected}
        payload={"print_id":rows[0]["id"],"status":"matched","subject_hash":hashlib.sha256(title.encode()).hexdigest(),"catalog_hash":f"approved-v1:{expected}","image":image}
        if not dry_run: sb.table("print_images").upsert(payload,on_conflict="print_id").execute()
        out.append(payload)
    return out
