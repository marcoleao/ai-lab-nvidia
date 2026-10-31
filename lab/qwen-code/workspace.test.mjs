import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Workspace,RevisionEdits,digest} from './workspace.mjs';
async function scenario(files,run,options){const root=await fs.mkdtemp(path.join(os.tmpdir(),'sdlc-workspace-'));try{const workspace=new Workspace(root,files,options);await workspace.seed();await run(workspace,root);}finally{await fs.rm(root,{recursive:true,force:true});}}
test('edits use current digest, preserve Unicode and unrelated code',()=>scenario([{path:'calc.js',content:'// ação\nexport const sum=(a,b)=>a-b;\nexport const multiply=(a,b)=>a*b;\n'}],async w=>{const current=await w.read('calc.js');await w.edit('calc.js','a-b','a+b',current.sha256);assert.equal((await w.patch()).files[0].content,current.content.replace('a-b','a+b'));await assert.rejects(w.edit('calc.js','a+b','a-b',current.sha256),/mudou/);assert.equal((await w.validate()).valid,true);}));
test('ambiguous edit leaves candidate intact',()=>scenario([{path:'a.js',content:'const a=1;const b=1;'}],async w=>{await assert.rejects(w.edit('a.js','=1','=2',digest('const a=1;const b=1;')),/única/);assert.deepEqual(await w.patch(),{files:[]});}));
test('unchanged writes and edits are explicit refusals and never become a patch',()=>scenario([{path:'a.js',content:'export const a=1;'}],async w=>{const current=await w.read('a.js');await assert.rejects(w.write('a.js',current.content,current.sha256),/idêntico/);await assert.rejects(w.edit('a.js','a=1','a=1',current.sha256),/idêntico/);assert.deepEqual(await w.patch(),{files:[]});assert.equal((await w.read('a.js')).sha256,current.sha256);}));
test('numbered line edits preserve unrelated Unicode source and reject stale or cross-file revisions',()=>scenario([{path:'a.js',content:'// ação\nexport const result=1;\nexport const keep=2;\n'},{path:'b.js',content:'export const other=3;'}],async w=>{
 const revisions=new RevisionEdits(w),first=await revisions.read('a.js'),second=await revisions.read('b.js');assert.equal(first.content,'1|// ação\n2|export const result=1;\n3|export const keep=2;\n4|');assert.equal('sha256' in first,false);assert.equal((await revisions.read('a.js')).revision,first.revision);
 await assert.rejects(revisions.edit('a.js',2,2,'export const result=4;',second.revision),/outro arquivo/);assert.deepEqual(await w.patch(),{files:[]});
 const written=await revisions.edit('a.js',2,2,'export const result=4;',first.revision);assert.notEqual(written.revision,first.revision);assert.equal((await w.read('a.js')).content,'// ação\nexport const result=4;\nexport const keep=2;\n');
 await assert.rejects(revisions.edit('a.js',3,3,'export const keep=5;',first.revision),/revisão mudou/);await assert.rejects(revisions.edit('a.js',2,2,'x','r999'),/desconhecida/);assert.equal((await w.read('b.js')).content,'export const other=3;');
}));
test('line edits validate bounds, support insertion/deletion and keep complete file writes limited to new paths',()=>scenario([{path:'a.js',content:'const a=1;\nconst b=2;\n'}],async w=>{
 const revisions=new RevisionEdits(w),first=await revisions.read('a.js');
 for(const [start,end]of [[0,1],[1,99],[2,0],[1.5,2],[true,1]])await assert.rejects(revisions.edit('a.js',start,end,'x',first.revision),/Intervalo/);
 await assert.rejects(revisions.write('a.js','replacement',first.revision),/somente arquivo novo/);await assert.rejects(revisions.write('a.js','replacement',null),/fonte mudou/);
 const inserted=await revisions.edit('a.js',1,0,'// cabeçalho',first.revision);assert.equal((await w.read('a.js')).content,'// cabeçalho\nconst a=1;\nconst b=2;\n');
 await assert.rejects(revisions.edit('a.js',1,1,'',inserted.revision),/não lido/);const current=await revisions.read('a.js');await revisions.edit('a.js',1,1,'',current.revision);assert.equal((await w.read('a.js')).content,'const a=1;\nconst b=2;\n');
 const created=await revisions.write('new.js','export const n=1;',null);assert.match(created.revision,/^r\d+$/);await assert.rejects(revisions.write('../unsafe.js','x',null),/contrato/);
}));
test('large reads explicitly return an index and allow edits only in the observed query range',()=>scenario([{path:'large.js',content:Array.from({length:100},(_,index)=>`export const n${index}=${index};`).join('\n')}],async w=>{
 const revisions=new RevisionEdits(w),index=await revisions.read('large.js');assert.equal(index.complete,false);assert.equal(index.content,'');assert.equal(index.lineCount,100);assert.equal(index.symbolsLimited,true);
 await assert.rejects(revisions.edit('large.js',50,50,'export const n49=999;',index.revision),/não lido/);
 const focused=await revisions.read('large.js',{query:'n49='});assert.equal(focused.revision,index.revision);assert.match(focused.content,/50\|export const n49=49;/);assert.ok(focused.content.split('\n').length<=11);
 await assert.rejects(revisions.edit('large.js',1,1,'export const n0=8;',focused.revision),/não lido/);await revisions.edit('large.js',50,50,'export const n49=999;',focused.revision);assert.equal((await w.read('large.js')).content.split('\n')[49],'export const n49=999;');
 const unseen=await revisions.read('large.js',{query:'not present'});assert.equal(unseen.content,'');await assert.rejects(revisions.edit('large.js',50,50,'export const n49=2;',unseen.revision),/não lido/);
}));
test('focused reads cap ranges and literal matches, and a repair cannot write outside its candidate files',()=>scenario([{path:'a.js',content:'export const a=1;\n'.repeat(100)},{path:'b.js',content:'export const b=1;'}],async w=>{
 const revisions=new RevisionEdits(w),found=await revisions.read('a.js',{query:'export'});assert.equal(found.matchesLimited,true);assert.equal(found.complete,false);
 for(const options of [{startLine:1,endLine:99},{query:'',startLine:1},{startLine:0,endLine:1}])await assert.rejects(revisions.read('a.js',options));
 await assert.rejects(revisions.edit('a.js',1,1e9,'x',found.revision),/Intervalo/);
}, {writePaths:['b.js']}));
test('candidate file capability is checked for both direct writes and numbered edits',()=>scenario([{path:'a.js',content:'export const a=1;'},{path:'b.js',content:'export const b=1;'}],async w=>{
 const revisions=new RevisionEdits(w),read=await revisions.read('a.js');await assert.rejects(revisions.edit('a.js',1,1,'export const a=2;',read.revision),/fora do recorte/);await assert.rejects(revisions.write('new.js','x',null),/fora do recorte/);assert.deepEqual(await w.patch(),{files:[]});
}, {writePaths:['b.js']}));
test('concurrent edits with one revision cannot overwrite each other and a refusal does not poison later edits',()=>scenario([{path:'a.js',content:'export const a=1;'}],async w=>{
 const revisions=new RevisionEdits(w),read=await revisions.read('a.js');const results=await Promise.allSettled([revisions.edit('a.js',1,1,'export const a=2;',read.revision),revisions.edit('a.js',1,1,'export const a=3;',read.revision)]);assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'rejected');assert.match(results[1].reason.message,/revisão mudou/);assert.equal((await w.read('a.js')).content,'export const a=2;');
 const current=await revisions.read('a.js');await revisions.edit('a.js',1,1,'export const a=4;',current.revision);assert.equal((await w.read('a.js')).content,'export const a=4;');
}));
test('paths, metadata, infrastructure and lockfiles are inaccessible',()=>scenario([],async w=>{for(const name of ['../x.js','/x.js','a/../b.js','.env','.qwen/settings.json','infra/file.js','Dockerfile.js','package-lock.json','a\\b.js'])await assert.rejects(w.write(name,'x',null),/contrato/);}));
test('dependency permission is explicit',()=>scenario([{path:'package.json',content:'{}'}],async w=>{await assert.rejects(w.write('package.json','{"name":"x"}',digest('{}')),/autorização/);}));
test('new files require absence and validation never runs application code',()=>scenario([],async w=>{await w.write('a.js','globalThis.INJECTED=true;export const a=1;',null);await assert.rejects(w.write('a.js','x',null),/mudou/);assert.equal((await w.validate()).valid,true);assert.equal(globalThis.INJECTED,undefined);}));
test('symlinks cannot escape workspace',()=>scenario([],async(w,root)=>{await fs.symlink('/etc/passwd',path.join(root,'a.js'));await assert.rejects(w.read('a.js'),/simbólicos/);await assert.rejects(w.patch(),/Link/);}));
test('candidate catches missing local import',()=>scenario([{path:'src/main.jsx',content:"import {X} from './absent.jsx';export const a=<X/>;"}],async w=>{const value=await w.validate();assert.equal(value.valid,false);assert.match(value.issues[0].message,/resolve/);}));
test('JSX grammar and invalid regex are checked before publication',()=>scenario([{path:'src/main.jsx',content:'export const x= /(/;'}],async w=>{const value=await w.validate();assert.equal(value.valid,false);assert.match(value.issues[0].message,/regular expression|regex/i);}));
test('patch limits fail without partial publication',()=>scenario([],async w=>{for(let i=0;i<7;i++)await w.write(`file${i}.js`,'export const a=1;',null);await assert.rejects(w.patch(),/seis/);}));
test('tool and validation budgets bound retries',()=>scenario([],async w=>{for(let i=0;i<4;i++)await w.invoke('validate_candidate',{});await assert.rejects(w.invoke('validate_candidate',{}),/validações/);w.calls=40;await assert.rejects(w.invoke('list_files',{}),/total/);}));
test('valid Node 24 module scripts accept top-level await and stay untouched during correction',()=>scenario([{path:'scripts/build.mjs',content:"import {readFile} from 'node:fs/promises';const data=await readFile('package.json','utf8');console.log(data);"},{path:'scripts/test.mjs',content:"import assert from 'node:assert/strict';await Promise.resolve();assert.equal(2,2);"},{path:'calc.js',content:'export const sum=(a,b)=>a-b;'}],async w=>{const current=await w.read('calc.js');await w.edit('calc.js','a-b','a+b',current.sha256);const validation=await w.validate();assert.equal(validation.valid,true,JSON.stringify(validation.issues));assert.deepEqual((await w.patch()).files.map(f=>f.path),['calc.js']);}));
test('final check revalidates after the bounded interactive validations',()=>scenario([{path:'calc.js',content:'export const value=1;'}],async w=>{for(let i=0;i<4;i++)await w.validate();const current=await w.read('calc.js');await w.edit('calc.js','value=1','value=2',current.sha256);assert.equal((await w.validate(true)).valid,true);assert.equal(w.validations,4);}));
test('React entry imports CSS without requiring generated artifacts or changes to build scripts',()=>scenario([{path:'src/main.jsx',content:"import './style.css';export const App=()=> <h1>Teste</h1>;"},{path:'src/style.css',content:'h1{color:red;}'}],async(w,root)=>{const value=await w.validate();assert.equal(value.valid,true,JSON.stringify(value.issues));assert.deepEqual(await w.patch(),{files:[]});await assert.rejects(fs.stat(path.join(root,'dist')),{code:'ENOENT'});}));

test('tool paths inside the exact workspace normalize before all existing guards',()=>scenario([{path:'a.js',content:'export const a=1;'}],async(w,root)=>{
 const read=await w.invoke('read_file',{path:root+'/a.js'});assert.equal(read.path,'a.js');await w.invoke('edit_file',{path:root+'/a.js',before:'a=1',after:'a=2',expectedDigest:read.sha256});assert.equal((await w.patch()).files[0].path,'a.js');
 for(const name of [root+'-other/a.js',root+'/../a.js',root+'//etc/passwd',root+'/.env',root+'/infra/a.js','/etc/passwd'])await assert.rejects(w.invoke('read_file',{path:name}),/contrato/);
}));
