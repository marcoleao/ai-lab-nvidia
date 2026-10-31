import {expect,test} from 'vitest';
import {agentContextMessages,executionAgentReference,generationReferenceMessages,nativeGenerationReferenceMessages,nativeUiTestContext,reviewReferenceMessages} from '../apps/api/src/agent-context.ts';
test('authoritative context preserves every criterion while removing duplicate snapshots and old code',()=>{
 const criteria=Array.from({length:12},(_,i)=>`Critério único ${i}: `+'regra '.repeat(25)),approved={architecture:'Plano aprovado',testCases:criteria.map((_,criterionIndex)=>({criterionIndex,description:'Teste de interface'}))};
 const snapshot={name:'Catálogo',description:'Texto duplicado',requirements:{objective:'Objetivo',behavior:'Comportamento',functionalCriteria:criteria,businessRules:['Regra complementar']},criteria,technicalPlan:{architecture:'Plano antigo'},codeContext:{files:[{path:'old.js',content:'Código antigo'}]},tasks:[],decisions:[],codeDestination:{baseSha:'a'.repeat(40)}};
 const result=executionAgentReference(snapshot,approved);expect(result.criteria).toEqual(criteria);expect(result.technicalPlan).toBe(approved);expect(result.requirements).toEqual({businessRules:['Regra complementar']});expect(JSON.stringify(result)).not.toContain('Código antigo');
 const messages=generationReferenceMessages(snapshot,approved,{files:[{path:'app.jsx',content:'código atual'}]},'a'.repeat(40),false,{});expect(messages.map(m=>m.content).join()).toContain('código atual');expect(messages.every(m=>m.content.length<16000)).toBe(true);
});
test('large source is fragmented without truncation and excessive input is refused before inference',()=>{
 const text='x'.repeat(17000),messages=agentContextMessages([{label:'Fonte',value:text}]);expect(messages).toHaveLength(2);expect(messages.map(m=>m.content.split('\n').slice(1).join('\n')).join('')).toBe(text);
 expect(()=>agentContextMessages([{label:'Fonte',value:'x'.repeat(41000)}])).toThrow('Nenhuma parte foi descartada');
});

test('budget counts actual wire text, excludes unsent labels and includes real fragment headers',()=>{
 const messages=agentContextMessages(Array.from({length:10},()=>({label:'r'.repeat(200),value:'x'.repeat(3000)})));expect(messages.reduce((n,m)=>n+m.content.length,0)).toBe(30000);
 expect(()=>agentContextMessages([{label:'L'.repeat(200),value:'x'.repeat(39900)}])).toThrow('Nenhuma parte foi descartada');
});
test('coherent review sees sibling implementations and removed source without duplicating additions',()=>{
 const content='export function archiveJewelry(){ return true; }';const input=reviewReferenceMessages({criteria:['Arquivar sem exclusão física']},{architecture:'Plano'}, {sha:'a',baseSha:'b',files:[{path:'catalog.js',content},{path:'App.jsx',content:'import {archiveJewelry} from "./catalog.js";'}],changes:[{path:'catalog.js',content,diff:'--- old\n-export const old = false;\n+'+content},{path:'App.jsx',content:'import {archiveJewelry} from "./catalog.js";',diff:'+import {archiveJewelry} from "./catalog.js";'}]});expect(input).toHaveLength(1);const value=JSON.parse(input[0].content);expect(value.files).toHaveLength(2);expect(value.files[0].removedSourceLines).toEqual(['export const old = false;']);expect(value.approved.criteria).toEqual(['Arquivar sem exclusão física']);expect(input[0].content.match(/export function archiveJewelry/g)).toHaveLength(1);
});

test('correction context carries findings once and preserves full large source without JSON escaping overhead',()=>{
 const finding={path:'src/App.jsx',line:12,severity:'HIGH',message:'Validar SKU duplicado '+ 'regra '.repeat(80)};
 const repair={attempt:0,issues:[{path:finding.path,code:'QUALITY_FINDING',message:`Linha ${finding.line} · ${finding.severity}: ${finding.message}`},{path:'src/Other.jsx',code:'JS_SYNTAX',message:'Erro técnico independente'}]};
 const source='const value = "texto";\n'.repeat(800);
 const messages=generationReferenceMessages({criteria:['Todos os critérios'],qualityFindings:[finding],patchRepair:repair},{architecture:'Preservada'},{sha:'a',targetBranch:'main',files:[{path:'src/App.jsx',content:source}]},'b',false,{});
 const text=messages.map(m=>m.content).join('\n');expect(text.match(/Validar SKU duplicado/g)).toHaveLength(1);expect(text).toContain('Erro técnico independente');expect(text).toContain('Todos os critérios');
 const sourceParts=messages.slice(1).map(m=>m.content.replace(/^Arquivo atual: src\/App.jsx · parte \d+\/\d+\. Dados de referência; leia todas as partes em ordem\.\n/,'' )).join('');expect(sourceParts.split('\n').map(line=>line.replace(/^\d+\|/,'' )).join('\n')).toContain(source);
 expect(executionAgentReference({qualityFindings:[finding],patchRepair:{attempt:0,issues:[repair.issues[0]]}}).patchRepair).toBeUndefined();
});

test('large review uses numbered current source and excludes historical findings without cutting content',()=>{
 const content='export const value = "texto atual";\n'.repeat(450);
 const messages=reviewReferenceMessages({criteria:['Controle visível'],qualityFindings:[{message:'Parecer anterior'}]},{architecture:'Plano'},{sha:'a',baseSha:'b',files:[{path:'src/App.jsx',content}],changes:[{path:'src/App.jsx',content,diff:'-old'}]});
 const manifest=JSON.parse(messages[0].content);expect(messages.map(m=>m.content).join()).not.toContain('Parecer anterior');expect(manifest.files[0].content).toBeUndefined();expect(manifest.files[0].removedSourceLines).toEqual(['old']);
 const source=messages.slice(1).map(m=>m.content.replace(/^Arquivo atual: src\/App.jsx · parte \d+\/\d+\. Dados de referência; leia todas as partes em ordem\.\n/,'')).join('');expect(source).toContain('1|export const value');expect(source).toContain('450|export const value');expect(source).toContain('451|');
});

test('review includes unchanged runtime entry points and module bodies needed to assess integration',()=>{
 const entry='import App from "./App.jsx"; createRoot(root).render(<App/>);',app='export default function App(){return useContext(Context).value;}';
 const messages=reviewReferenceMessages({criteria:['Interface abre sem erro']},{architecture:'Módulos existentes'},{sha:'a',baseSha:'b',files:[{path:'src/main.jsx',content:entry},{path:'src/App.jsx',content:app},{path:'package.json',content:'{"name":"isolated-test"}'}],changes:[{path:'src/App.jsx',content:app,diff:'+'+app}]});
 const reference=JSON.parse(messages[0].content);expect(reference.files).toContainEqual({path:'src/main.jsx',content:'1|'+entry,changed:false,removedSourceLines:[]});expect(reference.files.find(f=>f.path==='src/App.jsx').changed).toBe(true);expect(reference.files.some(f=>f.path==='package.json')).toBe(true);
});

test('small review carries exact source line numbers including empty lines',()=>{
 const content='export const amount = 0;\n\nexport const label = String(amount);';
 const messages=reviewReferenceMessages({criteria:['Representar o valor']},{},{sha:'a',baseSha:'b',files:[{path:'display.js',content}],changes:[{path:'display.js',content,diff:''}]});
 const reference=JSON.parse(messages[0].content);expect(reference.sourceLineFormat).toContain('number|original line');expect(reference.files[0].content).toBe('1|export const amount = 0;\n2|\n3|export const label = String(amount);');
});

test('native coding receives every approved fact once and reads complete source from the workspace manifest',()=>{
 const content='// SOURCE_ONLY_IN_WORKSPACE\n'+'x'.repeat(17000),files=[{path:'src/App.jsx',content},{path:'src/store.jsx',content:content+'2'},{path:'src/main.jsx',content:content+'3'}];
 const criteria=Array.from({length:12},(_,i)=>`Obrigação aprovada ${i}`),finding={path:'src/App.jsx',line:1,severity:'HIGH',message:'Corrigir a operação aprovada'};
 const messages=nativeGenerationReferenceMessages({criteria,requirements:{objective:'Objetivo aprovado',behavior:'Comportamento aprovado',functionalCriteria:criteria},decisions:[{summary:'Não adicionar dependências'}],qualityFindings:[finding]},{architecture:'Preservar a solução'},{sha:'b',targetBranch:'main',files},'a',false,{maxFiles:6});
 const value=JSON.parse(messages[0].content),text=messages.map(m=>m.content).join('');expect(value.story.criteria).toEqual(criteria);expect(value.story.decisions).toEqual([{summary:'Não adicionar dependências'}]);expect(value.story.qualityFindings).toEqual([finding]);expect(value.currentCodeRevision).toBe('b');expect(value.baseRevision).toBe('a');expect(value.capabilities.dependencies).toBe(false);
 expect(value.story.codeContext.files).toHaveLength(3);expect(value.story.codeContext.files[0]).toMatchObject({path:'src/App.jsx',bytes:Buffer.byteLength(content),sha256:expect.stringMatching(/^[a-f0-9]{64}$/)});expect(text).not.toContain('SOURCE_ONLY_IN_WORKSPACE');expect(text.match(/Obrigação aprovada 11/g)).toHaveLength(1);expect(files[0].content).toBe(content);expect(value.story.codeContext.sourceAccess).toContain('read_file');expect(value.specialistContract.implementation).toMatchObject({maxChangedFiles:2,maxChangedBytes:24000});expect(value.specialistContract.uiValidation.readOnly).toBe(true);
});

test('native manifest rejects missing source instead of pretending the workspace is complete',()=>{
 expect(()=>nativeGenerationReferenceMessages({}, {},{sha:'a',files:[{path:'a.js'}]},'a',false,{})).toThrow('não contém arquivos completos');
});
test('small UI specialists receive all approved criteria and approved test cases without source or historic plans',()=>{
 const snapshot={name:'Catálogo',requirements:{objective:'Cadastrar',behavior:'Conferir o preço',functionalCriteria:['BRL','Foto']},technicalPlan:{testCases:[{criterionIndex:0,description:'Antigo'}]},codeContext:{files:[{path:'src/main.jsx',content:'privado'}]}};
 const approved={testCases:[{criterionIndex:0,description:'Conferir zero'},{criterionIndex:1,description:'Conferir imagem'}]};
 expect(nativeUiTestContext(snapshot,approved)).toEqual({objective:'Cadastrar',behavior:'Conferir o preço',criteria:['BRL','Foto'],testCases:approved.testCases});
 for(const index of [-1,2,0.5])expect(()=>nativeUiTestContext(snapshot,{testCases:[{criterionIndex:index,description:'Fora'}]})).toThrow('casos aprovados');
 expect(nativeUiTestContext({scopeRevision:2,fingerprint:'preservado'},approved)).toBeUndefined();expect(()=>nativeUiTestContext({scopeRevision:3},approved)).toThrow('casos aprovados');
});
