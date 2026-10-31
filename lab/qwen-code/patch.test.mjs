import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {applyCandidate,sourceSlots,inspectCandidate,missingComponents} from './patch.mjs';
import {digest} from './workspace.mjs';
const original='export const a=1;\nexport const b=2;\nexport const c=3;\n';
const request=edits=>({expectedSha:'a'.repeat(40),files:[{path:'a.js',content:original},{path:'b.js',content:'export const untouched=7;'}],allowDependencies:false,writePaths:['a.js'],edits:edits.map(e=>({path:'a.js',expectedDigest:digest(original),...e}))});
async function scenario(input,run){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'sdlc-micro-'));const root=path.join(directory,'workspace');try{await run(await applyCandidate(input,root),root);}finally{await fs.rm(directory,{recursive:true,force:true});}}
test('micro edits use one frozen revision and apply descending ranges without changing siblings',()=>scenario(request([{startLine:1,endLine:1,content:'export const a=10;\nexport const extra=4;'},{startLine:3,endLine:3,content:'export const c=30;'}]),async(value,root)=>{
 assert.equal(value.state,'succeeded');assert.equal(value.validation.valid,true);assert.equal(value.expectedSha,'a'.repeat(40));assert.deepEqual(value.patch.files,[{path:'a.js',content:'export const a=10;\nexport const extra=4;\nexport const b=2;\nexport const c=30;\n'}]);assert.equal(await fs.readFile(path.join(root,'b.js'),'utf8'),'export const untouched=7;');
}));
test('a stale second edit refuses the complete batch before any source write',()=>scenario(request([{startLine:1,endLine:1,content:'export const a=10;'},{startLine:3,endLine:3,content:'export const c=30;',expectedDigest:'f'.repeat(64)}]),async(value,root)=>{
 assert.equal(value.state,'failed');assert.equal('patch' in value,false);assert.match(value.error,/fonte.*mudou/);assert.equal(await fs.readFile(path.join(root,'a.js'),'utf8'),original);
}));
test('overlaps and out-of-scope paths stay refused with the source intact',async()=>{
 for(const input of [request([{startLine:1,endLine:2,content:'x'},{startLine:2,endLine:2,content:'y'}]),{...request([{startLine:1,endLine:1,content:'export const a=8;'}]),writePaths:['b.js']}])await scenario(input,async(value,root)=>{assert.equal(value.state,'failed');assert.equal('patch' in value,false);assert.equal(await fs.readFile(path.join(root,'a.js'),'utf8'),original);});
});
test('syntax failures have no publishable patch and validation never executes project code',async()=>{
 await scenario(request([{startLine:1,endLine:1,content:'export const a ='}]),async value=>{assert.equal(value.state,'failed');assert.equal(value.validation.valid,false);assert.equal('patch' in value,false);});
 await scenario(request([{startLine:1,endLine:1,content:'globalThis.MICRO_PROJECT_EXECUTED=true;export const a=2;'}]),async value=>{assert.equal(value.state,'succeeded');assert.equal(globalThis.MICRO_PROJECT_EXECUTED,undefined);});
});
test('syntactic slots preserve JSX braces, surrounding code and UTF-16 offsets',async()=>{
 const content="import React from 'react';const note='💎';export const App=()=> <p>R$ {Number(0).toFixed(2)}</p>;";
 const slots=sourceSlots(content,'a.jsx'),slot=slots.find(s=>s.code==='Number(0).toFixed(2)');assert.ok(slot);assert.match(slot.before,/R\$ \{$/);
 await scenario({...request([]),files:[{path:'a.jsx',content}],writePaths:['a.jsx'],edits:[{path:'a.jsx',slot:slot.slot,content:"Number(0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})",expectedDigest:digest(content)}]},async value=>{
  assert.equal(value.state,'succeeded');assert.match(value.patch.files[0].content,/💎/);assert.ok(value.patch.files[0].content.endsWith("}</p>;"));assert.match(value.patch.files[0].content,/R\$ \{Number\(0\)/);
 });
});
test('nested slots, invented slots and stale revisions cannot publish a patch',async()=>{
 const content='export const sum=(a,b)=>a-b;';const slots=sourceSlots(content,'a.js');const arrow=slots.find(s=>s.kind==='ArrowFunctionExpression'),binary=slots.find(s=>s.kind==='BinaryExpression');
 for(const edits of [[{slot:arrow.slot,content:'(a,b)=>a+b'},{slot:binary.slot,content:'a+b'}],[{slot:'s999',content:'a+b'}],[{slot:binary.slot,content:'a+b',expectedDigest:'f'.repeat(64)}]])await scenario({...request([]),files:[{path:'a.js',content}],edits:edits.map(e=>({path:'a.js',expectedDigest:digest(content),...e}))},async value=>{assert.equal(value.state,'failed');assert.equal('patch'in value,false);});
});
test('inspection gives bounded observed source slots without executing code',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'sdlc-index-'));try{
  const content='globalThis.SDLC_INSPECT_EXECUTED=true;export const sum=(a,b)=>a-b;';const value=await inspectCandidate({expectedSha:'a'.repeat(40),files:[{path:'a.js',content}],inspectPath:'a.js'},path.join(directory,'workspace'));
  assert.equal(value.state,'inspected');assert.equal(value.expectedDigest,digest(content));assert.ok(value.slots.some(s=>s.code==='a-b'));assert.equal('start'in value.slots[0],false);assert.equal(globalThis.SDLC_INSPECT_EXECUTED,undefined);
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('import insertion adds only declarations and keeps existing imports and code',async()=>{
 const content="import React from 'react';export const App=()=>null;";
 for(const insertion of ["import {useState} from 'react';",'globalThis.SDLC_INJECTED=true;'])await scenario({...request([]),files:[{path:'a.jsx',content}],writePaths:['a.jsx'],edits:[{path:'a.jsx',slot:'s0',content:insertion,expectedDigest:digest(content)}]},async value=>{
  if(insertion.startsWith('import')){assert.equal(value.state,'succeeded');assert.equal(value.patch.files[0].content,content.replace(';export',';'+insertion+'export'));}
  else{assert.equal(value.state,'failed');assert.equal('patch'in value,false);}
 });
});
test('missing JSX component references are reported without executing the candidate',()=>{
 assert.deepEqual(missingComponents("import App from './App.jsx';const Page=()=> <StoreProvider><App/></StoreProvider>;",'a.jsx'),['StoreProvider']);
 assert.deepEqual(missingComponents("import {StoreProvider} from './store.jsx';const App=()=> <p/>;export const Page=()=> <StoreProvider><App/></StoreProvider>;",'a.jsx'),[]);
});
test('slots expose complete boundary expressions instead of inner receiver fragments',()=>{
 const slots=sourceSlots('export const formatAmount=amount=>Number(amount).toFixed(2);','prices.js');
 assert.ok(slots.some(s=>s.code==='Number(amount).toFixed(2)'));assert.ok(!slots.some(s=>s.code==='Number(amount)'));
});
test('pattern proposals compile as data, preserve flags and keep surrounding source intact',async()=>{
 const content='export const accepts=/^old$/i;\nexport const keep=7;';const slot=sourceSlots(content,'a.js').find(s=>s.kind==='RegExpLiteral');
 await scenario({...request([]),files:[{path:'a.js',content}],edits:[{path:'a.js',slot:slot.slot,pattern:'^new/path$',flags:'i',expectedDigest:digest(content)}]},async value=>{assert.equal(value.state,'succeeded');assert.equal(value.patch.files[0].content,'export const accepts=/^new\\/path$/i;\nexport const keep=7;');});
 for(const change of [{pattern:'(',flags:'i'},{pattern:'x',flags:'g'},{content:'const replaced=true;'}])await scenario({...request([]),files:[{path:'a.js',content}],edits:[{path:'a.js',slot:slot.slot,expectedDigest:digest(content),...change}]},async(value,root)=>{assert.equal(value.state,'failed');assert.equal('patch'in value,false);assert.equal(await fs.readFile(path.join(root,'a.js'),'utf8'),content);});
});
test('a pattern capability cannot target another expression kind',async()=>{
 const content='export const sum=(a,b)=>a-b;';const slot=sourceSlots(content,'a.js').find(s=>s.kind==='BinaryExpression');
 await scenario({...request([]),files:[{path:'a.js',content}],edits:[{path:'a.js',slot:slot.slot,pattern:'x',flags:'',expectedDigest:digest(content)}]},async value=>{assert.equal(value.state,'failed');assert.equal('patch'in value,false);});
});
test('a single expression statement normalizes its semicolon without admitting declarations',async()=>{
 const content='export const sum=(a,b)=>a-b;';const slot=sourceSlots(content,'a.js').find(s=>s.kind==='BinaryExpression');
 await scenario({...request([]),files:[{path:'a.js',content}],edits:[{path:'a.js',slot:slot.slot,content:'a+b;',expectedDigest:digest(content)}]},async value=>{assert.equal(value.state,'succeeded');assert.equal(value.patch.files[0].content,'export const sum=(a,b)=>a+b;');});
 await scenario({...request([]),files:[{path:'a.js',content}],edits:[{path:'a.js',slot:slot.slot,content:'const bad=1;a+b;',expectedDigest:digest(content)}]},async(value,root)=>{assert.equal(value.state,'failed');assert.equal('patch'in value,false);assert.equal(await fs.readFile(path.join(root,'a.js'),'utf8'),content);});
});
test('dialog messages serialize only literal data and preserve the call and control flow',async()=>{
 const content="export const notify=()=>alert('old');export const keep=7;";const slot=sourceSlots(content,'a.js').find(s=>s.dialog),text="new');globalThis.DIALOG_INJECTION=true;// 💎";
 await scenario({...request([]),files:[{path:'a.js',content}],edits:[{path:'a.js',slot:slot.slot,text,expectedDigest:digest(content)}]},async value=>{assert.equal(value.state,'succeeded');assert.equal(value.patch.files[0].content,'export const notify=()=>alert('+JSON.stringify(text)+');export const keep=7;');assert.equal(globalThis.DIALOG_INJECTION,undefined);});
 const other=sourceSlots('export const sum=(a,b)=>a-b;','a.js').find(s=>s.kind==='BinaryExpression');await scenario({...request([]),files:[{path:'a.js',content:'export const sum=(a,b)=>a-b;'}],edits:[{path:'a.js',slot:other.slot,text:'wrong',expectedDigest:digest('export const sum=(a,b)=>a-b;')}]},async value=>{assert.equal(value.state,'failed');assert.equal('patch'in value,false);});
});

test('numeric locale data preserves receiver, precision, prefixes and single evaluation',async()=>{
 for(const expression of ['Number(amount).toFixed(2)','amount=>Number(amount).toFixed(2)']){
  const content='export const format='+expression+';export const keep=7;';
  const slot=sourceSlots(content,'a.js').find(s=>s.numeric);
  await scenario({...request([]),files:[{path:'a.js',content}],edits:[{path:'a.js',slot:slot.slot,locale:'pt-BR',expectedDigest:digest(content)}]},async value=>{
   assert.equal(value.state,'succeeded');const code=value.patch.files[0].content;
   assert.ok(code.endsWith(';export const keep=7;'));assert.equal((code.match(/Number\(amount\)/g)||[]).length,1);
   assert.ok(code.includes('minimumFractionDigits:2,maximumFractionDigits:2,useGrouping:false'));assert.ok(!code.includes('currency'));
  });
 }
 const content="export const App=()=> <p>EUR {Number(0).toFixed(3)}</p>;",slot=sourceSlots(content,'a.jsx').find(s=>s.numeric);
 await scenario({...request([]),files:[{path:'a.jsx',content}],writePaths:['a.jsx'],edits:[{path:'a.jsx',slot:slot.slot,locale:'de-DE',expectedDigest:digest(content)}]},async value=>{assert.equal(value.state,'succeeded');assert.match(value.patch.files[0].content,/>EUR \{/);assert.match(value.patch.files[0].content,/minimumFractionDigits:3,maximumFractionDigits:3/);});
});

test('numeric locale rejects code, unsupported shapes and stale revisions before a publishable patch',async()=>{
 const content='export const format=n=>n.toFixed(2);',slot=sourceSlots(content,'a.js').find(s=>s.numeric);
 for(const fields of [{locale:"pt-BR');globalThis.NUMERIC_INJECTED=true;//"},{locale:'pt-BR',precision:0},{locale:'pt-BR',expectedDigest:'f'.repeat(64)}])await scenario({...request([]),files:[{path:'a.js',content}],edits:[{path:'a.js',slot:slot.slot,expectedDigest:digest(content),...fields}]},async(value,root)=>{assert.equal(value.state,'failed');assert.equal('patch'in value,false);if('precision'in fields)await assert.rejects(fs.access(path.join(root,'a.js')));else assert.equal(await fs.readFile(path.join(root,'a.js'),'utf8'),content);});
 assert.equal(globalThis.NUMERIC_INJECTED,undefined);
 for(const content of ['export const format=n=>n.toFixed(precision);','export const sum=(a,b)=>a-b;']){
  const slot=sourceSlots(content,'a.js').find(s=>s.slot!=='s0');assert.equal(slot.numeric,undefined);
  await scenario({...request([]),files:[{path:'a.js',content}],edits:[{path:'a.js',slot:slot.slot,locale:'pt-BR',expectedDigest:digest(content)}]},async value=>{assert.equal(value.state,'failed');assert.equal('patch'in value,false);});
 }
});
