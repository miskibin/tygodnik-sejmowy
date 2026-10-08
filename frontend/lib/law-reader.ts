import type { LawUnit } from "./law-types";

export type LawBlock = { id: string; marker: string; text: string; kind: "text" | "paragraph" | "point" | "letter" | "dash"; scope: string };
export type LawTocEntry = { id: string; label: string; context: string[] };
export type LawLinkAct = { root: string; version: string; documents: string[]; articles: Record<string, string> };
export type LawLinks = { acts: LawLinkAct[]; metadata: string[] };
export type LawInline = { text: string; href?: string; external?: boolean };

const number = "[0-9]+[a-z]*[⁰¹²³⁴⁵⁶⁷⁸⁹]*";
const marker = new RegExp(`^(§\\s*${number}\\.|${number}\\.|${number}\\)|[a-z]\\)|[–—]\\s)(.*)$`, "u");

export function articleFootnote(body: string): string {
  return /^Art\.\s*[0-9]+[a-z]*[⁰¹²³⁴⁵⁶⁷⁸⁹]*\.\s*([⁰¹²³⁴⁵⁶⁷⁸⁹]+\))/u.exec(body)?.[1] ?? "";
}

/** Reflow source lines, preserving editorial numbering and complete sentences. */
export function lawBlocks(unit: Pick<LawUnit, "anchor" | "body" | "article_number">): LawBlock[] {
  const lines = unit.body.trim().split(/\n/).map(l => l.trim()).filter(Boolean);
  const article = new RegExp(`^Art\\.\\s*${unit.article_number?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.\\s*`, "u");
  if (lines[0]) {
    lines[0] = lines[0].replace(article, "");
    const note = /^[⁰¹²³⁴⁵⁶⁷⁸⁹]+\)\s*/.exec(lines[0]);
    if (note) lines[0] = lines[0].slice(note[0].length);
  }
  const blocks: LawBlock[] = [];
  let scope = "", point = "";
  const used = new Map<string, number>();
  for (const line of lines) {
    if (!line) continue;
    const match = marker.exec(line);
    if (!match && blocks.length) {
      const previous = blocks[blocks.length - 1];
      // PDF line-end hyphens are discretionary. Raw extraction stays immutable.
      previous.text = previous.text.endsWith("-") && /^[a-ząćęłńóśźż]/.test(line)
        ? previous.text.slice(0, -1) + line : [previous.text, line].filter(Boolean).join(" ");
      continue;
    }
    const label = match?.[1].trim() ?? "";
    let kind: LawBlock["kind"] = "text", suffix = `text-${blocks.length}`;
    if (label.startsWith("§") || /^\d.*\.$/.test(label)) {
      kind = "paragraph"; scope = `${label.startsWith("§") ? "par" : "ust"}-${label.replace(/^§\s*|\.$/g, "")}`; point = ""; suffix = scope;
    } else if (/^\d.*\)$/.test(label)) {
      kind = "point"; point = `pkt-${label.slice(0, -1)}`; suffix = [scope, point].filter(Boolean).join("-");
    } else if (/^[a-z]\)$/.test(label)) {
      kind = "letter"; suffix = [scope, point, `lit-${label[0]}`].filter(Boolean).join("-");
    } else if (label) kind = "dash";
    const base = `${unit.anchor}-${suffix}`, count = used.get(base) ?? 0;
    used.set(base, count + 1);
    blocks.push({ id: count ? `${base}-variant-${count + 1}` : base, marker: label, text: match?.[2].trim() ?? line, kind,
      scope: kind === "letter" ? [scope, point].filter(Boolean).join("-") : scope });
  }
  return blocks;
}

export const knownLawNames = [
  { root: "DU/1974/141", pattern: /kodeks(?:u|em|ie)?\s+pracy/iu },
  { root: "DU/1964/93", pattern: /kodeks(?:u|em|ie)?\s+cywiln(?:y|ego|ym)/iu },
  { root: "DU/1960/168", pattern: /kodeks(?:u|em|ie)?\s+postępowania\s+administracyjnego/iu },
  { root: "DU/2014/827", pattern: /ustaw(?:a|y|ie|ę|ą)\s+(?:z dnia[^;()]{0,60}\s+)?o\s+prawach\s+konsumenta/iu },
];

export function mentionedActs(text: string): string[] {
  return [...text.matchAll(/Dz\.\s*U\.\s*(?:z\s*)?(\d{4})\s*(?:r\.\s*)?poz\.\s*(\d+)/g)].map(m => `DU/${m[1]}/${m[2]}`);
}

export function lawInline(text: string, unit: Pick<LawUnit, "root_eli_id" | "version_id" | "anchor" | "article_number">,
  links: LawLinks, ids: Set<string>, scope = ""): LawInline[] {
  const tokens: { start: number; end: number; value: LawInline }[] = [];
  const local = links.acts.find(a => a.root === unit.root_eli_id && a.version === unit.version_id);
  function articleHref(root: string, article: string, tail: string, same = false): string | undefined {
    const act = same ? local : links.acts.find(a => a.root === root);
    const anchor = act?.articles[article];
    if (!act || !anchor) return undefined;
    let target = anchor;
    const parts = [...tail.matchAll(/(?:§\s*|ust\.\s*)([0-9]+[a-z]*[⁰¹²³⁴⁵⁶⁷⁸⁹]*)|pkt\s*([0-9]+[a-z]*)|lit\.\s*([a-z])/g)];
    for (const part of parts) {
      const next = target + (part[1] ? `-${part[0].startsWith("§") ? "par" : "ust"}-${part[1]}` : part[2] ? `-pkt-${part[2]}` : `-lit-${part[3]}`);
      if (same && ids.has(next)) target = next;
    }
    return same ? `#${encodeURIComponent(target)}` : `/prawo/${act.root}?version=${act.version}#${encodeURIComponent(target)}`;
  }
  const referenceRanges: { start: number; end: number }[] = [];
  const references = new RegExp(`\\bart\\.\\s*(${number})(?:\\s*(?:(?:§|ust\\.|pkt)\\s*${number}|lit\\.\\s*[a-z]))*`, "giu");
  for (const match of text.matchAll(references)) {
    referenceRanges.push({ start: match.index!, end: match.index! + match[0].length });
    const after = text.slice(match.index! + match[0].length, match.index! + match[0].length + 350);
    // An explicit other-act qualifier must never become a same-act jump.
    const qualifier = /^(?:\s*(?:i|,|oraz|–|-)\s*\d+[a-z]*[⁰¹²³⁴⁵⁶⁷⁸⁹]*)*\s+(?:ustaw|kodeks|rozporządzen|dyrektyw|konstytucj)/iu.test(after);
    const named = qualifier ? knownLawNames.find(a => a.pattern.test(after.split(/[;\n]/)[0])) : undefined;
    const href = qualifier ? (named ? articleHref(named.root, match[1], "", named.root === unit.root_eli_id) : undefined) : articleHref(unit.root_eli_id, match[1], match[0], true);
    if (href) tokens.push({ start: match.index!, end: match.index! + match[0].length, value: { text: match[0], href } });
  }
  for (const name of knownLawNames) {
    const regex = new RegExp(name.pattern.source, "giu");
    for (const match of text.matchAll(regex)) {
      const act = links.acts.find(a => a.root === name.root);
      if (act) tokens.push({ start: match.index!, end: match.index! + match[0].length, value: { text: match[0], href: `/prawo/${act.root}?version=${act.version}` } });
    }
  }
  for (const match of text.matchAll(/Dz\.\s*U\.\s*(?:z\s*)?(\d{4})\s*(?:r\.\s*)?poz\.\s*(\d+)/g)) {
    const eli = `DU/${match[1]}/${match[2]}`, act = links.acts.find(a => a.root === eli || a.documents.includes(eli));
    const href = act ? `/prawo/${act.root}?version=${act.version}` : links.metadata.includes(eli) ? `/prawo/${eli}` : `https://eli.gov.pl/eli/${eli}/ogl`;
    tokens.push({ start: match.index!, end: match.index! + match[0].length, value: { text: match[0], href, external: href.startsWith("https:") } });
  }
  for (const match of text.matchAll(/§\s*(\d+[a-z]*[⁰¹²³⁴⁵⁶⁷⁸⁹]*)|ust\.\s*(\d+[a-z]*)|pkt\s*(\d+[a-z]*)|lit\.\s*([a-z])/g)) {
    if (referenceRanges.some(r => match.index! >= r.start && match.index! < r.end)) continue;
    const suffix = match[1] ? `par-${match[1]}` : match[2] ? `ust-${match[2]}` : match[3] ? [scope, `pkt-${match[3]}`].filter(Boolean).join("-") : [scope, `lit-${match[4]}`].filter(Boolean).join("-");
    const id = `${unit.anchor}-${suffix}`;
    if (ids.has(id)) tokens.push({ start: match.index!, end: match.index! + match[0].length, value: { text: match[0], href: `#${encodeURIComponent(id)}` } });
  }
  tokens.sort((a, b) => a.start - b.start || b.end - a.end);
  const out: LawInline[] = [];
  let cursor = 0;
  for (const token of tokens) {
    if (token.start < cursor) continue;
    if (token.start > cursor) out.push({ text: text.slice(cursor, token.start) });
    out.push(token.value); cursor = token.end;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor) });
  return out;
}
