import {test} from 'vitest';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LocalCodingProvider,technicalCodingFailure} from '../apps/api/src/coding-provider.ts';
const input={attempt:'attempt-1',expectedSha:'a'.repeat(40),files:[{path:'a.js',content:'export const a=1;'}],prompt:'Approved scope',allowDependencies:false};
async function scenario(run:(provider:LocalCodingProvider,requests:any[])=>Promise<void>,respond:(body:any,index:number)=>unknown){const directory=await mkdtemp(join(tmpdir(),'coding-provider-'));const requests:any[]=[];const server=createServer(async(req,res)=>{const chunks=[];for await(const chunk of req)chunks.push(chunk);let body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):{id:req.url?.split('/').at(-1),expectedSha:input.expectedSha};requests.push(body);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({policy:'qwen-code-node24-v1',imageId:'sha256:'+ 'e'.repeat(64),model:'isolated-model',...respond(body,requests.length) as object}));});await new Promise<void>(resolve=>server.listen(join(directory,'executor.sock'),resolve));try{await run(new LocalCodingProvider(join(directory,'executor.sock'),async()=>{}),requests);}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(directory,{recursive:true,force:true});}}
test('same attempt reconciles one immutable intent and returns validated patch',()=>scenario(async(provider,requests)=>{const value=await provider.generate(input),patch=JSON.parse(value.content);assert.equal(patch.files[0].content,'export const a=2;');assert.equal(value.evidence.expectedSha,input.expectedSha);assert.equal(requests[0].id,requests[1].id);assert.equal(requests[0].expectedSha,input.expectedSha);assert.equal(requests[0].allowDependencies,false);},(body,index)=>({...body,state:index===1?'running':'succeeded',patch:{summary:'Changed a',files:[{path:'a.js',content:'export const a=2;'}]},validation:{valid:true}})));

test('specialist progress is bounded metadata and never changes the immutable intent',()=>scenario(async(provider,requests)=>{const stages:string[]=[],testContext={objective:'Cadastrar',behavior:'Conferir o resultado',criteria:['Resultado visível'],testCases:[{criterionIndex:0,description:'Conferir o resultado na tela'}]};await provider.generate({...input,testContext},async stage=>{stages.push(stage);});assert.deepEqual(stages,['implementation','test_planning','ui_validation','targeted_repair','final_check']);assert.equal(requests.length,6);assert.deepEqual(requests[0].testContext,testContext);assert.ok(requests.every(r=>r.id===requests[0].id));assert.equal('onProgress' in requests[0],false);},(body,index)=>({...body,state:index===6?'succeeded':'running',stage:['implementation','implementation','test_planning','ui_validation','targeted_repair','final_check'][index-1],patch:{summary:'Changed a',files:[{path:'a.js',content:'export const a=2;'}]},validation:{valid:true}})));
test('unknown receipt never starts replacement job',()=>scenario(async(provider,requests)=>{await assert.rejects(provider.generate(input),{code:'CODING_EXECUTOR_UNKNOWN'});assert.equal(requests.length,1);},body=>({...body,state:'unknown'})));

test('unconfirmed technical generation requires explicit proof the publisher was not started',()=>{
 for(const code of ['CODING_EXECUTOR_UNKNOWN','CODING_EXECUTOR_TIMEOUT','CODING_EXECUTOR_UNAVAILABLE']){
  assert.equal(technicalCodingFailure({codingFailure:{code}}),null);
  assert.equal(technicalCodingFailure({codingFailure:{code,publication:'started'}}),null);
  assert.equal(technicalCodingFailure({codingFailure:{code,publication:'not_started'}}),code);
 }
 assert.equal(technicalCodingFailure({codingFailure:{code:'CODING_EXECUTOR_FAILED'}}),'CODING_EXECUTOR_FAILED');
 assert.equal(technicalCodingFailure({codingFailure:{code:'DEPENDENCY_PERMISSION_REQUIRED',publication:'not_started'}}),null);
});
test('changed revision and incomplete validation cannot publish',async()=>{await scenario(async p=>{await assert.rejects(p.generate(input),{code:'CODING_EXECUTOR_IDENTITY'});},b=>({...b,expectedSha:'b'.repeat(40),state:'succeeded'}));await scenario(async p=>{await assert.rejects(p.generate(input),{code:'CODING_EXECUTOR_INVALID'});},b=>({...b,state:'succeeded',patch:{summary:'Change',files:[{path:'a.js',content:'x'}]},validation:{valid:false}}));});
test('business blocker remains a decision with no patch',()=>scenario(async p=>{const value=JSON.parse((await p.generate(input)).content);assert.ok('blocker' in value);assert.equal('files' in value,false);},b=>({...b,state:'waiting_input',blocker:{reason:'Dependência não autorizada',question:'Autorizar a dependência?',options:[],requestedCapabilities:['dependencies']}})));

test('React candidates require the final browser proof and retain its image reference',async()=>{
 const react={...input,files:[{path:'src/main.jsx',content:'render();'}]},success=(b:any)=>({...b,state:'succeeded',patch:{summary:'Render app',files:[{path:'src/main.jsx',content:'renderApp();'}]},validation:{valid:true}});
 await scenario(async p=>{await assert.rejects(p.generate(react),{code:'CODING_EXECUTOR_INVALID'});},success);
 await scenario(async p=>{await assert.rejects(p.generate(react),{code:'CODING_EXECUTOR_INVALID'});},b=>({...success(b),browserImageId:'sha256:'+'f'.repeat(64),browserChecks:[{applicable:true,passed:true},{applicable:true,passed:false}]}));
 await scenario(async p=>{const value=await p.generate(react);assert.deepEqual(value.evidence.browser,{imageId:'sha256:'+'f'.repeat(64),scope:'react-entry-v1',passed:true});},b=>({...success(b),browserImageId:'sha256:'+'f'.repeat(64),browserChecks:[{applicable:true,passed:false},{applicable:true,passed:true}]}));
});
