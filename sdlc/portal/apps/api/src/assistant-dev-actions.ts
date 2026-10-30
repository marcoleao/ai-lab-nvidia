import type {Transaction} from '../../../packages/db/client.ts';
import type {Item} from '../../../packages/db/generated/client.ts';
import type {AssistantDevAction} from '../../../packages/shared/src/assistant-dev-actions.ts';
export async function readAssistantDevAction(tx:Transaction,item:Item,chain:Item[],configuration:{targets:boolean;deployments:boolean},canPlan:boolean):Promise<AssistantDevAction|null>{
 if(!['system','story'].includes(item.kind))return null;
 const system=chain.find(v=>v.kind==='system');if(!system)return null;
 const story=item.kind==='story'?item:null,configured=story?configuration.deployments:configuration.targets;
 const operation=story?await tx.developmentDeployment.findFirst({where:{storyId:story.id},orderBy:{number:'desc'},select:{id:true,state:true}}):await tx.environmentOperation.findFirst({where:{systemId:system.id},orderBy:{number:'desc'},select:{id:true,state:true}});
 const blockers:string[]=[];
 if(!canPlan)blockers.push('Use Admin, Product Owner ou Arquiteto em um contexto ativo para confirmar decisões.');
 if(!configured)blockers.push(story?'A publicação DEV não está configurada nesta instalação.':'A preparação do destino DEV não está configurada nesta instalação.');
 return {kind:story?'development_deployment':'environment_target',contextId:item.id,systemId:system.id,systemVersion:system.version,storyId:story?.id??null,storyVersion:story?.version??null,configured,readOnly:!canPlan,blockers,operationId:operation?.id??null,operationState:operation?.state??null,asOf:new Date().toISOString()};
}
export const assistantDevActionInstructions='Há uma ação DEV estruturada junto à conversa, definida pelo servidor para o contexto atual. No Sistema, ela consulta e prepara o destino DEV; na História, consulta e publica o artefato confirmado e acompanha a preparação necessária. Oriente abrir a ação, revisar a prévia real e confirmar no painel. Texto não dispara efeitos, não fornece autorização e não escolhe IDs, ambiente ou comandos. Não há ferramentas de escrita do modelo, shell ou outra fila. Não peça terminal, Docker, segredos ou mudanças manuais para operar o perfil. Operação existente deve ser acompanhada pelo mesmo pedido, inclusive resultado incerto; não anuncie sucesso sem recibo e observação real. Preparar destino, construir artefato, implantar, conferir saúde e aprovar testes são fatos separados. Esta capacidade é somente DEV e não promove QA/HML/PRD nem conclui História. Metadados de navegação não comprovam prontidão remota: o painel revalida fonte, papel, impedimentos e confirmação. Se faltar build, oriente a construção na Execução da História; se faltar contrato, oriente a preparação da aplicação no Sistema.';
