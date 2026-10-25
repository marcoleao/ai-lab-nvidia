import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import type {Transaction} from '../../../packages/db/client.ts';
import {Prisma,type Item} from '../../../packages/db/generated/client.ts';
import {assistantLineage,type AssistantHelpers} from './assistant.ts';
import {DomainError} from './errors.ts';

const pageSize=20;
const querySchema=z.object({source:z.enum(['all','planning','story','execution','merge']).default('all'),scope:z.enum(['self','descendants']).default('self'),page:z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).default(1),direction:z.enum(['asc','desc']).default('desc'),asOf:z.string().datetime({offset:true}).optional(),includeArchived:z.enum(['true','false']).default('false'),messageId:z.string().min(1).max(240).optional()}).strict();
const contextView=(chain:Item[])=>{const item=chain.at(-1)!;return {id:item.id,kind:item.kind,key:item.key,name:item.name,systemId:chain.find(i=>i.kind==='system')?.id,projectId:chain.find(i=>i.kind==='project')?.id,archived:chain.some(i=>i.archived),readOnly:isReadOnly(chain)};};
const isReadOnly=(chain:Item[])=>chain.some(i=>i.archived||i.kind==='project'&&['completed','cancelled'].includes(i.projectLifecycle??''));
type ConversationRow={id:string;source:'planning'|'story'|'execution'|'merge';sourceId:string;sourceType:string;sourceVersion:number;relation:'direct'|'descendant'|'planning_origin'|'linked';input:string|null;output:string|null;role:string|null;content:string|null;state:string;error:string|null;actorId:string;actorName:string;createdAt:Date;contextId:string;executionId:string|null;storyVersion:number|null;commitSha:string|null;attemptId:string|null};
type ConversationReference={messageId:string;sourceType:'chat_turn'|'plan_proposal';sourceId:string;sourceVersion:number;storyId:string;storyVersion:number|null;linkedAt:Date;relation:'planning_origin'|'linked'};

// Every branch reads its original ledger. EXISTS relates a source to any number
// of Histories without multiplying its messages or rewriting their provenance.
function conversationSources(contextId:string,query:z.infer<typeof querySchema>,asOf:Date){
  const descendants=query.scope==='descendants',includeArchived=query.includeArchived==='true';
  return Prisma.sql`WITH RECURSIVE scoped AS (
    SELECT i.* FROM "Item" i WHERE i.id=${contextId}
    UNION ALL SELECT child.* FROM "Item" child JOIN scoped parent ON child."parentId"=parent.id
      WHERE ${descendants} AND (${includeArchived} OR child.archived=false)
  ), planning_origins AS (
    SELECT DISTINCT origin."sessionId",origin.sequence
    FROM scoped story JOIN "Item" epic ON epic.id=story."parentId"
      JOIN "Item" project ON project.id=epic."parentId" AND project.kind='project'
      JOIN "PlanProposal" proposal ON proposal.id=story.data->>'planProposalId' AND proposal."projectId"=project.id
      JOIN "PlanRevision" revision ON revision."proposalId"=proposal.id AND revision.version::text=story.data->>'planRevision'
      JOIN "ChatTurn" origin ON origin.id=proposal."turnId" AND origin.id=story.data->>'sourceTurnId'
      JOIN "ChatSession" session ON session.id=origin."sessionId"
    WHERE story.kind='story' AND proposal.status='applied' AND proposal."appliedItemIds" ? story.id
      AND origin.status='succeeded' AND session."contextId" IN (project.id,project."parentId") AND story."createdAt"<=${asOf}
    UNION
    SELECT DISTINCT origin."sessionId",origin.sequence
    FROM "ConversationLink" link JOIN scoped story ON story.id=link."storyId"
      JOIN "PlanProposal" proposal ON link."sourceType"='plan_proposal' AND proposal.id=link."sourceId" AND proposal."projectId"=link."projectId"
      JOIN "PlanRevision" revision ON revision."proposalId"=proposal.id AND revision.version=link."sourceVersion"
      JOIN "ChatTurn" origin ON origin.id=proposal."turnId" AND origin.status='succeeded'
    WHERE link."createdAt"<=${asOf}
  ), messages AS (
    SELECT 'chat_turn:'||turn.id AS id,CASE WHEN item.kind='story' THEN 'story' ELSE 'planning' END AS source,
      turn.id AS "sourceId",'chat_turn' AS "sourceType",0 AS "sourceVersion",
      CASE WHEN item.id=${contextId} THEN 'direct' WHEN EXISTS(SELECT 1 FROM scoped s WHERE s.id=item.id) THEN 'descendant'
        WHEN EXISTS(SELECT 1 FROM "ConversationLink" link JOIN scoped s ON s.id=link."storyId" WHERE link."sourceType"='chat_turn' AND link."sourceId"=turn.id AND link."createdAt"<=${asOf}) THEN 'linked' ELSE 'planning_origin' END AS relation,
      turn.input,turn.output,NULL::text AS role,NULL::text AS content,turn.status AS state,turn.error,turn."actorId",turn."actorName",turn."createdAt",item.id AS "contextId",
      NULL::text AS "executionId",CASE WHEN item.kind='story' AND jsonb_typeof(turn."contextSnapshot"->'storyVersion')='number' THEN (turn."contextSnapshot"->>'storyVersion')::integer ELSE NULL END AS "storyVersion",
      NULL::text AS "commitSha",NULL::text AS "attemptId"
    FROM "ChatTurn" turn JOIN "ChatSession" session ON session.id=turn."sessionId" JOIN "Item" item ON item.id=session."contextId"
      LEFT JOIN "Item" parent1 ON parent1.id=item."parentId" LEFT JOIN "Item" parent2 ON parent2.id=parent1."parentId" LEFT JOIN "Item" parent3 ON parent3.id=parent2."parentId"
    WHERE turn."createdAt"<=${asOf} AND (${includeArchived} OR NOT(item.archived OR COALESCE(parent1.archived,false) OR COALESCE(parent2.archived,false) OR COALESCE(parent3.archived,false))) AND (
      EXISTS(SELECT 1 FROM scoped s WHERE s.id=item.id)
      OR EXISTS(SELECT 1 FROM planning_origins origin WHERE origin."sessionId"=turn."sessionId" AND turn.sequence<=origin.sequence)
      OR EXISTS(SELECT 1 FROM "ConversationLink" link JOIN scoped s ON s.id=link."storyId" WHERE link."sourceType"='chat_turn' AND link."sourceId"=turn.id AND link."createdAt"<=${asOf})
    )
    UNION ALL
    SELECT 'execution_message:'||message.id,'execution',message.id,'execution_message',0,
      CASE WHEN run."storyId"=${contextId} THEN 'direct' ELSE 'descendant' END,
      NULL::text,NULL::text,message.role,message.content,message.state,NULL::text,message."actorId",message."actorName",message."createdAt",run."storyId",run.id,
      (SELECT CASE WHEN jsonb_typeof(history.audit->'target'->'version')='number' THEN (history.audit->'target'->>'version')::integer ELSE NULL END FROM "HistoryEvent" history WHERE history."schemaVersion"=2 AND history."itemId"=run."storyId" AND history.payload->>'messageId'=message.id ORDER BY history.timestamp,history.id LIMIT 1),
      NULL::text,
      (SELECT attempt.id FROM "WorkAttempt" attempt WHERE attempt."sourceKey"='discussion:'||message.id LIMIT 1)
    FROM "ExecutionMessage" message JOIN "StoryExecution" run ON run.id=message."executionId"
    WHERE message."createdAt"<=${asOf} AND EXISTS(SELECT 1 FROM scoped s WHERE s.id=run."storyId")
    UNION ALL
    SELECT 'merge_turn:'||turn.id,'merge',turn.id,'merge_turn',0,
      CASE WHEN operation."storyId"=${contextId} THEN 'direct' ELSE 'descendant' END,
      turn.input,turn.output,NULL::text,NULL::text,turn.state,turn.error,turn."actorId",turn."actorName",turn."createdAt",operation."storyId",operation."executionId",NULL::integer,
      (SELECT attempt.revision FROM "WorkAttempt" attempt WHERE attempt."sourceKey"='merge-discussion:'||turn.id LIMIT 1),
      (SELECT attempt.id FROM "WorkAttempt" attempt WHERE attempt."sourceKey"='merge-discussion:'||turn.id LIMIT 1)
    FROM "MergeDiscussionTurn" turn JOIN "MergeOperation" operation ON operation.id=turn."operationId"
    WHERE turn."createdAt"<=${asOf} AND EXISTS(SELECT 1 FROM scoped s WHERE s.id=operation."storyId")
  )`;
}

export function registerConversations(app:FastifyInstance,h:AssistantHelpers){
  app.get<{Params:{id:string}}>('/api/items/:id/conversations',async request=>{
    const query=querySchema.parse(request.query);
    return h.db.$transaction(async tx=>{
      let chain=await assistantLineage(tx,request.params.id,query.includeArchived==='true');
      const readOnly=isReadOnly(chain);
      // A Tarefa shares the História's conversation; its operational evidence
      // remains addressed by its actual activity and attempt.
      if(chain.at(-1)?.kind==='task')chain=chain.slice(0,-1);
      const context=contextView(chain),asOf=query.asOf?new Date(query.asOf):(await tx.$queryRaw<{asOf:Date}[]>`SELECT CURRENT_TIMESTAMP(3) AS "asOf"`)[0].asOf;
      const sources=conversationSources(context.id,query,asOf);
      const filters=[query.source==='all'?Prisma.sql`true`:Prisma.sql`m.source=${query.source}`,query.messageId?Prisma.sql`m.id=${query.messageId}`:Prisma.sql`true`];
      const where=Prisma.join(filters,' AND ');
      const [{count:total}]=await tx.$queryRaw<{count:number}[]>`${sources} SELECT count(*)::integer AS count FROM messages m WHERE ${where}`;
      const totalPages=Math.max(1,Math.ceil(total/pageSize)),page=Math.min(query.page,totalPages),order=query.direction==='asc'?Prisma.sql`ASC`:Prisma.sql`DESC`;
      const rows=await tx.$queryRaw<ConversationRow[]>`${sources} SELECT m.* FROM messages m WHERE ${where} ORDER BY m."createdAt" ${order},m.id ${order} LIMIT ${pageSize} OFFSET ${(page-1)*pageSize}`;
      const chatIds=rows.filter(row=>row.sourceType==='chat_turn').map(row=>row.sourceId);
      const references=chatIds.length?await tx.$queryRaw<ConversationReference[]>`${sources}, reference_scope AS (
        SELECT i.* FROM "Item" i WHERE i.id=${context.id}
        UNION ALL SELECT child.* FROM "Item" child JOIN reference_scope parent ON child."parentId"=parent.id WHERE ${query.includeArchived==='true'} OR child.archived=false
      ), references_recorded AS (
        SELECT origin."sessionId",origin.sequence AS "throughSequence",NULL::text AS "exactTurnId",'plan_proposal' AS "sourceType",proposal.id AS "sourceId",revision.version AS "sourceVersion",story.id AS "storyId",
          (SELECT (target->>'version')::integer FROM "HistoryEvent" history CROSS JOIN LATERAL jsonb_array_elements(history.audit->'targets') target WHERE history."schemaVersion"=2 AND history.action='PLAN_APPLIED' AND history.payload->>'proposalId'=proposal.id AND target->>'type'='story' AND target->>'id'=story.id AND jsonb_typeof(target->'version')='number' ORDER BY history.timestamp,history.id LIMIT 1) AS "storyVersion",
          story."createdAt" AS "linkedAt",'planning_origin' AS relation
        FROM reference_scope story JOIN "Item" epic ON epic.id=story."parentId" JOIN "Item" project ON project.id=epic."parentId" AND project.kind='project'
          JOIN "PlanProposal" proposal ON proposal.id=story.data->>'planProposalId' AND proposal."projectId"=project.id
          JOIN "PlanRevision" revision ON revision."proposalId"=proposal.id AND revision.version::text=story.data->>'planRevision'
          JOIN "ChatTurn" origin ON origin.id=proposal."turnId" AND origin.id=story.data->>'sourceTurnId'
          JOIN "ChatSession" session ON session.id=origin."sessionId"
        WHERE story.kind='story' AND proposal.status='applied' AND proposal."appliedItemIds" ? story.id AND origin.status='succeeded'
          AND session."contextId" IN (project.id,project."parentId") AND story."createdAt"<=${asOf}
        UNION ALL
        SELECT origin."sessionId",CASE WHEN link."sourceType"='plan_proposal' THEN origin.sequence ELSE NULL END,
          CASE WHEN link."sourceType"='chat_turn' THEN origin.id ELSE NULL END,
          link."sourceType",link."sourceId",link."sourceVersion",link."storyId",link."storyVersion",link."createdAt",'linked'
        FROM "ConversationLink" link JOIN reference_scope story ON story.id=link."storyId"
          LEFT JOIN "PlanProposal" proposal ON link."sourceType"='plan_proposal' AND proposal.id=link."sourceId" AND proposal."projectId"=link."projectId"
          JOIN "ChatTurn" origin ON origin.id=CASE WHEN link."sourceType"='chat_turn' THEN link."sourceId" ELSE proposal."turnId" END
        WHERE link."createdAt"<=${asOf}
      ) SELECT DISTINCT 'chat_turn:'||turn.id AS "messageId",reference."sourceType",reference."sourceId",reference."sourceVersion",reference."storyId",reference."storyVersion",reference."linkedAt",reference.relation
        FROM "ChatTurn" turn JOIN references_recorded reference ON reference."exactTurnId"=turn.id OR (reference."sessionId"=turn."sessionId" AND turn.sequence<=reference."throughSequence")
        WHERE turn.id IN (${Prisma.join(chatIds)}) ORDER BY "messageId","linkedAt","sourceType","sourceId","sourceVersion","storyId"`:[];
      const contexts=new Map<string,ReturnType<typeof contextView>>();
      for(const id of new Set(rows.map(row=>row.contextId)))contexts.set(id,contextView(await assistantLineage(tx,id,true)));
      const proposals=chatIds.length?await tx.planProposal.findMany({where:{turnId:{in:chatIds}},select:{id:true,turnId:true,version:true,status:true}}):[];
      const messages=rows.map(({contextId:sourceContext,executionId,storyVersion,commitSha,attemptId,...row})=>{
        const proposal=row.sourceType==='chat_turn'?proposals.find(proposal=>proposal.turnId===row.sourceId):undefined;
        return {...row,context:contexts.get(sourceContext)!,references:references.filter(reference=>reference.messageId===row.id).map(({messageId,...reference})=>reference),...(proposal?{proposal:{id:proposal.id,version:proposal.version,status:proposal.status}}:{}),...(executionId?{executionId}:{}),...(storyVersion!==null?{storyVersion}:{}),...(commitSha?{commitSha}:{}),...(attemptId?{attemptId}:{})};
      });
      return {context,readOnly,messages,total,page,pageSize,totalPages,asOf:asOf.toISOString(),query:{...query,page,asOf:asOf.toISOString()},coverage:{source:'ChatTurn, ExecutionMessage, MergeDiscussionTurn',scope:query.scope,includesArchived:query.includeArchived==='true',description:'Mensagens integrais das fontes registradas, sem copiar conteúdo para a auditoria. Fontes ou ancestrais arquivados exigem a opção de acervo, inclusive quando relacionados a uma História ativa. Origens de planejamento exigem proveniência ou vínculo explícito; fontes sem correlação preservada não são atribuídas retroativamente. A referência temporal limita mensagens e vínculos consultados, sem reconstruir respostas ou estados anteriores.'}};
    },{isolationLevel:'RepeatableRead'});
  });

  app.post<{Params:{id:string}}>('/api/items/:id/conversation-links',async request=>{
    const body=z.object({sourceType:z.enum(['chat_turn','plan_proposal']),sourceId:z.string().min(1).max(160),sourceVersion:z.number().int().min(0),expectedVersion:z.number().int().positive(),confirmed:z.literal(true)}).strict().parse(request.body);
    return h.mutate(request,async(tx,person)=>{
      const story=await h.live(tx,request.params.id);if(story.kind!=='story')throw new DomainError('STORY_REQUIRED','Selecione uma História para relacionar a origem.',400);
      await h.ensureNotArchived(tx,story);
      if(story.version!==body.expectedVersion)throw new DomainError('VERSION_CONFLICT','A História foi alterada. Atualize antes de relacionar a origem.',409);
      const chain=await h.ancestors(tx,story),project=chain.find(i=>i.kind==='project')!,system=chain.find(i=>i.kind==='system')!;
      let sourceContextId:string,sourceTurnId:string;
      if(body.sourceType==='chat_turn'){
        if(body.sourceVersion!==0)throw new DomainError('CONVERSATION_SOURCE_VERSION','Uma rodada de conversa usa sourceVersion 0.',409);
        const source=await tx.chatTurn.findUnique({where:{id:body.sourceId},include:{session:true}});
        if(!source)throw new DomainError('CONVERSATION_SOURCE_NOT_FOUND','Origem da conversa não encontrada.',404);
        if(source.status!=='succeeded')throw new DomainError('CONVERSATION_SOURCE_NOT_READY','A origem deve ser uma rodada concluída.',409);
        sourceContextId=source.session.contextId;sourceTurnId=source.id;
      }else{
        const source=await tx.planProposal.findUnique({where:{id:body.sourceId},include:{turn:{include:{session:true}}}});
        if(!source)throw new DomainError('CONVERSATION_SOURCE_NOT_FOUND','Proposta de origem não encontrada.',404);
        const revision=await tx.planRevision.findUnique({where:{proposalId_version:{proposalId:source.id,version:body.sourceVersion}}});
        if(!revision||source.turn.status!=='succeeded')throw new DomainError('CONVERSATION_SOURCE_NOT_READY','A revisão da proposta deve existir e sua geração deve estar concluída.',409);
        if(source.projectId!==project.id)throw new DomainError('CONVERSATION_SOURCE_SCOPE','A proposta pertence a outro Projeto.',403);
        sourceContextId=source.turn.session.contextId;sourceTurnId=source.turnId;
      }
      const sourceChain=await assistantLineage(tx,sourceContextId);
      if(sourceContextId!==system.id&&sourceChain.find(i=>i.kind==='project')?.id!==project.id)throw new DomainError('CONVERSATION_SOURCE_SCOPE','Relacione somente origens do mesmo Projeto ou da conversa legada do seu Sistema.',403);
      await h.ensureNotArchived(tx,sourceChain.at(-1)!);
      const existing=await tx.$queryRaw<{id:string;projectId:string;storyId:string;sourceType:string;sourceId:string;sourceVersion:number;storyVersion:number;actorId:string;actorName:string;createdAt:Date}[]>`SELECT id,"projectId","storyId","sourceType","sourceId","sourceVersion","storyVersion","actorId","actorName","createdAt" FROM "ConversationLink" WHERE "sourceType"=${body.sourceType} AND "sourceId"=${body.sourceId} AND "sourceVersion"=${body.sourceVersion} AND "storyId"=${story.id} AND "storyVersion"=${story.version}`;
      const noChange=existing.length>0,id=existing[0]?.id??randomUUID();
      const [link]=noChange?existing:await tx.$queryRaw<typeof existing>`INSERT INTO "ConversationLink" (id,"projectId","projectKind","storyId","storyKind","sourceType","sourceId","sourceVersion","storyVersion","actorId","actorName","createdAt") VALUES (${id},${project.id},'project',${story.id},'story',${body.sourceType},${body.sourceId},${body.sourceVersion},${story.version},${person.id},${person.name},NOW()) RETURNING id,"projectId","storyId","sourceType","sourceId","sourceVersion","storyVersion","actorId","actorName","createdAt"`;
      const recorded={linkId:link.id,projectId:project.id,storyId:story.id,storyVersion:story.version,sourceType:body.sourceType,sourceId:body.sourceId,sourceVersion:body.sourceVersion};
      await h.event(tx,project,person,'CONVERSATION_LINKED',noChange?'A origem já estava relacionada a esta revisão da História.':'Origem relacionada à História; escopo e aprovações preservados.',recorded,'human',{outcome:noChange?'NO_CHANGE':'SUCCEEDED',before:noChange?recorded:null,after:recorded,targets:[{type:'story',id:story.id,key:story.key,name:story.name,version:story.version}],subject:{type:'conversation_link',id:link.id},evidence:[{type:body.sourceType,id:body.sourceId,...(body.sourceType==='plan_proposal'?{revision:String(body.sourceVersion)}:{}),source:body.sourceType},{type:'chat_turn',id:sourceTurnId,source:'chat_turn'}]});
      return {link,noChange};
    });
  });
}
