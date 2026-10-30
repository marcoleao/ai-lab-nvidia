import {z} from 'zod';
export const specificationSchema=z.object({requirements:z.string().min(10).max(3000),architecture:z.string().min(10).max(3000),testCases:z.array(z.object({criterionIndex:z.number().int().min(0),description:z.string().min(10).max(500)}).strict()).min(1).max(12),risks:z.array(z.string().min(1).max(300)).max(10)}).strict();
export function specificationSchemaForCriteria(count:number){
  if(!Number.isSafeInteger(count)||count<1)throw new Error('At least one functional criterion is required');
  return specificationSchema.extend({testCases:z.array(specificationSchema.shape.testCases.element.extend({criterionIndex:z.number().int().min(0).max(count-1)})).min(1).max(12)});
}
export const codeFileCharacterLimit=20000;
export const codeSchema=z.object({summary:z.string().min(1).max(1000),files:z.array(z.object({path:z.string().min(1).max(180),content:z.string().min(1).max(codeFileCharacterLimit)}).strict()).min(1).max(6)}).strict();
export const codeEditsSchema=z.object({summary:z.string().min(1).max(1000),edits:z.array(z.object({path:z.string().min(1).max(180),before:z.string().min(1).max(4000),after:z.string().max(6000)}).strict()).min(1).max(20)}).strict();
const lineEntry=z.object({path:z.string().min(1).max(180),startLine:z.number().int().min(1).max(20001),content:z.string().max(6000)}).strict();
export const codeLineSchema=z.object({summary:z.string().min(1).max(1000),expectedSha:z.string().regex(/^[a-f0-9]{40}$/),lineEdits:z.array(lineEntry.extend({endLine:z.number().int().min(0).max(20001)})).min(1).max(20)}).strict();
// Previously returned proposals are never stored as executable intervals; their
// resolved full patch is frozen before publication. Keep parser compatibility
// while the model's schema exposes only inclusive start/end coordinates.
const acceptedLineSchema=codeLineSchema.extend({lineEdits:z.array(z.union([lineEntry.extend({endLine:z.number().int().min(0).max(20001)}),lineEntry.extend({deleteLines:z.number().int().min(0).max(20001)})])).min(1).max(20)});
export type CodePatch=z.infer<typeof codeSchema>;
export const blockerSchema=z.object({reason:z.string().min(1).max(1500),question:z.string().min(1).max(500),options:z.array(z.string().min(1).max(300)).max(5),requestedCapabilities:z.array(z.enum(['dependencies'])).max(1)}).strict();
export const discussionSchema=z.object({reply:z.string().min(1).max(3000),ready:z.boolean(),summary:z.string().max(2000),requestedCapabilities:z.array(z.enum(['dependencies'])).max(1)}).strict();
export const codeOutputSchema={...z.toJSONSchema(z.union([codeLineSchema,codeSchema,codeEditsSchema,z.object({blocker:blockerSchema}).strict(),z.object({error:z.string().min(1).max(300)}).strict()])),type:'object'};
export const codeFullOutputSchema={...z.toJSONSchema(z.union([codeSchema,z.object({blocker:blockerSchema}).strict(),z.object({error:z.string().min(1).max(300)}).strict()])),type:'object'};
export const codeLineOutputSchema={...z.toJSONSchema(z.union([codeLineSchema,z.object({blocker:blockerSchema}).strict(),z.object({error:z.string().min(1).max(300)}).strict()])),type:'object'};
export class DependencyPermissionRequired extends Error {}
export type PatchIssue={path:string;code:string;message:string};
export class PatchValidationError extends Error {
  constructor(public issues:PatchIssue[]){super(issues.map(i=>`${i.path}: ${i.message}`).join('; '));}
}
export const patchPolicy={maxFiles:6,maxFileCharacters:codeFileCharacterLimit,maxBytes:48000,extensions:['ts','tsx','js','jsx','mjs','cjs','py','html','css','json','md'],dependencyManifests:['package.json','requirements.txt','pyproject.toml'],rules:'Caminhos relativos canônicos, sem segmentos ocultos, travessia, caminhos absolutos ou duplicação sem distinguir maiúsculas. CI, infraestrutura, ambientes e lockfiles são protegidos. Arquivos de configuração da aplicação são arquivos normais; não incluir credenciais reais.'};
/** Resolve literal edits only against the observed revision; persistence and
 * Git publication still receive the same fully validated file patch. */
export function resolveGeneratedPatch(value:unknown,context:{sha?:string;files:{path:string;content:string}[]},permissions:{dependencies?:boolean}={}):CodePatch{
 if(value&&typeof value==='object'&&'lineEdits' in value){
  const accepted=acceptedLineSchema.parse(value);
  const proposal={...accepted,lineEdits:accepted.lineEdits.map(e=>'endLine' in e?{...e,deleteLines:e.endLine-e.startLine+1}:e)};
  if(!context.sha||proposal.expectedSha!==context.sha)throw new PatchValidationError([{path:'(revision)',code:'LINE_REVISION_CHANGED',message:'expectedSha precisa ser exatamente currentCodeRevision da fonte fornecida. Nenhuma alteração foi publicada.'}]);
  const paths=[...new Set(proposal.lineEdits.map(e=>e.path))],files:{path:string;content:string}[]=[];
  for(const path of paths){
   const original=context.files.find(f=>f.path===path);
   if(!original)throw new PatchValidationError([{path,code:'LINE_SOURCE_MISSING',message:'O intervalo exige um arquivo existente na revisão fornecida. Use files para criar arquivos.'}]);
   const starts=[0];for(let index=0;index<original.content.length;index++)if(original.content[index]==='\n')starts.push(index+1);
   const edits=proposal.lineEdits.filter(e=>e.path===path).sort((a,b)=>a.startLine-b.startLine);
   for(let i=0;i<edits.length;i++){
    const e=edits[i],prior=edits[i-1];
    const endLine=e.startLine+e.deleteLines-1,range=`${e.startLine}–${endLine}`;
    if(e.deleteLines<0||e.startLine>starts.length+1||endLine>starts.length)throw new PatchValidationError([{path,code:'LINE_RANGE_INVALID',message:`Intervalo ${range} fora dos limites; fonte com ${starts.length} linhas. Use início/fim inclusivos da fonte original; inserir antes de N usa startLine=N,endLine=N-1.`}]);
    if(prior&&(e.startLine===prior.startLine||e.startLine<prior.startLine+prior.deleteLines))throw new PatchValidationError([{path,code:'LINE_RANGE_OVERLAP',message:`A proposta repete ou sobrepõe os intervalos ${prior.startLine}–${prior.startLine+prior.deleteLines-1} e ${range} do mesmo arquivo. Envie uma única edição que reúna as mudanças nesse trecho, ou intervalos distintos da fonte original. Nenhuma das edições foi aplicada.`}]);
   }
   let content=original.content;
   for(const e of [...edits].reverse()){
    const start=starts[e.startLine-1]??original.content.length,end=starts[e.startLine-1+e.deleteLines]??original.content.length;
    const old=original.content.slice(start,end),eol=old.match(/\r?\n$/)?.[0]??original.content.match(/\r?\n/)?.[0]??'\n';
    const prefix=e.startLine>starts.length&&e.content?eol:'';
    const suffix=e.content&&!e.content.endsWith('\n')&&(end<original.content.length||old.endsWith('\n'))?eol:'';
    content=content.slice(0,start)+prefix+e.content+suffix+content.slice(end);
   }
   files.push({path,content});
  }
  return validatePatch({summary:proposal.summary,files},permissions);
 }
 if(!value||typeof value!=='object'||!('edits' in value))return validatePatch(value,permissions);
 const proposal=codeEditsSchema.parse(value),files=new Map<string,string>();
 for(const edit of proposal.edits){
  const original=context.files.find(f=>f.path===edit.path);
  if(!original)throw new PatchValidationError([{path:edit.path,code:'EDIT_SOURCE_MISSING',message:'Edição literal exige arquivo existente na revisão fornecida. Para criar arquivo, use files com conteúdo completo.'}]);
  const source=files.get(edit.path)??original.content,index=source.indexOf(edit.before);
  if(index<0||source.indexOf(edit.before,index+1)>=0)throw new PatchValidationError([{path:edit.path,code:'EDIT_SOURCE_AMBIGUOUS',message:'O trecho before precisa corresponder literalmente a uma única ocorrência no código atual, incluindo espaços. Nenhuma edição foi publicada.'}]);
  files.set(edit.path,source.slice(0,index)+edit.after+source.slice(index+edit.before.length));
 }
 return validatePatch({summary:proposal.summary,files:[...files].map(([path,content])=>({path,content}))},permissions);
}
export function validatePatch(value:unknown,permissions:{dependencies?:boolean}={}):CodePatch{
  const patch=codeSchema.parse(value),paths=new Set<string>(),issues:PatchIssue[]=[];
  for(const file of patch.files){
    const path=file.path;
    if(paths.has(path.toLowerCase()))issues.push({path,code:'DUPLICATE_PATH',message:'O mesmo caminho aparece mais de uma vez no patch.'});
    paths.add(path.toLowerCase());
    const dependency=/^(package\.json|requirements\.txt|pyproject\.toml)$/.test(file.path);
    if(dependency&&!permissions.dependencies)throw new DependencyPermissionRequired('Alteração de dependências requer decisão explícita do usuário.');
    if(dependency)continue;
    const segments=path.split('/'),name=segments.at(-1)!;
    if(!/^[A-Za-z0-9_-][A-Za-z0-9_./-]*$/.test(path)||segments.some(p=>!p||p==='..'||p==='.'||p.startsWith('.')))issues.push({path,code:'UNSAFE_PATH',message:'Use caminho relativo canônico sem travessia, segmentos vazios ou ocultos.'});
    else if(/^(?:Dockerfile(?:\..*)?|compose(?:\..*)?\.ya?ml|docker-compose(?:\..*)?\.ya?ml|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|uv\.lock|Pipfile\.lock|.*\.env(?:\..*)?)$/i.test(name)||segments.some(p=>['node_modules','vendor','infra','terraform'].includes(p)))issues.push({path,code:'PROTECTED_PATH',message:'Arquivo de infraestrutura, ambiente ou lockfile protegido nesta etapa.'});
    else if(!/\.(?:ts|tsx|js|jsx|mjs|cjs|py|html|css|json|md)$/.test(name))issues.push({path,code:'UNSUPPORTED_EXTENSION',message:'Extensão fora do conjunto suportado para código de aplicação.'});
  }
  if(Buffer.byteLength(JSON.stringify(patch))>48000)issues.push({path:'(patch)',code:'PATCH_SIZE_LIMIT',message:'Patch excede 48000 bytes.'});
  if(issues.length)throw new PatchValidationError(issues);
  return patch;
}

export function schemaPatchIssues(error:z.ZodError):PatchIssue[]{
 return error.issues.map(issue=>({path:issue.path.join('.'),code:'PATCH_SCHEMA',message:issue.code==='too_big'?`Campo excedeu o limite de ${String(issue.maximum)} ${issue.origin==='string'?'caracteres':'itens'}. Organize a implementação em arquivos menores, preservando os critérios aprovados.`:issue.code==='too_small'?`Campo precisa conter pelo menos ${String(issue.minimum)} ${issue.origin==='string'?'caracteres':'itens'}.`:'Campo fora do tipo ou formato permitido para geração.'}));
}
