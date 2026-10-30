import {z} from 'zod';
import type {LLMProvider} from './llm.ts';
import {DomainError} from './errors.ts';
/** A single bounded repair requests a valid answer; it never invents one. */
export async function completeStructured<T>(llm:LLMProvider,messages:{role:'system'|'user'|'assistant';content:string}[],schema:z.ZodType<T>,maxTokens=2048){
 let correction='';
 for(let attempt=0;attempt<2;attempt++){
  try{
   const result=await llm.complete([...messages,...(correction?[{role:'user' as const,content:correction}]:[])],{json:true,maxTokens,schema:z.toJSONSchema(schema)});
   const parsed=schema.safeParse(JSON.parse(result.content));
   if(parsed.success)return {...result,value:parsed.data};
   correction='A resposta anterior não respeitou os campos/limites do contrato. Responda novamente com JSON estrito do schema, sem texto fora do objeto; reply breve, frases completas e fatos confirmados preservados. Erros: '+parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.code}`).join('; ').slice(0,1000);
  }catch(error){
   if(!(error instanceof SyntaxError)&&!(error instanceof DomainError&&['LLM_INVALID_JSON','LLM_OUTPUT_LIMIT'].includes(error.code)))throw error;
   correction='A resposta anterior ficou inválida ou incompleta. Refaça em JSON estrito e conciso segundo o schema, com frases completas. Preserve os fatos e escolhas confirmados; não invente decisões ou execução.';
  }
 }
 throw new DomainError('LLM_STRUCTURE_INVALID','O agente não produziu uma resposta completa no formato necessário após uma tentativa de recuperação. A solicitação e o histórico foram preservados; nenhum parecer ou decisão foi inventado.',502);
}
