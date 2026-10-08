import assert from "node:assert/strict";
import { lawBlocks, lawInline, mentionedActs } from "../frontend/lib/law-reader.ts";

const unit = { anchor: "art-2", article_number: "2", body: "Art. 2. § 1. Reguła nadrzędna:\n1)\npierwszy warunek;\na) wyjątek;\n§ 2. Kolejny para-\ngraf z art. 3¹." };
const before = unit.body;
const blocks = lawBlocks(unit);
assert.deepEqual(blocks.map(b => [b.kind, b.marker, b.id]), [
  ["paragraph", "§ 1.", "art-2-par-1"], ["point", "1)", "art-2-par-1-pkt-1"],
  ["letter", "a)", "art-2-par-1-pkt-1-lit-a"], ["paragraph", "§ 2.", "art-2-par-2"],
]);
assert.equal(blocks[1].text, "pierwszy warunek;");
assert.equal(blocks[3].text, "Kolejny paragraf z art. 3¹.");
assert.equal(unit.body, before);
const current = { ...unit, root_eli_id: "DU/2014/827", version_id: "consumer-v2" };
const links = { acts: [
  { root: current.root_eli_id, version: current.version_id, documents: ["DU/2026/1244"], articles: { "2": "art-2", "3¹": "art-3¹", "5": "art-5" } },
  { root: "DU/1964/93", version: "civil-v2", documents: ["DU/2026/795"], articles: { "5": "civil-5" } },
], metadata: ["DU/2024/1461"] };
const ids = new Set([...blocks.map(b => b.id), "art-3¹", "art-5"]);
assert.equal(lawInline("z art. 3¹", current, links, ids)[1].href, "#art-3%C2%B9");
assert.equal(lawInline("art. 2 § 1 pkt 1 lit. a", current, links, ids)[0].href, "#art-2-par-1-pkt-1-lit-a");
assert.equal(lawInline("art. 5 ustawy z dnia 23 kwietnia 1964 r. – Kodeks cywilny", current, links, ids)[0].href,
  "/prawo/DU/1964/93?version=civil-v2#civil-5");
assert.ok(lawInline("art. 5 § 1 ustawy o nieznanym przedmiocie", current, links, ids).every(p => !p.href));
assert.ok(lawInline("art. 5 ust. 1 rozporządzenia Parlamentu Europejskiego", current, links, ids).every(p => !p.href));
assert.ok(lawInline("art. 5–7 ustawy o nieznanym przedmiocie", current, links, ids).every(p => !p.href));
assert.equal(lawInline("pkt 1", current, links, ids, "par-1")[0].href, "#art-2-par-1-pkt-1");
assert.equal(lawInline("lit. a", current, links, ids, "par-1-pkt-1")[0].href, "#art-2-par-1-pkt-1-lit-a");
assert.equal(lawInline("art. 9999", current, links, ids)[0].href, undefined);
assert.ok(lawInline("ustawa o prawach konsumenta", current, links, ids).every(p => !p.href));
assert.deepEqual(mentionedActs("Dz. U. z 2024 r. poz. 1461"), ["DU/2024/1461"]);
assert.equal(lawInline("Dz. U. z 2024 r. poz. 1461", current, links, ids)[0].href, "/prawo/DU/2024/1461");
assert.equal(lawInline("Dz. U. z 1900 r. poz. 999", current, links, ids)[0].href, "https://eli.gov.pl/eli/DU/1900/999/ogl");
console.log("Legal reader: numbering, source preservation, versioned links and unresolved references passed");
