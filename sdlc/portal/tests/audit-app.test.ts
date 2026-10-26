import {randomUUID} from 'node:crypto';
import {afterAll,describe,expect,test} from 'vitest';
import {database} from '../packages/db/client.ts';
import {createApp} from '../apps/api/src/app.ts';
import {recordAudit} from '../apps/api/src/audit.ts';

describe.skipIf(!process.env.TEST_DATABASE_URL)('audited commands in a disposable database',()=>{
  const url=process.env.TEST_DATABASE_URL!;
  if(!url.endsWith('/portal_test'))throw new Error('Disposable portal_test required');
  const db=database(url),runtime=createApp({db,demoMode:true});
  const headers={'x-persona':'admin','idempotency-key':randomUUID()};
  afterAll(async()=>{await runtime.app.close();await db.$disconnect();});

  test('creation and edits preserve outcome, actor, description revisions and idempotency',async()=>{
    const payload={kind:'system',key:'AUDITA',name:'Sistema auditado',description:'Descrição anterior'};
    const first=await runtime.app.inject({method:'POST',url:'/api/items',headers,payload});
    expect(first.statusCode,first.body).toBe(200);
    const {item}=first.json();
    const replay=await runtime.app.inject({method:'POST',url:'/api/items',headers,payload});
    expect(replay.json()).toEqual(first.json());
    const created=await db.historyEvent.findMany({where:{itemId:item.id,action:'ITEM_CREATED'}});
    expect(created).toHaveLength(1);expect(created[0].schemaVersion).toBe(2);expect(created[0].outcome).toBe('SUCCEEDED');
    const edited=await runtime.app.inject({method:'PATCH',url:`/api/items/${item.id}`,headers:{...headers,'idempotency-key':randomUUID()},payload:{expectedVersion:1,name:'Nome alterado',description:'Descrição nova'}});
    expect(edited.statusCode,edited.body).toBe(200);
    const event=await db.historyEvent.findFirstOrThrow({where:{itemId:item.id,action:'ITEM_UPDATED'}});
    const envelope=event.audit as any;
    expect(envelope.changes).toEqual(expect.arrayContaining([expect.objectContaining({field:'name',before:{kind:'value',value:'Sistema auditado'},after:{kind:'value',value:'Nome alterado'}})]));
    expect(envelope.initiator.authentication).toBe('declared_demo');
    expect(JSON.stringify(envelope)).not.toContain('Descrição anterior');
    const revisions=await db.$queryRaw<{description:string}[]>`SELECT description FROM "ItemAuditRevision" WHERE "itemId"=${item.id} ORDER BY version`;
    expect(revisions.map(r=>r.description)).toEqual(['Descrição anterior','Descrição nova']);
    const revisionId=encodeURIComponent(`${item.id}:1`);
    const denied=await runtime.app.inject({url:`/api/items/${item.id}/revisions/${revisionId}`,headers:{'x-persona':'carla'}});
    expect(denied.statusCode).toBe(403);expect(denied.body).not.toContain('Descrição anterior');
    const restricted=await runtime.app.inject({url:`/api/items/${item.id}/revisions/${revisionId}`,headers:{'x-persona':'admin'}});
    expect(restricted.statusCode,restricted.body).toBe(200);expect(restricted.json().revision.description).toBe('Descrição anterior');
    const stale=await runtime.app.inject({method:'PATCH',url:`/api/items/${item.id}`,headers:{...headers,'idempotency-key':randomUUID()},payload:{expectedVersion:1,name:'Valor obsoleto',description:'Não gravar'}});
    expect(stale.statusCode).toBe(409);
    expect((await db.item.findUniqueOrThrow({where:{id:item.id}})).name).toBe('Nome alterado');
    expect(await db.historyEvent.findFirst({where:{itemId:item.id,action:'COMMAND_REJECTED',outcome:'REJECTED'}})).toBeTruthy();
  });

  test('audit failure rolls back a domain mutation',async()=>{
    const target=await db.item.findUniqueOrThrow({where:{key:'AUDITA'}}),before=target.version;
    await expect(db.$transaction(async tx=>{
      const changed=await tx.item.update({where:{id:target.id},data:{name:'Não confirmar',version:{increment:1}}});
      await recordAudit(tx,changed,{id:'admin',name:'Admin'},'UNREGISTERED_ACTION','Invalid audit',{});
    })).rejects.toThrow();
    expect((await db.item.findUniqueOrThrow({where:{id:target.id}})).version).toBe(before);
  });

  test('automatic pipeline tasks retain the human initiator and do not duplicate on Story creation replay',async()=>{
    async function create(kind:string,parentId?:string,key?:string){
      const result=await runtime.app.inject({method:'POST',url:'/api/items',headers:{...headers,'idempotency-key':randomUUID()},payload:{kind,parentId,key,name:'Isolated audit '+kind}});
      expect(result.statusCode,result.body).toBe(200);return result.json().item;
    }
    const system=await create('system',undefined,'AUDIST'),project=await create('project',system.id,'TASKER'),epic=await create('epic',project.id);
    const commandHeaders={...headers,'idempotency-key':randomUUID()},payload={kind:'story',parentId:epic.id,name:'Manual Story with planned pipeline'};
    const first=await runtime.app.inject({method:'POST',url:'/api/items',headers:commandHeaders,payload});expect(first.statusCode,first.body).toBe(200);
    expect((await runtime.app.inject({method:'POST',url:'/api/items',headers:commandHeaders,payload})).json()).toEqual(first.json());
    const story=first.json().item,tasks=await db.item.findMany({where:{parentId:story.id,kind:'task'}});
    expect(tasks).toHaveLength(6);
    const events=await db.historyEvent.findMany({where:{itemId:{in:tasks.map(task=>task.id)},action:'ITEM_CREATED'}});expect(events).toHaveLength(6);
    for(const event of events){expect(event).toMatchObject({outcome:'SUCCEEDED',phase:'COMPLETED',actorType:'system'});expect((event.audit as any).initiator).toMatchObject({id:'admin',type:'human'});expect((event.audit as any).executor).toMatchObject({id:'system:pipeline',type:'system'});}
    const cancelled=await runtime.app.inject({method:'POST',url:`/api/items/${story.id}/cancel`,headers:{...headers,'idempotency-key':randomUUID()},payload:{expectedVersion:story.version,comment:'Private cancellation explanation kept in controlled source.'}});expect(cancelled.statusCode,cancelled.body).toBe(200);
    const confirmed=await db.historyEvent.findMany({where:{itemId:story.id,action:'STORY_CANCELLED'}});expect(confirmed).toHaveLength(1);expect(confirmed[0]).toMatchObject({outcome:'CANCELLED',phase:'COMPLETED'});
    expect(JSON.stringify(confirmed)).not.toContain('Private cancellation explanation');
  });

  test('runtime role cannot truncate, mutate, downgrade or disable the audit trail',async()=>{
    for(const sql of ['TRUNCATE "HistoryEvent"','DELETE FROM "HistoryEvent"','ALTER TABLE "HistoryEvent" DISABLE TRIGGER ALL','UPDATE "HistoryEvent" SET message=\'changed\'']){
      await expect(db.$transaction(async tx=>{await tx.$executeRawUnsafe('SET LOCAL ROLE sdlc_portal_app');await tx.$executeRawUnsafe(sql);})).rejects.toThrow();
    }
    await expect(db.$transaction(async tx=>{
      await tx.$executeRawUnsafe('SET LOCAL ROLE sdlc_portal_app');
      await tx.historyEvent.create({data:{itemId:'request',ancestorIds:[],actorId:'admin',actorName:'Admin',action:'FAKE_LEGACY',message:'forbidden',payload:{}}});
    })).rejects.toThrow();
  });
});
