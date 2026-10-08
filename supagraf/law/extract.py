"""Preserve complete editorial units and their context; never infer legal dates."""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field

from bs4 import BeautifulSoup

PARSER_VERSION = "eli-structure-v1"


def sha256(value: bytes | str) -> str:
    return hashlib.sha256(value.encode() if isinstance(value, str) else value).hexdigest()


@dataclass
class Extraction:
    units: list[dict] = field(default_factory=list)
    method: str = "html_structured"
    quality: str = "needs_review"
    warnings: list[str] = field(default_factory=list)


def normalize(value: str) -> str:
    return re.sub(r"[ \t\xa0]+", " ", value).strip()


def html_units(raw: bytes) -> Extraction:
    soup = BeautifulSoup(raw, "lxml")
    for element in soup.select("script, style, #toc, #show-all"):
        element.decompose()
    for element in soup.select("sup"):
        element.replace_with(element.get_text().translate(str.maketrans("0123456789", "⁰¹²³⁴⁵⁶⁷⁸⁹")))
    out = Extraction()
    seen = set()
    nodes = soup.select(".unit_arti")
    if not nodes:
        out.warnings.append("No official article structure; automatic fallback cannot verify extraction")
        return out
    for ordinal, node in enumerate(nodes):
        anchor = node.get("id")
        heading = node.find(["h2", "h3", "h4"], recursive=False)
        label = normalize(heading.get_text("", strip=False)) if heading else ""
        if not anchor or anchor in seen or not re.match(r"Art\.?\s*\d", label, re.I):
            out.warnings.append(f"Invalid or duplicate editorial unit at position {ordinal}")
            continue
        seen.add(anchor)
        match = re.match(r"Art\.?\s*(\d+[a-z]*(?:[¹²³⁴⁵⁶⁷⁸⁹⁰]+)?)", label, re.I)
        context = []
        for parent in reversed(list(node.parents)):
            if parent.get("class") and "unit" in parent.get("class"):
                title = parent.find(["h2", "h3", "h4"], recursive=False)
                if title:
                    context.append(normalize(title.get_text(" ", strip=True)))
        body = "\n".join(normalize(line) for line in node.get_text("\n", strip=False).splitlines() if normalize(line))
        references = list(dict.fromkeys(re.findall(r"\bart\.?\s*\d+[a-z]*(?:\s*ust\.?\s*\d+)?", body, re.I)))
        out.units.append({"anchor": anchor, "label": label, "article_number": match[1] if match else None,
                          "ordinal": ordinal, "context": context, "body": body,
                          "body_sha256": sha256(body), "references": references})
    # Confirm only the mechanical extraction, never the law's applicability.
    if out.units and not out.warnings:
        out.quality = "structured"
    return out


def pdf_units(raw: bytes) -> Extraction:
    import pymupdf

    out = Extraction(method="pdf_text", warnings=["PDF article boundaries require review; no OCR performed"])
    with pymupdf.open(stream=raw, filetype="pdf") as document:
        text = "\n".join(page.get_text(sort=True) for page in document)
    # Keep the complete source around each article, including exceptions/footnotes.
    matches = list(re.finditer(r"(?m)^\s*Art\.\s*(\d+[a-z]*)(?:\s|\.)", text))
    seen = set()
    for ordinal, match in enumerate(matches):
        number = match[1]
        anchor = f"pdf-article-{number}-{ordinal}"
        body = text[match.start(): matches[ordinal + 1].start() if ordinal + 1 < len(matches) else len(text)].strip()
        if number in seen:
            out.warnings.append(f"Repeated article label {number}; possible annex or amendment")
        seen.add(number)
        out.units.append({"anchor": anchor, "label": f"Art. {number}", "article_number": number,
                          "ordinal": ordinal, "context": [], "body": body, "body_sha256": sha256(body),
                          "references": list(dict.fromkeys(re.findall(r"\bart\.\s*\d+[a-z]*", body, re.I)))})
    return out
