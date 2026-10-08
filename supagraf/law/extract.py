"""Preserve complete editorial units and their context; never infer legal dates."""
from __future__ import annotations

import hashlib
import re
from collections import Counter
from dataclasses import dataclass, field

from bs4 import BeautifulSoup

PARSER_VERSION = "eli-structure-v3"


def sha256(value: bytes | str) -> str:
    return hashlib.sha256(value.encode() if isinstance(value, str) else value).hexdigest()


@dataclass
class Extraction:
    units: list[dict] = field(default_factory=list)
    method: str = "html_structured"
    quality: str = "needs_review"
    warnings: list[str] = field(default_factory=list)
    preamble: str = ""
    footnotes: list[dict] = field(default_factory=list)
    attachments: list[dict] = field(default_factory=list)


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
        # Quoted amendments can contain nested article markup. Their text belongs
        # to the enclosing article, not to another article of this act.
        if any("unit_arti" in parent.get("class", []) for parent in node.parents):
            continue
        anchor = node.get("id")
        heading = node.find(["h2", "h3", "h4"], recursive=False)
        label = normalize(heading.get_text("", strip=False)) if heading else ""
        if not anchor or not re.match(r"Art\.?\s*\d", label, re.I):
            out.warnings.append(f"Invalid or duplicate editorial unit at position {ordinal}")
            continue
        if anchor in seen:
            out.warnings.append(f"Duplicate source anchor at position {ordinal}; both articles preserved")
            anchor = f"html-duplicate-{ordinal}"
        seen.add(anchor)
        match = re.match(r"Art\.?\s*(\d+[a-z]*(?:[¹²³⁴⁵⁶⁷⁸⁹⁰]+)?)", label, re.I)
        context = []
        for parent in reversed(list(node.parents)):
            if any(c in parent.get("class", []) for c in ["unit_book", "unit_part", "unit_bran", "unit_titl", "unit_chpt", "unit_divi"]):
                titles = [normalize(child.get_text(" ", strip=True)) for child in parent.find_all(["h2", "h3", "h4", "p"], recursive=False)]
                title = " — ".join(t for t in titles if t)
                if title:
                    context.append(title)
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
    lines = []
    font_sizes: Counter = Counter()
    with pymupdf.open(stream=raw, filetype="pdf") as document:
        for page_index, page in enumerate(document):
            for block in page.get_text("dict", sort=True)["blocks"]:
                for line in block.get("lines", []):
                    spans = line["spans"]
                    text = ""
                    right = None
                    for span in spans:
                        part = span["text"]
                        if span["flags"] & 1:
                            part = part.replace("[", "").replace("]", "").translate(str.maketrans("0123456789", "⁰¹²³⁴⁵⁶⁷⁸⁹"))
                        if right is not None and span["bbox"][0] - right > 2 and not span["flags"] & 1:
                            text += " "
                        text += part
                        right = span["bbox"][2]
                    text = normalize(text)
                    if not text:
                        continue
                    # Running page furniture is not part of a provision.
                    if line["bbox"][1] < 70 and re.fullmatch(r"Dziennik Ustaw|Poz\.\s*\d+|[–−-]\s*\d+\s*[–−-]", text):
                        continue
                    size = max(s["size"] for s in spans)
                    font_sizes[round(size, 1)] += len(text)
                    lines.append({"text": text, "page": page_index + 1, "size": size,
                                  "centered": abs((line["bbox"][0] + line["bbox"][2]) / 2 - page.rect.width / 2) < 12
                                  and (line["bbox"][0] > 90 or all(s["flags"] & 16 for s in spans if s["text"].strip()))})
    # A consolidated notice quotes articles of OTHER acts before its annex.
    # Preserve that notice separately; never index it as articles of the root act.
    start = 0
    annex = next((i for i, line in enumerate(lines) if line["text"].startswith("Załącznik do obwieszczenia")), None)
    if annex is not None:
        start = next((i + 1 for i in range(annex, len(lines)) if lines[i]["text"] == "USTAWA"), 0)
        if not start:
            out.warnings.append("Annex title not recognized; no articles published")
            return out
        out.preamble = "\n".join(line["text"] for line in lines[:start])
    ranks = {"księga": 1, "część": 2, "tytuł": 3, "dział": 4, "rozdział": 5, "oddział": 6}
    context: dict[int, str] = {}
    heading_rank = None
    current = None
    body: list[str] = []
    seen = set()
    in_attachment = False
    body_size = font_sizes.most_common(1)[0][0] if font_sizes else 10

    def finish():
        if current is None:
            return
        text = "\n".join(body).strip()
        current.update(body=text, body_sha256=sha256(text), references=list(dict.fromkeys(
            re.findall(r"\bart\.\s*\d+[a-z]*[⁰¹²³⁴⁵⁶⁷⁸⁹]*", text, re.I))))
        out.units.append(current.copy())

    for line in lines[start:]:
        text = line["text"]
        if re.match(r"^Załącznik(?:i)? (?:nr\b|do ustawy\b)", text):
            finish()
            current, body = None, []
            in_attachment = True
            out.attachments.append({"page": line["page"], "text": text})
            continue
        if in_attachment:
            out.attachments[-1]["text"] += "\n" + text
            continue
        if line["size"] < body_size * 0.95:
            if out.footnotes and out.footnotes[-1]["page"] == line["page"]:
                out.footnotes[-1]["text"] += "\n" + text
            else:
                out.footnotes.append({"page": line["page"], "text": text})
            continue
        heading = re.match(r"^(KSIĘGA|CZĘŚĆ|TYTUŁ|DZIAŁ|Rozdział|Oddział)\s+\S", text, re.I) if line["centered"] else None
        if heading:
            finish()
            current, body = None, []
            heading_rank = ranks[heading[1].casefold()]
            context = {k: v for k, v in context.items() if k < heading_rank}
            context[heading_rank] = text
            continue
        if heading_rank is not None and line["centered"] and not text.startswith("Art."):
            context[heading_rank] += (" " if " — " in context[heading_rank] else " — ") + text
            continue
        match = re.match(r"^Art\.\s*(\d+[a-z]*[⁰¹²³⁴⁵⁶⁷⁸⁹]*)\.", text)
        if match:
            finish()
            number = match[1]
            if number in seen:
                out.warnings.append(f"Repeated article label {number}; possible quoted amendment")
            seen.add(number)
            ordinal = len(out.units)
            current = {"anchor": f"pdf-article-{number}-{ordinal}", "label": f"Art. {number}",
                       "article_number": number, "ordinal": ordinal, "context": list(context.values())}
            body = [text]
            heading_rank = None
        elif current is not None:
            body.append(text)
    finish()
    return out
