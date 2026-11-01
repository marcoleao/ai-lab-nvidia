import {expect,test} from 'vitest';
import {validateAiScope,validateAiReceipt,aiTestPolicy,type AiTestIntent} from '../apps/api/src/development-ai-test-provider.ts';
import {aiAdjustmentSummary} from '../apps/api/src/development-ai-tests.ts';
const intent={id:'isolated-ai-job',policyVersion:aiTestPolicy,referenceDigest:'a'.repeat(64),deployment:{id:'isolated-deployment',sourceSha:'b'.repeat(40),imageId:'sha256:'+'c'.repeat(64)},context:{criteria:['Confirmar reserva.']}} as unknown as AiTestIntent;
const caseValue={index:0,title:'Confirmar reserva.',status:'passed',code:'PASSED',steps:2,evidence:['report.json']};
const receipt={id:intent.id,state:'succeeded',stage:'completed',cases:[caseValue],proof:{policyVersion:aiTestPolicy,referenceDigest:intent.referenceDigest,deploymentId:intent.deployment.id,sourceSha:intent.deployment.sourceSha,imageId:intent.deployment.imageId,model:'isolated-model',completeAcceptance:false}};
test('native scope refuses unsupported legacy or oversized captures before dispatch, without trimming approved facts',()=>{
 const scope={contextVersion:2,objective:'Reservar',behavior:'Confirmar',criteria:['Exibir confirmação.'],testCases:[],approved:{name:'Reserva',runtime:{name:'Node'},requirements:{businessRules:['Regra integral.']},technicalPlan:{},decisions:[],tasks:[],codeDestination:null,scopeRevision:3}};
 expect(validateAiScope(scope)).toEqual(scope);
 for(const raw of [undefined,{...scope,criteria:Array(13).fill('Critério')},{...scope,criteria:[' ']},{...scope,approved:{...scope.approved,scopeRevision:2}},{...scope,objective:'ação'.repeat(10000)},{...scope,testCases:[{criterionIndex:1,description:'Outro critério'}]}])expect(()=>validateAiScope(raw)).toThrow();
});
test('actual receipt requires pinned source, independent status semantics and retained evidence',()=>{
 expect(validateAiReceipt(intent,receipt)).toEqual(receipt);
 for(const change of [{id:'another-job'},{proof:{...receipt.proof,sourceSha:'d'.repeat(40)}},{proof:{...receipt.proof,referenceDigest:'d'.repeat(64)}},{proof:{...receipt.proof,completeAcceptance:true}},{cases:[{...caseValue,status:'not_tested'}],state:'inconclusive'},{cases:[{...caseValue,evidence:[]}]},{cases:[caseValue,caseValue]},{cases:[{...caseValue,index:1}]},{cases:[{...caseValue,title:'Outra obrigação.'}]},{cases:[{...caseValue,evidence:['../../secret']}]},{state:'failed'}])expect(()=>validateAiReceipt(intent,{...receipt,...change})).toThrow();
});
test('partial or unconfirmed execution never carries a successful full battery',()=>{
 expect(validateAiReceipt(intent,{id:intent.id,state:'unknown',stage:'unconfirmed',cases:[]})).toMatchObject({state:'unknown'});
 expect(()=>validateAiReceipt(intent,{...receipt,cases:[]})).toThrow();
 expect(validateAiReceipt(intent,{...receipt,state:'inconclusive',cases:[{...caseValue,status:'not_tested',code:'CAPABILITY_UNSUPPORTED',evidence:[]}]})).toMatchObject({state:'inconclusive'});
});
test('summary includes every functional failure within the human field limit and none for unavailable tests',()=>{
 const cases=Array.from({length:12},(_,index)=>({index,title:'Obrigação '.repeat(50),status:'failed' as const,code:'ASSERTION_FAILED',steps:3,evidence:['report.json']}));
 const value=aiAdjustmentSummary({id:'frozen-execution'},cases)!;expect(value.length).toBeLessThanOrEqual(1800);expect(value).toContain('Resumo');expect(value).toContain('frozen-execution');for(let i=1;i<=12;i++)expect(value).toContain(`Cenário ${i}:`);
 expect(aiAdjustmentSummary({id:'same'},cases.map(c=>({...c,status:'not_tested',code:'CAPABILITY_UNSUPPORTED'})))).toBeNull();
});
