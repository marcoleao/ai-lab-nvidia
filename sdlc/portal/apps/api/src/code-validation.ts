import {spawn} from 'node:child_process';
import type {CodePatch,PatchIssue} from './code-schema.ts';
export const needsQualityDiagnosis=(snapshot:Record<string,unknown>,discussionVersion:number)=>Number(snapshot.qualityCycle||0)>=3&&snapshot.qualityCycleDecisionVersion===discussionVersion;
// Parse source on stdin; never import it, install dependencies or run the app.
export async function syntaxIssues(patch:CodePatch):Promise<PatchIssue[]>{
 const issues:PatchIssue[]=[];
 for(const file of patch.files){
  if(!/\.(?:js|mjs|cjs)$/.test(file.path))continue;
  const result=await new Promise<string|null>((resolve,reject)=>{
   const child=spawn(process.execPath,['--input-type='+ (file.path.endsWith('.cjs')?'commonjs':'module'),'--check'],{stdio:['pipe','ignore','pipe'],env:{}});
   let error='';const timer=setTimeout(()=>{child.kill();reject(new Error('Syntax validation timeout'));},5000);
   child.stderr.on('data',chunk=>{error=(error+String(chunk)).slice(0,8000);});
   child.on('error',err=>{clearTimeout(timer);reject(err);});
   child.on('close',code=>{clearTimeout(timer);resolve(code===0?null:error.split('\n').find(line=>line.startsWith('SyntaxError:'))||'O parser não confirmou a sintaxe.');});
   child.stdin.on('error',()=>{});child.stdin.end(file.content);
  });
  if(result)issues.push({path:file.path,code:'SYNTAX_ERROR',message:result});
 }
 return issues;
}
