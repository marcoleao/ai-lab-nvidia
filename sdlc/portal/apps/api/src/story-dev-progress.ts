import type {Transaction} from '../../../packages/db/client.ts';
import type {StoryDevProgress} from '../../../packages/shared/src/story-dev-progress.ts';
import type {DeploymentObservation} from '../../../packages/shared/src/development-deployment.ts';
import type {AssistantHelpers} from './assistant.ts';
import {auditFingerprint} from './audit.ts';
import {loadDevelopmentApprovalFacts,developmentApprovalChecks} from './development-approvals.ts';
import {deploymentIntent,deploymentProjection} from './development-deployments.ts';
import type {DeploymentProvider} from './deployment-provider.ts';

const pending=['queued','running','paused','unknown'];
function safeUrl(value:string|null|undefined){if(!value)return null;try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?value:null;}catch{return null;}}
const inFlight=new WeakMap<AssistantHelpers,Map<string,Promise<StoryDevProgress>>>();
export function readStoryDevProgress(h:AssistantHelpers,storyId:string,expected:{storyVersion:number;executionId:string|null},provider?:DeploymentProvider):Promise<StoryDevProgress>{
 let requests=inFlight.get(h);if(!requests){requests=new Map();inFlight.set(h,requests);}
 const key=JSON.stringify([storyId,expected.storyVersion,expected.executionId]),previous=requests.get(key);if(previous)return previous;
 const reading=calculateStoryDevProgress(h,storyId,expected,provider).finally(()=>{if(requests!.get(key)===reading)requests!.delete(key);});requests.set(key,reading);return reading;
}

// The same local evidence and checks used by Development Finalized are reused.
// Remote observation happens outside a database transaction, then every local
// reference is checked again. This is navigation, never a command authorization.
async function calculateStoryDevProgress(h:AssistantHelpers,storyId:string,expected:{storyVersion:number;executionId:string|null},provider?:DeploymentProvider):Promise<StoryDevProgress>{
 async function load(tx:Transaction){
  const facts=await loadDevelopmentApprovalFacts(tx,h,storyId);
  const build=await tx.developmentBuild.findFirst({where:{storyId,state:{in:pending}},orderBy:{number:'desc'}});
  const deployment=await tx.developmentDeployment.findFirst({where:{storyId,state:{in:pending}},orderBy:{number:'desc'}});
  const test=await tx.developmentTest.findFirst({where:{storyId,state:{in:pending}},orderBy:{number:'desc'}});
  const activeDeployment=facts.deployment?await tx.developmentDeployment.findFirst({where:{environmentId:facts.deployment.environmentId,state:'succeeded'},orderBy:[{createdAt:'desc'},{id:'desc'}],select:{id:true,version:true}}):null;
  return {facts,build,deployment,test,activeDeployment};
 }
 type Reading=Awaited<ReturnType<typeof load>>;
 const signature=(v:Reading)=>auditFingerprint({version:v.facts.story.version,reference:v.facts.reference,scope:v.facts.scope.current,checks:developmentApprovalChecks(v.facts),approval:v.facts.reading.validity,activeDeployment:v.activeDeployment,build:v.build?[v.build.id,v.build.version,v.build.state]:null,deployment:v.deployment?[v.deployment.id,v.deployment.version,v.deployment.state]:null,test:v.test?[v.test.id,v.test.version,v.test.state]:null,latestTest:v.facts.test?[v.facts.test.id,v.facts.test.version,v.facts.test.state]:null});
 const before=await h.db.$transaction(load,{isolationLevel:'RepeatableRead'}),v=before.facts,checks=developmentApprovalChecks(v);
 const passed=(id:string)=>checks.some(c=>c.id===id&&c.passed),current=expected.storyVersion===v.story.version&&expected.executionId===v.run?.id&&v.scope.current;
 const base:StoryDevProgress={version:1,storyId,storyVersion:v.story.version,executionId:v.run?.id??null,state:'unknown',title:'A situação atual de DEV precisa de conferência',message:'Atualize a História para conferir a revisão, os pedidos e o destino atuais.',asOf:new Date().toISOString(),observedAt:null,liveUrl:null,nextAction:{label:'Conferir acompanhamento DEV',step:'deployment'},checks:current?checks:[],acceptance:{scope:null,covered:0,total:v.criteria.length,httpOnly:true}};
 if(!current)return base;
 const working=before.build?{operation:before.build,step:'build' as const,name:'construção'}:before.deployment?{operation:before.deployment,step:'deployment' as const,name:'publicação'}:before.test?{operation:before.test,step:'test' as const,name:'testes'}:null;
 if(working)return {...base,state:working.operation.state==='unknown'?'unknown':'working',title:working.operation.state==='unknown'?`Resultado de ${working.name} DEV não confirmado`:`Há um pedido de ${working.name} DEV em acompanhamento`,message:'Acompanhe ou verifique o mesmo pedido antes de solicitar outro. Uma operação pendente não confirma uma nova versão disponível.',nextAction:{label:`Acompanhar ${working.name} DEV`,step:working.step}};
 if(!passed('artifact'))return {...base,state:'build_required',title:'Código integrado; falta construir a versão DEV',message:'Construa o artefato da revisão integrada antes de publicar. O merge não inicia uma implantação.',nextAction:{label:'Conferir construção DEV',step:'build'}};
 if(!passed('deployment')||!v.deployment)return {...base,state:'deployment_required',title:'Artefato construído; falta publicar em DEV',message:'Confira a publicação do artefato desta revisão. Uma publicação de outro ciclo permanece no histórico.',nextAction:{label:'Conferir publicação DEV',step:'deployment'}};
 let observation:DeploymentObservation|undefined;
 if(provider){let timer:ReturnType<typeof setTimeout>|undefined;try{const seen=await Promise.race([provider.observe(deploymentIntent(v.deployment)),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Observation deadline')),1000);})]),at=Date.parse(seen.observedAt),now=Date.now();if(['healthy','unavailable','changed','unconfirmed'].includes(seen.state)&&Number.isFinite(at)&&at>=now-30000&&at<=now+5000)observation=seen;}catch{/* An unavailable observation never becomes a successful publication. */}finally{if(timer)clearTimeout(timer);}}
 const after=await h.db.$transaction(load,{isolationLevel:'RepeatableRead'});
 if(signature(before)!==signature(after))return {...base,checks:[],message:'A revisão ou um pedido mudou durante a consulta. Atualize a História antes de seguir; nenhum resultado atual foi presumido.'};
 base.observedAt=observation?.observedAt??null;
 if(!observation||observation.state==='unconfirmed')return {...base,message:'A publicação foi registrada, mas sua disponibilidade atual não foi confirmada. Confira o destino antes de navegar ou executar testes.'};
 if(observation.state==='changed'||observation.state==='healthy'&&observation.operationId!==v.deployment.id)return {...base,state:'changed',title:'O DEV compartilhado está em outra versão',message:'A publicação desta História permanece no histórico. Confira qual versão está ativa antes de navegar ou testar; não solicite outra publicação sem revisar o destino.'};
 if(observation.state==='unavailable')return {...base,state:'unavailable',title:'A aplicação não está disponível em DEV nesta observação',message:'A publicação anterior foi preservada. Confira o acompanhamento do destino antes de testar ou publicar novamente.'};
 base.liveUrl=safeUrl(observation.url||deploymentProjection(v.deployment).url);
 const t=v.test,testCurrent=!!t&&t.executionId===v.run?.id&&t.deploymentId===v.deployment.id&&t.buildId===v.build?.id&&t.sourceSha===v.build?.sourceSha&&t.imageId===v.build?.imageId&&t.archiveDigest===v.build?.archiveDigest&&t.scopeDigest===auditFingerprint(v.criteria);
 base.acceptance={scope:testCurrent?t.suiteScope as 'technical'|'acceptance':null,covered:testCurrent&&Array.isArray(t.coverage)?new Set((t.coverage as unknown[]).filter((n):n is number=>Number.isInteger(n)&&Number(n)>=0&&Number(n)<v.criteria.length)).size:0,total:v.criteria.length,httpOnly:true};
 if(v.reading.validity.state==='valid')return {...base,state:'approved',title:'Desenvolvimento Finalizado para esta revisão',message:'A aprovação de desenvolvimento está válida. A História permanece aberta até a entrega em produção; a promoção pertence à release.',nextAction:null};
 if(testCurrent&&t.state==='failed')return {...base,state:'acceptance_failed',title:'Versão em DEV; a verificação registrada foi reprovada',message:'Consulte os casos reprovados e decida se é necessária uma correção pelo ciclo existente. Uma nova execução exige sua própria conferência.',nextAction:{label:'Consultar testes DEV',step:'test'}};
 if(testCurrent&&t.state==='succeeded'&&t.result==='passed'&&t.suiteScope==='technical')return {...base,state:'technical_only',title:'Versão disponível em DEV',message:`Os testes técnicos passaram. A aceitação dos ${v.criteria.length} critérios ainda está pendente; esta suíte não registra sua cobertura de aceitação.`,nextAction:{label:'Ver pendências de aceitação',step:'approval'}};
 if(passed('acceptance'))return {...base,state:'approval_required',title:'Aceitação registrada; revise Desenvolvimento Finalizado',message:'As evidências de aceitação desta revisão estão registradas. Consulte os impedimentos e revise a aprovação explícita; testes não encerram a História.',nextAction:{label:'Revisar Desenvolvimento Finalizado',step:'approval'}};
 return {...base,state:'test_required',title:'Versão disponível em DEV; confira os testes',message:'Abra a aplicação e confira a suíte disponível para esta revisão. O perfil HTTP só comprova os critérios que consegue verificar; interações de interface exigem uma capacidade de aceite ainda não integrada.',nextAction:{label:'Conferir testes DEV',step:'test'}};
}
