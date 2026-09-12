import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
function load(path) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(path,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  vm.runInThisContext(`(function(exports,require){${code}\n})`)(exports, name => {
    if(name.endsWith('.css')) return {};
    if(name.startsWith('@/')) { const base=root+name.slice(2); return load(base+(existsSync(base+'.tsx')?'.tsx':'.ts')); }
    return require(name);
  });
  return exports;
}
const {WeeklySummary}=load(root+'app/tygodnik/_components/WeeklySummary.tsx');
const render=text=>renderToStaticMarkup(createElement(WeeklySummary,{text,term:10}));
test('Markdown preserves paragraphs, emphasis, lists, tables and citation links',()=>{
 const html=render('**Zobacz druk nr 123**.\n\n- Pierwszy warunek\n- Drugi warunek\n\n[Źródło](/proces/10/456)\n\n| A | B |\n| - | - |\n| 1 | 2 |');
 assert.match(html,/<strong>Zobacz druk nr <a href="\/proces\/10\/123">123<\/a><\/strong>/);
 assert.match(html,/<ul>/); assert.match(html,/<li>Drugi warunek<\/li>/); assert.match(html,/<table>/);
 assert.equal((html.match(/href="\/proces\/10\/456"/g)||[]).length,1);
});
test('Markdown blocks HTML, script URLs and unverified images',()=>{
 const html=render('<script>alert(1)</script>\n\n[link](javascript:alert%281%29)\n\n![zdjęcie](https://example.com/image.jpg)');
 assert.doesNotMatch(html,/<script|javascript:|<img/);
});
