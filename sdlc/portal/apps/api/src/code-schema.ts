import {z} from 'zod';
export const specificationSchema=z.object({requirements:z.string().min(10).max(3000),architecture:z.string().min(10).max(3000),testCases:z.array(z.object({criterionIndex:z.number().int().min(0),description:z.string().min(10).max(500)}).strict()).min(1).max(12),risks:z.array(z.string().min(1).max(300)).max(10)}).strict();
export const codeSchema=z.object({summary:z.string().min(1).max(1000),files:z.array(z.object({path:z.string().min(1).max(180),content:z.string().min(1).max(12000)}).strict()).min(1).max(6)}).strict();
export type CodePatch=z.infer<typeof codeSchema>;
export const blockerSchema=z.object({reason:z.string().min(1).max(1500),question:z.string().min(1).max(500),options:z.array(z.string().min(1).max(300)).max(5),requestedCapabilities:z.array(z.enum(['dependencies'])).max(1)}).strict();
export const discussionSchema=z.object({reply:z.string().min(1).max(3000),ready:z.boolean(),summary:z.string().max(2000),requestedCapabilities:z.array(z.enum(['dependencies'])).max(1)}).strict();
export const codeOutputSchema={...z.toJSONSchema(z.union([codeSchema,z.object({blocker:blockerSchema}).strict(),z.object({error:z.string().min(1).max(300)}).strict()])),type:'object'};
export class DependencyPermissionRequired extends Error {}
export type PatchIssue={path:string;code:string;message:string};
export class PatchValidationError extends Error {
  constructor(public issues:PatchIssue[]){super(issues.map(i=>`${i.path}: ${i.message}`).join('; '));}
}
export const patchPolicy={maxFiles:6,maxBytes:48000,extensions:['ts','tsx','js','jsx','mjs','cjs','py','html','css','json','md'],dependencyManifests:['package.json','requirements.txt','pyproject.toml'],rules:'Caminhos relativos canônicos, sem segmentos ocultos, travessia, caminhos absolutos ou duplicação sem distinguir maiúsculas. CI, infraestrutura, ambientes e lockfiles são protegidos. Arquivos de configuração da aplicação são arquivos normais; não incluir credenciais reais.'};
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
