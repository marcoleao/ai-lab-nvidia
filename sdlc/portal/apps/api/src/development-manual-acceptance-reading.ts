import type {DevelopmentManualAcceptance} from '../../../packages/db/generated/client.ts';
import type {ManualAcceptance} from '../../../packages/shared/src/development-manual-acceptance.ts';
export const manualAcceptancePolicy='dev-manual-story-acceptance-v2';
export const legacyManualAcceptancePolicy='dev-manual-acceptance-v1';
export function manualAcceptanceProjection(value:DevelopmentManualAcceptance):ManualAcceptance{
 return {...value,scope:value.scope as 'criteria'|'story',criteria:value.criteria as string[],results:value.results as ManualAcceptance['results'],result:value.result as 'passed'|'failed'|'pending',createdAt:value.createdAt.toISOString()};
}
