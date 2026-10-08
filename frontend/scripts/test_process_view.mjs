import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
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
    if(name.endsWith('.css')) return new Proxy({}, {get:(_,key)=>key==='__esModule'?false:String(key)});
    if(name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? root+name.slice(2) : resolve(dirname(path),name);
      return load(base+(existsSync(base+'.tsx')?'.tsx':'.ts'));
    }
    return require(name);
  });
  return exports;
}
const {ProcessContent}=load(root+'app/proces/[term]/[number]/_components/ProcessContent.tsx');
const data={print:{term:10,number:'100',title:'Projekt ustawy',shortTitle:'Przykładowy projekt',documentDate:'2026-09-01',documentCategory:'projekt_ustawy',summaryPlain:'Projekt przewiduje zmianę zasad.',affectedGroups:[],personas:[],topics:[],parentNumber:null},
 stages:[{ord:1,depth:0,stageType:'Start',stageDate:'2026-09-01',stageName:'Wpłynięcie',voting:null},{ord:2,depth:0,stageType:'CommitteeWork',stageDate:'2099-10-01',stageName:'Praca w komisji',voting:null}],
 mainVoting:null,relatedVotings:[],votingByClub:[],committeeSittings:[],subPrints:[],matchedPromises:[],outcome:null,attachments:['100.pdf'],proceedingPoints:[]};
const html=renderToStaticMarkup(createElement(ProcessContent,{data,citations:createElement('p',null,'Fragment debaty kontrolnej')}));
test('all process sections are available in server HTML without tab state or JavaScript',()=>{
 assert.doesNotMatch(html,/role="tab|\shidden=/);
 for(const id of ['w-skrocie','historia','glosowania','wypowiedzi','dokumenty']) assert.match(html,new RegExp(`id="${id}"`));
 assert.match(html,/Fragment debaty kontrolnej/); assert.match(html,/100.pdf/);
 assert.equal((html.match(/<h1[ >]/g)||[]).length,1);
});
test('future record is visibly scheduled and does not become current status',()=>{
 assert.match(html,/Zaplanowano — etap jeszcze nie nastąpił/);
 assert.match(html,/Ostatni odnotowany status: <!-- -->Wpłynięcie|Ostatni odnotowany status: Wpłynięcie/);
 assert.doesNotMatch(html,/TU JESTEŚMY|▼|Co możesz zrobić/);
});

test('date-only parliamentary dates do not shift with the server timezone',()=>{
 assert.match(html,/Dokument z 1 września 2026/);
 assert.doesNotMatch(html,/31 sierpnia 2026/);
});
