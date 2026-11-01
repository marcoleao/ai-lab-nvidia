import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {applyCandidate,sourceSlots,inspectCandidate,missingComponents,webUrlPattern} from './patch.mjs';
import {digest} from './workspace.mjs';
const original='export const a=1;\nexport const b=2;\nexport const c=3;\n';
const request=edits=>({expectedSha:'a'.repeat(40),files:[{path:'a.js',content:original},{path:'b.js',content:'export const untouched=7;'}],allowDependencies:false,writePaths:['a.js'],edits:edits.map(e=>({path:'a.js',expectedDigest:digest(original),...e}))});

test('CSS inspection and editing use the stylesheet parser, with revision and path boundaries',async()=>{
 const content='body{margin:0;background:#fff}main{min-height:100vh}',filePath='src/app.css',slots=sourceSlots(content,filePath);
 assert.equal(slots.length,1);assert.equal(slots[0].kind,'Stylesheet');assert.deepEqual(missingComponents(content,filePath),[]);
 const edit={path:filePath,slot:slots[0].slot,content:'body{margin:0}main{min-height:100vh;background:#ddeeff}',expectedDigest:digest(content)};
 const input={expectedSha:'a'.repeat(40),files:[{path:filePath,content}],allowDependencies:false,writePaths:[filePath],edits:[edit]};
 await scenario(input,result=>{assert.equal(result.state,'succeeded',result.error);assert.equal(result.patch.files[0].content,edit.content);});
 await scenario({...input,edits:[{...edit,expectedDigest:'b'.repeat(64)}]},result=>assert.equal(result.state,'failed'));
 await scenario({...input,writePaths:['src/App.jsx']},result=>assert.equal(result.state,'failed'));
});

test('small React function can add state but cannot rename the declaration or append external code',async()=>{
 const content="import React from 'react';export default function App(){return <main>Inicial</main>;}const keep=7;",filePath='src/App.jsx';
 const slot=sourceSlots(content,filePath).find(s=>s.kind==='FunctionDeclaration');assert.equal(slot.binding,'App');
 const replacement="function App(){const [value,setValue]=React.useState('A');return <main><label>Escolha<select value={value} onChange={e=>setValue(e.target.value)}><option>A</option><option>B</option></select></label><p>{value}</p></main>;}";
 const input={expectedSha:'a'.repeat(40),files:[{path:filePath,content}],allowDependencies:false,writePaths:[filePath],edits:[{path:filePath,slot:slot.slot,content:replacement,expectedDigest:digest(content)}]};
 await scenario(input,result=>{assert.equal(result.state,'succeeded',result.error);assert.equal(result.patch.files[0].content,"import React from 'react';export default "+replacement+'const keep=7;');});
 for(const invalid of [replacement.replace('function App','function Other'),replacement+'globalThis.changed=true;',"import x from 'external';"+replacement])await scenario({...input,edits:[{...input.edits[0],content:invalid}]},result=>assert.equal(result.state,'failed'));
});

test('invalid source inspection returns a bounded refusal instead of terminating the compiler',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'sdlc-inspection-refused-'));
 try{const result=await inspectCandidate({expectedSha:'a'.repeat(40),files:[{path:'src/a.jsx',content:'function {'}],inspectPath:'src/a.jsx'},directory);assert.equal(result.state,'failed');assert.equal(result.diagnosticCode,'SOURCE_INSPECTION_FAILED');assert.equal('slots' in result,false);assert.equal('stack' in result,false);}finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('web URL policy builds bounded host, port, extension and query syntax without project code',()=>{
 const policy={schemes:['http','https'],allowPort:true,allowQuery:true,extensions:['svg','png']};const regex=new RegExp(webUrlPattern(policy),'i');
 for(const url of ['http://127.0.0.1:8049/a.svg','https://another.test/folder/a.png?x=2','http://localhost/a.svg'])assert.equal(regex.test(url),true,url);
 for(const url of ['javascript:alert(1)','https://user@another.test/a.svg','https://another.test/a.exe','https://another.test/a.svg\n','https://another.test/a.svg#fragment','https://another.test:xx/a.svg','https://[::1]/a.svg'])assert.equal(regex.test(url),false,url);
 const restricted=new RegExp(webUrlPattern({...policy,schemes:['https'],allowPort:false,allowQuery:false}));
 for(const url of ['http://another.test/a.svg','https://another.test:8049/a.svg','https://another.test/a.svg?x=2'])assert.equal(restricted.test(url),false,url);
 assert.equal(new RegExp(webUrlPattern({...policy,extensions:[]})).test('https://another.test'),true);
 for(const invalid of [{...policy,schemes:['javascript']},{...policy,extensions:["svg);evil()"]},{...policy,allowPort:1},{...policy,host:'fixed.test'},{...policy,schemes:['http','http']}])assert.throws(()=>webUrlPattern(invalid));
});
test('URL policy edits only the observed regex, refuses mismatches/stale source and is replayable',async()=>{
 const content='export const validate=/^https:\\/\\/.*\\.png$/i;export const keep=7;',slot=sourceSlots(content,'a.js').find(s=>s.kind==='RegExpLiteral');
 const urlPolicy={schemes:['http','https'],allowPort:true,allowQuery:true,extensions:['svg','png']};
 const edit={path:'a.js',slot:slot.slot,urlPolicy,flags:'i',expectedDigest:digest(content),examples:[{value:'http://127.0.0.1:8049/a.svg',expected:true},{value:'javascript:alert(1)',expected:false}]};
 const input={...request([]),files:[{path:'a.js',content}],edits:[edit]};let patch;
 await scenario(input,async value=>{assert.equal(value.state,'succeeded');patch=value.patch;assert.equal(value.patch.files[0].content,content.replace(slot.code,new RegExp(webUrlPattern(urlPolicy),'i').toString()));});
 await scenario(input,async value=>assert.deepEqual(value.patch,patch));
 for(const change of [{expectedDigest:'f'.repeat(64)},{urlPolicy:{...urlPolicy,schemes:['https']}},{flags:'m'}])await scenario({...input,edits:[{...edit,...change}]},async(value,root)=>{assert.equal(value.state,'failed');assert.equal('patch'in value,false);assert.equal(await fs.readFile(path.join(root,'a.js'),'utf8'),content);assert.equal(value.tools.some(event=>event.tool==='write_file'),false);});
 const nonRegex='export const sum=(a,b)=>a-b;',other=sourceSlots(nonRegex,'a.js').find(s=>s.kind==='BinaryExpression');
 await scenario({...input,files:[{path:'a.js',content:nonRegex}],edits:[{...edit,slot:other.slot,expectedDigest:digest(nonRegex)}]},async value=>assert.equal(value.state,'failed'));
});
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

test('fragment parse failures retain bounded parser location for a scoped syntax repair without writing',async()=>{
 const content='export const result=sum(1,2);';const slot=sourceSlots(content,'a.js').find(s=>s.kind==='CallExpression');
 await scenario({...request([]),files:[{path:'a.js',content}],edits:[{path:'a.js',slot:slot.slot,content:'sum(1,2',expectedDigest:digest(content)}]},async(value,root)=>{assert.equal(value.state,'failed');assert.equal('patch'in value,false);assert.ok(value.fragmentSyntaxIssue.message.length<=300);assert.equal(value.fragmentSyntaxIssue.line,1);assert.equal(typeof value.fragmentSyntaxIssue.column,'number');assert.equal(await fs.readFile(path.join(root,'a.js'),'utf8'),content);});
});

test('pattern examples refuse semantic mismatches before writing and preserve global flags independently',async()=>{
 const content='globalThis.PATTERN_PROJECT_EXECUTED=true;export const accepts=/^old$/g;';
 const slot=sourceSlots(content,'a.js').find(s=>s.kind==='RegExpLiteral');
 const base={...request([]),files:[{path:'a.js',content}],edits:[{path:'a.js',slot:slot.slot,pattern:'^https?://',flags:'g',expectedDigest:digest(content),examples:[{value:'http://127.0.0.1:8049/jewel.svg',expected:true},{value:'http://127.0.0.1:8049/jewel.svg',expected:true},{value:'javascript:alert(1)',expected:false}]}]};
 await scenario(base,async value=>{assert.equal(value.state,'succeeded');assert.equal(value.patternChecks.length,3);assert.ok(value.patternChecks.every(check=>check.passed));assert.equal(globalThis.PATTERN_PROJECT_EXECUTED,undefined);});
 await scenario({...base,edits:[{...base.edits[0],pattern:'^https://'}]},async(value,root)=>{assert.equal(value.state,'failed');assert.equal('patch'in value,false);assert.equal(value.patternChecks[0].observed,false);assert.equal(await fs.readFile(path.join(root,'a.js'),'utf8'),content);assert.equal(value.tools.some(event=>event.tool==='write_file'),false);});
 for(const examples of [[{value:'x',expected:1}],[{value:'x',expected:true,pattern:'override'}],Array.from({length:9},()=>({value:'x',expected:true}))])await scenario({...base,edits:[{...base.edits[0],examples}]},async value=>{assert.equal(value.state,'failed');assert.equal('patch'in value,false);});
});
test('a single expression statement normalizes its semicolon without admitting declarations',async()=>{
 const content='export const sum=(a,b)=>a-b;';const slot=sourceSlots(content,'a.js').find(s=>s.kind==='BinaryExpression');
 await scenario({...request([]),files:[{path:'a.js',content}],edits:[{path:'a.js',slot:slot.slot,content:'a+b;',expectedDigest:digest(content)}]},async value=>{assert.equal(value.state,'succeeded');assert.equal(value.patch.files[0].content,'export const sum=(a,b)=>a+b;');});
 await scenario({...request([]),files:[{path:'a.js',content}],edits:[{path:'a.js',slot:slot.slot,content:'const bad=1;a+b;',expectedDigest:digest(content)}]},async(value,root)=>{assert.equal(value.state,'failed');assert.equal('patch'in value,false);assert.equal(await fs.readFile(path.join(root,'a.js'),'utf8'),content);});
});
test('inline layout confines geometry edits to the observed style and preserves state and handlers',async()=>{
 const content="import React from 'react';export default function App(){const[color,setColor]=React.useState('#FFFFFF');return <main style={{backgroundColor:color,fontFamily:'Arial'}} onClick={()=>setColor('#DDEEFF')}><h1>Hello</h1></main>}";
 const slot=sourceSlots(content,'src/App.jsx').find(s=>s.kind==='InlineStyle');assert.ok(slot);assert.equal(sourceSlots('const x={display:1};','a.js').some(s=>s.kind==='InlineStyle'),false);
 for(const zero of ['0',"'0'"]){const replacement="{backgroundColor:color,fontFamily:'Arial',position:'absolute',inset:"+zero+",minHeight:'100vh',display:'flex',flexDirection:'column'}";await scenario({...request([]),files:[{path:'src/App.jsx',content}],writePaths:['src/App.jsx'],edits:[{path:'src/App.jsx',slot:slot.slot,content:replacement,expectedDigest:digest(content)}]},async value=>{assert.equal(value.state,'succeeded');assert.equal(value.patch.files[0].content,content.replace(slot.code,replacement));});}
 for(const replacement of ["{backgroundColor:'red',fontFamily:'Arial'}","{backgroundColor:color}","{backgroundColor:color,fontFamily:'Arial',position:eval('fixed')}","{...other}","{backgroundColor:color,fontFamily:'Arial',backgroundImage:'url(http://outside)'}"]){
  await scenario({...request([]),files:[{path:'src/App.jsx',content}],writePaths:['src/App.jsx'],edits:[{path:'src/App.jsx',slot:slot.slot,content:replacement,expectedDigest:digest(content)}]},async value=>{assert.equal(value.state,'failed');assert.equal('patch'in value,false);});
 }
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

test('geometry data merges only permitted values and preserves original state expressions and source',async()=>{
 const contents=["export function App(){return <main style={{backgroundColor:color,fontFamily:font}}>Preserved</main>}","export function App(){return <main style={{'minHeight':'100vh',color:palette.primary, /* keep */}}>Preserved</main>}","export function App(){return <main style={{}}>Preserved</main>}"];
 for(const content of contents){
  const slot=sourceSlots(content,'a.jsx').find(s=>s.kind==='InlineStyle');assert.equal(slot.element,'main');const input={...request([]),files:[{path:'a.jsx',content}],writePaths:['a.jsx'],edits:[{path:'a.jsx',slot:slot.slot,geometry:{minHeight:'100dvh',display:'flow-root'},expectedDigest:digest(content)}]};let first;
  for(let attempt=0;attempt<2;attempt++)await scenario(input,async value=>{assert.equal(value.state,'succeeded');const changed=value.patch.files[0].content;assert.ok(changed.includes('"100dvh"'));assert.ok(changed.includes('"display":"flow-root"'));assert.ok(changed.endsWith('>Preserved</main>}'));if(content.includes('backgroundColor'))assert.ok(changed.includes('backgroundColor:color,fontFamily:font'));if(content.includes('palette.primary'))assert.ok(changed.includes('palette.primary')&&changed.includes('/* keep */'));if(attempt===0)first=changed;else assert.equal(changed,first);});
 }
});
test('geometry rejects unsupported properties, executable values, stale source and wrong slots without writing',async()=>{
 const content='export function App(){return <main style={{color:palette.primary}}/>}',slot=sourceSlots(content,'a.jsx').find(s=>s.kind==='InlineStyle');
 for(const fields of [{geometry:{color:'red'}},{geometry:{height:'calc(evil())'}},{geometry:{margin:true}},{geometry:{}},{geometry:{margin:0},content:'{}'},{geometry:{margin:0},expectedDigest:'f'.repeat(64)}])await scenario({...request([]),files:[{path:'a.jsx',content}],writePaths:['a.jsx'],edits:[{path:'a.jsx',slot:slot.slot,expectedDigest:digest(content),...fields}]},async(value,root)=>{assert.equal(value.state,'failed');assert.equal('patch'in value,false);try{assert.equal(await fs.readFile(path.join(root,'a.jsx'),'utf8'),content);}catch(error){if(error.code!=='ENOENT')throw error;}});
 const other='export const sum=(a,b)=>a-b;',expression=sourceSlots(other,'a.js').find(s=>s.kind==='BinaryExpression');await scenario({...request([]),files:[{path:'a.js',content:other}],edits:[{path:'a.js',slot:expression.slot,geometry:{margin:0},expectedDigest:digest(other)}]},async(value,root)=>{assert.equal(value.state,'failed');assert.equal(await fs.readFile(path.join(root,'a.js'),'utf8'),other);});
});

test('import edits cannot remove names still referenced by the candidate, but coordinated renames and unused removal remain possible',async()=>{
 const content="import {useState} from 'react';export function App(){return useState(0);}",slots=sourceSlots(content,'a.jsx'),importSlot=slots.find(s=>s.kind==='ImportDeclaration'),call=slots.find(s=>s.code==='useState(0)');
 const input={...request([]),files:[{path:'a.jsx',content}],writePaths:['a.jsx']};
 await scenario({...input,edits:[{path:'a.jsx',slot:importSlot.slot,content:"import {useReducer} from 'react';",expectedDigest:digest(content)}]},async(value,root)=>{assert.equal(value.state,'failed');assert.match(value.error,/useState/);assert.equal('patch'in value,false);assert.equal(await fs.readFile(path.join(root,'a.jsx'),'utf8'),content);});
 await scenario({...input,edits:[{path:'a.jsx',slot:importSlot.slot,content:"import {useState as state} from 'react';",expectedDigest:digest(content)},{path:'a.jsx',slot:call.slot,content:'state(0)',expectedDigest:digest(content)}]},async value=>{assert.equal(value.state,'succeeded',value.error);assert.ok(value.patch.files[0].content.includes('return state(0)'));});
 const unused="import {useState} from 'react';export function App(){return null;}",unusedSlot=sourceSlots(unused,'a.jsx').find(s=>s.kind==='ImportDeclaration');
 await scenario({...input,files:[{path:'a.jsx',content:unused}],edits:[{path:'a.jsx',slot:unusedSlot.slot,content:'',expectedDigest:digest(unused)}]},async value=>{assert.equal(value.state,'succeeded',value.error);assert.equal(value.patch.files[0].content,'export function App(){return null;}');});
});
