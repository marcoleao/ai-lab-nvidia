import type {Page} from '@playwright/test';
import type {StoryDevProgress} from '../../packages/shared/src/story-dev-progress';
import type {DevelopmentBuildContext,DevelopmentBuildOperation,DevelopmentBuildReading} from '../../packages/shared/src/development-build';
import type {DevelopmentApprovalContext,DevelopmentApprovalReading} from '../../packages/shared/src/development-approval';
import type {DevelopmentTestOperation,DevelopmentTestReading} from '../../packages/shared/src/development-test';
import {storyDeliveryReading} from '../../packages/shared/src/story-delivery';
import {storyLifecycleReading} from '../../packages/shared/src/story-lifecycle-reading';
import {mockPersonas,mockTaskCollection,uiJourney} from './journey-fixtures';

// Complete interception: the deployed application and all workflow readings are
// isolated browser fixtures. Navigation must never send a domain command.
export const storyId='summary-story-isolated',stamp='2026-10-31T19:00:00.000Z';
const sha='a'.repeat(40),image='sha256:'+'b'.repeat(64),digest='c'.repeat(64);
export const appUrl='http://dev.summary.test:34991';

export async function fixture(page:Page){
  const common={description:'Somente dados interceptados para navegação.',version:7,archived:false,data:{},createdAt:stamp,updatedAt:stamp};
  const system={...common,id:'summary-system',kind:'system',key:'SUMSYS',name:'Sistema isolado',status:'active',parentId:null};
  const project={...common,id:'summary-project',kind:'project',key:'SUMPRJ',name:'Projeto isolado',status:'active',parentId:system.id};
  const epic={...common,id:'summary-epic',kind:'epic',key:'SUMEPC',name:'Épico isolado',status:'active',parentId:project.id};
  const story={...common,id:storyId,kind:'story',key:'SUM-1',name:'Hello World com configuração visual',status:'testing',parentId:epic.id};
  const task={...common,id:'summary-merge-task',kind:'task',key:'SUM-T',name:'Merge de Código',status:'done',parentId:story.id,managed:true,processOwned:true};
  const progress:StoryDevProgress={version:1,storyId,storyVersion:7,executionId:'summary-run',state:'technical_only',title:'Versão disponível em DEV',message:'As quatro verificações técnicas passaram. O aceite das seis interações de interface ainda não está integrado ao fluxo do SDLC.',asOf:stamp,observedAt:stamp,liveUrl:appUrl,nextAction:{label:'Ver pendências de aceitação',step:'approval'},checks:[{id:'acceptance',label:'Testes de aceitação',passed:false,detail:'Os testes técnicos não comprovam os critérios da interface.'}],acceptance:{scope:'technical',covered:0,total:6,httpOnly:true}};
  progress.checks.unshift(...[['specification','Especificação e ciclo'],['integration','Integração e rastreabilidade'],['code_review','Revisão de código'],['security_scan','Segurança'],['artifact','Artefato de desenvolvimento'],['deployment','Publicação DEV confirmada']].map(([id,label])=>({id,label,passed:true,detail:'Evidência da revisão conferida na fixture isolada.'})));
  const lifecycle=storyLifecycleReading({id:storyId,status:story.status,version:7,revision:{specification:{id:'summary-specification',number:4},execution:{id:'summary-run',sha,storyRecordVersion:7,state:'succeeded',stage:'completed'}},executionContext:'current'});
  const journey=uiJourney(story,{id:'summary-run',state:'succeeded',stage:'completed',commitSha:sha,createdAt:stamp},{storyLifecycle:lifecycle,devProgress:progress,current:{kind:'merge',state:'succeeded',title:progress.title,message:progress.message,taskId:task.id},nextAction:{id:'prepare_dev',kind:'prepare_dev',label:progress.nextAction!.label,enabled:true,href:`/stories/${storyId}?tab=planning&process=environment&environment=DEV&devStep=approval`},tasks:[task],activities:[],delivery:storyDeliveryReading({status:story.status,mergeConfirmed:true}),permissions:{canAct:false}});
  const artifact:DevelopmentBuildOperation={id:'summary-build',number:2,version:3,state:'succeeded',message:'Artefato confirmado.',actorName:'Ana',reason:'Construção isolada.',sourceSha:sha,contractDigest:digest,unitId:'web',policyVersion:'node24-react-v1',createdAt:stamp,updatedAt:stamp,startedAt:stamp,finishedAt:stamp,dispatchStartedAt:stamp,artifact:{imageId:image,archiveDigest:digest,size:4096}};
  const build:DevelopmentBuildReading={storyId,configured:true,operation:artifact,artifact,asOf:stamp};
  const buildContext:DevelopmentBuildContext={storyId,storyKey:story.key,systemId:system.id,repositoryId:'summary-repository',repositoryName:'Repositório isolado',projectId:42,sourceSha:sha,targetBranch:'main',integrationReferenceId:'summary-integration',contractDigest:digest,unitId:'web',runtime:'Node 24',policyVersion:'node24-react-v1',executorReady:true,allowed:true,blockers:[],token:'summary-build-context',asOf:stamp};
  const approval:DevelopmentApprovalReading={storyId,approval:null,validity:{state:'not_recorded',label:'Sem aprovação registrada',reasons:[]},approvalAvailable:true,asOf:stamp};
  const technicalEvidence:DevelopmentTestOperation={id:'summary-technical-test',storyId,taskId:'summary-test-task',deploymentId:'summary-deployment',buildId:artifact.id,environmentId:'summary-dev',sourceSha:sha,imageId:image,archiveDigest:digest,suiteDigest:digest,suiteScope:'technical',caseCount:4,number:2,version:3,state:'succeeded',message:'Verificação técnica aprovada.',actorName:'Ana',reason:'Conferência HTTP isolada.',dispatchStartedAt:stamp,createdAt:stamp,updatedAt:stamp,finishedAt:stamp,result:'passed',cases:Array.from({length:4},(_,index)=>({id:'summary-case-'+index,name:'Verificação HTTP '+(index+1),criterionIndices:[],passed:true,expectedStatus:200,actualStatus:200,code:'PASSED',durationMs:10}))};
  const tests:DevelopmentTestReading={storyId,configured:true,operation:technicalEvidence,evidence:technicalEvidence,current:true,observation:{state:'healthy',operationId:'summary-deployment',observedAt:stamp},taskId:technicalEvidence.taskId,asOf:stamp};
  const approvalContext:DevelopmentApprovalContext={...approval,storyVersion:7,policyVersion:'summary-approval-policy',allowed:false,blockers:['Os testes técnicos não comprovam os critérios da interface.'],checks:progress.checks,evidence:{specificationId:'summary-specification',specificationNumber:4,executionId:'summary-run',sourceSha:sha,integrationReferenceId:'summary-integration',integrationSha:sha,buildId:artifact.id,buildSourceSha:sha,imageId:image,archiveDigest:digest,deploymentId:'summary-deployment',testId:null,suiteDigest:null,reviewId:'summary-review',securityId:'summary-security',criterionCount:6,coverage:[]},token:'summary-approval-context'};
  const state={progress,journey,build,buildContext,tests,approval,approvalContext,writes:[] as string[],reads:[] as string[],errors:[] as string[],journeyReads:0,disconnected:false,buildReadFailed:false,buildContextFailed:false,holdJourney:null as Promise<void>|null};
  page.on('pageerror',error=>state.errors.push(error.message));
  await page.context().route(appUrl+'/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Aplicação isolada</title><h1>Hello World</h1>'}));
  await page.route('**/api/**',async route=>{
    const request=route.request(),path=new URL(request.url()).pathname;
    const send=(json:unknown)=>route.fulfill({json});
    if(!['GET','HEAD'].includes(request.method())){state.writes.push(request.method()+' '+path);return route.fulfill({status:409,json:{error:{message:'Nenhum comando é permitido neste cenário de navegação.'}}});}
    state.reads.push(path);
    if(path.endsWith('/journey')){
      state.journeyReads++;if(state.holdJourney)await state.holdJourney;
      if(state.disconnected)return route.fulfill({status:503,json:{error:{message:'Leitura atual indisponível no ensaio.'}}});
      return send(state.journey);
    }
    if(path.endsWith('/development-build/context'))return state.buildContextFailed?route.fulfill({status:503,json:{error:{message:'Consulta da versão temporariamente indisponível.'}}}):send(state.buildContext);
    if(path.endsWith('/development-build'))return state.buildReadFailed?route.fulfill({status:503,json:{error:{message:'Acompanhamento da construção temporariamente indisponível.'}}}):send(state.build);
    if(path.endsWith('/development-deployment')){
      const deployment={id:'summary-deployment',storyId,systemId:system.id,environmentId:'summary-dev',buildId:'summary-build',sourceSha:sha,imageId:image,archiveDigest:digest,number:2,version:3,state:'succeeded',message:'Implantação confirmada.',actorName:'Ana',reason:'Publicação isolada.',dispatchStartedAt:stamp,createdAt:stamp,updatedAt:stamp,finishedAt:stamp,url:appUrl,healthAt:stamp};
      return send({storyId,configured:true,operation:deployment,deployment,preparation:null,observation:{state:state.progress.state==='changed'?'changed':'healthy',operationId:state.progress.state==='changed'?'other-deployment':deployment.id,url:appUrl,observedAt:stamp},asOf:stamp});
    }
    if(path.endsWith('/development-test'))return send(state.tests);
    if(path.endsWith('/development-ai-test'))return send({storyId,storyVersion:7,referenceDigest:digest,url:appUrl,deploymentId:'summary-deployment',sourceSha:sha,configured:false,allowed:false,blockers:['Executor por IA não configurado nesta fixture.'],token:digest,operation:null,asOf:stamp});
    if(path.endsWith('/development-approval/context'))return send(state.approvalContext);
    if(path.endsWith('/development-approval'))return send(state.approval);
    if(path.endsWith('/release'))return send({story:{...story,projectId:project.id,projectName:project.name,epicId:epic.id,epicName:epic.name},assignment:null,system,releases:[],truncated:false,totalChoices:0});
    if(path.endsWith('/history'))return send({events:[],page:1,pageSize:20,total:0,totalPages:1,asOf:stamp,actors:[],types:[],results:[]});
    if(path.endsWith('/conversations'))return send({context:story,readOnly:true,messages:[],total:0,page:1,pageSize:20,totalPages:1,asOf:stamp});
    if(path.endsWith('/results'))return send({results:[],pagination:{page:1,pageSize:20,total:0,totalPages:1},asOf:stamp,readOnly:true,coverage:{source:'TaskResultRevision',legacyResultAvailable:false}});
    if(path.endsWith('/specification'))return send({story:{id:storyId,version:7},content:{requirements:{objective:'Conferir a aplicação.',behavior:'Alterar cor e fonte.',functionalCriteria:['Cor cobre a viewport.','Fonte altera o texto.']},technical:null},revision:null,draft:null,readOnly:true,history:{items:[],page:1,pageSize:20,total:0,asOf:stamp}});
    const selected=[system,project,epic,story,task].find(value=>path===`/api/items/${value.id}`);
    if(selected)return send({item:selected,ancestors:[system,project,epic,...(selected.kind==='task'?[story]:[])],children:selected.id===storyId?[task]:[],repositories:[],availableRepositories:[],environments:[],history:[],hierarchy:{writable:true}});
    return send({items:[]});
  });
  await mockPersonas(page);await mockTaskCollection(page,()=>[task]);return state;
}
