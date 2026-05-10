from __future__ import annotations

import html as _html
import re
from dataclasses import dataclass, field
from html.parser import HTMLParser

_NR_RE = re.compile(r"[?&]nr=([^&\s\"']+)", re.IGNORECASE)
_PRINT_TOKEN = re.compile(r"^[0-9]+(?:-[A-Za-z0-9]+)?$")
_WS = re.compile(r"\s+")
_VOID = {"br", "hr", "img", "input", "meta", "link", "area", "base", "col", "embed",
         "param", "source", "track", "wbr"}


@dataclass
class AgendaItem:
    ord: int
    title: str
    raw_html: str
    process_refs: list[str] = field(default_factory=list)
    print_refs: list[str] = field(default_factory=list)


def _dedup(seq: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for s in seq:
        if s not in seen:
            seen.add(s)
            out.append(s)
    return out


def _split_print_tokens(text: str) -> list[str]:
    text = _html.unescape(text)
    parts = re.split(r"[,\s]+|\bi\b", text)
    return [p for p in (x.strip() for x in parts) if p and _PRINT_TOKEN.match(p)]


def _attrs_to_str(attrs: list[tuple[str, str | None]]) -> str:
    out = []
    for k, v in attrs:
        if v is None:
            out.append(k)
        else:
            out.append(f'{k}="{v}"')
    return (" " + " ".join(out)) if out else ""


class _AgendaParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.items: list[AgendaItem] = []
        self._ol_depth = 0
        self._li_depth = 0
        self._in_top_li = False
        self._auto_ord = 0
        self._cur_ord: int | None = None
        self._cur_raw: list[str] = []
        self._cur_text: list[str] = []
        self._cur_proc: list[str] = []
        self._cur_print: list[str] = []
        self._in_proc_a = False
        self._a_text: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag == "ol":
            self._ol_depth += 1
            if self._in_top_li:
                self._cur_raw.append(f"<{tag}{_attrs_to_str(attrs)}>")
            return
        if tag == "li":
            if self._ol_depth == 1 and self._li_depth == 0:
                self._li_depth = 1
                self._in_top_li = True
                self._auto_ord += 1
                self._cur_ord = self._auto_ord
                self._cur_raw = [f"<li{_attrs_to_str(attrs)}>"]
                self._cur_text = []
                self._cur_proc = []
                self._cur_print = []
            else:
                if self._in_top_li:
                    self._li_depth += 1
                    self._cur_raw.append(f"<{tag}{_attrs_to_str(attrs)}>")
            return
        if not self._in_top_li:
            return
        self._cur_raw.append(f"<{tag}{_attrs_to_str(attrs)}>")
        if tag == "a":
            cls = ""
            href = ""
            for k, v in attrs:
                if k == "class":
                    cls = v or ""
                elif k == "href":
                    href = v or ""
            if "proc" in cls.split():
                self._in_proc_a = True
                self._a_text = []
                m = _NR_RE.search(href)
                if m:
                    self._cur_proc.append(m.group(1))

    def handle_endtag(self, tag):
        if tag == "ol":
            if self._in_top_li:
                self._cur_raw.append(f"</{tag}>")
            self._ol_depth = max(0, self._ol_depth - 1)
            return
        if tag == "li":
            if self._in_top_li and self._li_depth == 1:
                self._cur_raw.append("</li>")
                title = _WS.sub(" ", _html.unescape("".join(self._cur_text))).strip()
                self.items.append(AgendaItem(
                    ord=self._cur_ord or self._auto_ord,
                    title=title,
                    raw_html="".join(self._cur_raw),
                    process_refs=_dedup(self._cur_proc),
                    print_refs=_dedup(self._cur_print),
                ))
                self._in_top_li = False
                self._li_depth = 0
                self._cur_ord = None
                self._cur_raw = []
                self._cur_text = []
                self._cur_proc = []
                self._cur_print = []
                self._in_proc_a = False
                self._a_text = []
            elif self._in_top_li and self._li_depth > 1:
                self._li_depth -= 1
                self._cur_raw.append("</li>")
            return
        if not self._in_top_li:
            return
        self._cur_raw.append(f"</{tag}>")
        if tag == "a" and self._in_proc_a:
            text = _html.unescape("".join(self._a_text))
            for tok in _split_print_tokens(text):
                self._cur_print.append(tok)
            self._in_proc_a = False
            self._a_text = []

    def handle_startendtag(self, tag, attrs):
        if not self._in_top_li:
            return
        self._cur_raw.append(f"<{tag}{_attrs_to_str(attrs)}/>")

    def handle_data(self, data):
        if self._in_top_li:
            self._cur_raw.append(data)
            self._cur_text.append(data)
            if self._in_proc_a:
                self._a_text.append(data)

    def handle_entityref(self, name):
        if self._in_top_li:
            self._cur_raw.append(f"&{name};")
            self._cur_text.append(f"&{name};")
            if self._in_proc_a:
                self._a_text.append(f"&{name};")

    def handle_charref(self, name):
        if self._in_top_li:
            self._cur_raw.append(f"&#{name};")
            self._cur_text.append(f"&#{name};")
            if self._in_proc_a:
                self._a_text.append(f"&#{name};")


def parse_agenda(html: str) -> list[AgendaItem]:
    if not html or "<ol" not in html.lower():
        return []
    p = _AgendaParser()
    p.feed(html)
    p.close()
    return p.items
