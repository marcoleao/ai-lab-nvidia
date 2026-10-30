import {spawn} from 'node:child_process';
import ts from 'typescript';
import type {CodePatch,PatchIssue} from './code-schema.ts';
export function confirmedDecisionVersion(snapshot:unknown){
 const s=snapshot&&typeof snapshot==='object'?snapshot as Record<string,unknown>:{};
 const decisions=Array.isArray(s.decisions)?s.decisions:[],last=decisions.at(-1) as {discussionVersion?:unknown}|undefined;
 return Number.isSafeInteger(last?.discussionVersion)&&Number(last?.discussionVersion)>=0?Number(last?.discussionVersion):0;
}
export function needsQualityDiagnosis(snapshot:unknown){
 const s=snapshot&&typeof snapshot==='object'?snapshot as Record<string,unknown>:{};
 return Number(s.qualityCycle||0)>=3&&s.qualityCycleDecisionVersion===confirmedDecisionVersion(s);
}
// Parse source on stdin; never import it, install dependencies or run the app.
export async function syntaxIssues(patch:CodePatch):Promise<PatchIssue[]>{
 const issues:PatchIssue[]=[];
 for(const file of patch.files){
  let source=file.content;
  if(/\.(?:jsx|tsx|ts)$/.test(file.path)){
   const result=ts.transpileModule(file.content,{fileName:file.path,reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ESNext}});
   for(const diagnostic of result.diagnostics??[]){
    if(diagnostic.category!==ts.DiagnosticCategory.Error)continue;
    const position=diagnostic.file&&diagnostic.start!==undefined?diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start):null;
    issues.push({path:file.path,code:'SYNTAX_ERROR',message:`${position?`Linha ${position.line+1}: `:''}${ts.flattenDiagnosticMessageText(diagnostic.messageText,' ')}`});
   }
   if(result.diagnostics?.some(diagnostic=>diagnostic.category===ts.DiagnosticCategory.Error))continue;
   // Transpilation does not validate RegExp grammar. Parse emitted JavaScript as
   // well, without importing the module or evaluating either source version.
   source=result.outputText;
  }else if(!/\.(?:js|mjs|cjs)$/.test(file.path))continue;
  const result=await new Promise<string|null>((resolve,reject)=>{
   const child=spawn(process.execPath,['--input-type='+ (file.path.endsWith('.cjs')?'commonjs':'module'),'--check'],{stdio:['pipe','ignore','pipe'],env:{}});
   let error='';const timer=setTimeout(()=>{child.kill();reject(new Error('Syntax validation timeout'));},5000);
   child.stderr.on('data',chunk=>{error=(error+String(chunk)).slice(0,8000);});
   child.on('error',err=>{clearTimeout(timer);reject(err);});
   child.on('close',code=>{clearTimeout(timer);resolve(code===0?null:error.split('\n').find(line=>line.startsWith('SyntaxError:'))||'O parser não confirmou a sintaxe.');});
   child.stdin.on('error',()=>{});child.stdin.end(source);
  });
  if(result)issues.push({path:file.path,code:'SYNTAX_ERROR',message:result});
 }
 return issues;
}
