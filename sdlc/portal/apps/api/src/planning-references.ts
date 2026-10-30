import type {Transaction} from '../../../packages/db/client.ts';
import {Prisma} from '../../../packages/db/generated/client.ts';
import type {PlanningReference} from '../../../packages/shared/src/planning-reference.ts';
import {DomainError} from './errors.ts';

export async function planningReferences(tx:Transaction,ids:readonly string[]){
 if(!ids.length)return new Map<string,PlanningReference>();
 const rows=await tx.$queryRaw<{reference:PlanningReference}[]>`SELECT sdlc_story_planning_reference(i.id) AS reference FROM "Item" i WHERE i.kind='story' AND i.id IN (${Prisma.join([...new Set(ids)])})`;
 return new Map(rows.map(row=>[row.reference.storyId,row.reference]));
}
export function requirePlanningReference(current:PlanningReference,expected?:string){
 if(!expected)throw new DomainError('PLANNING_REFERENCE_REQUIRED','Atualize as informações para revisar o conteúdo e o código antes de salvar. Suas escolhas foram preservadas.',409);
 if(current.referenceToken!==expected)throw new DomainError('PLANNING_REFERENCE_CHANGED','O conteúdo, a especificação ou o código mudou desde a consulta. Atualize e revise as referências antes de salvar. Suas escolhas foram preservadas.',409);
}
