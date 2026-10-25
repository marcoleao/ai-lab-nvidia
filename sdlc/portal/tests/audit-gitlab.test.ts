import {randomUUID} from 'node:crypto';
import {afterAll,describe,expect,test} from 'vitest';
import {database} from '../packages/db/client.ts';
import {createApp} from '../apps/api/src/app.ts';
import {DomainError} from '../apps/api/src/errors.ts';
import type {GitProvider} from '../apps/api/src/gitlab.ts';

describe.skipIf(!process.env.TEST_DATABASE_URL)('external provisioning evidence',()=>{
 const url=process.env.TEST_DATABASE_URL!;if(!url.endsWith('/portal_test'))throw new Error('Isolated database required');
 const db=database(url);const apps:ReturnType<typeof createApp>[]=[];
 afterAll(async()=>{for(const runtime of apps)await runtime.app.close();await db.$disconnect();});
 async function create(runtime:ReturnType<typeof createApp>,key:string){
   const response=await runtime.app.inject({method:'POST',url:'/api/items',headers:{'x-persona':'admin','idempotency-key':randomUUID()},payload:{kind:'system',key,name:key}});
   expect(response.statusCode,response.body).toBe(200);return response.json().item;
 }

 test('lost provider response remains unknown and reconciliation confirms the same operation',async()=>{
   let calls=0,creations=0;
   const git={ensureGroup:async(path:string)=>{calls++;if(calls===1){creations++;throw new DomainError('GITLAB_UNAVAILABLE','Simulated lost response',503);}return {id:51,full_path:path,web_url:'http://gitlab/sdlc/audrem'};}} as unknown as GitProvider;
   const runtime=createApp({db,demoMode:true,git});apps.push(runtime);
   const item=await create(runtime,'AUDREM');
   await runtime.processJobs();
   const uncertain=await db.historyEvent.findFirstOrThrow({where:{itemId:item.id,action:'GITLAB_PROVISIONING_UNCONFIRMED'}});
   expect(uncertain.outcome).toBe('UNKNOWN');expect(uncertain.phase).toBe('OBSERVED');
   await runtime.processJobs();
   const confirmed=await db.historyEvent.findFirstOrThrow({where:{itemId:item.id,action:'GITLAB_PROVISIONED'}});
   expect(confirmed.outcome).toBe('SUCCEEDED');expect(confirmed.operationId).toBe(uncertain.operationId);
   expect(confirmed.attemptId).not.toBe(uncertain.attemptId);expect(creations).toBe(1);
   expect((confirmed.audit as any).initiator).toMatchObject({id:'admin',authentication:'declared_demo'});
   expect((confirmed.audit as any).executor.id).toBe('integration:gitlab');
 });

 test('late remote confirmation preserves archive and records the observed external effect',async()=>{
   let release!:(group:any)=>void,started!:()=>void;
   const begun=new Promise<void>(resolve=>{started=resolve;});
   const pending=new Promise<any>(resolve=>{release=resolve;});
   const git={ensureGroup:async()=>{started();return pending;}} as unknown as GitProvider;
   const runtime=createApp({db,demoMode:true,git});apps.push(runtime);
   const item=await create(runtime,'AUDLATE'.slice(0,6));
   const work=runtime.processJobs();await begun;
   const archived=await runtime.app.inject({method:'DELETE',url:`/api/items/${item.id}`,headers:{'x-persona':'admin','idempotency-key':randomUUID()},payload:{expectedVersion:1}});
   expect(archived.statusCode,archived.body).toBe(200);
   release({id:52,full_path:'sdlc/audlat'});await work;
   const current=await db.item.findUniqueOrThrow({where:{id:item.id}});expect(current.archived).toBe(true);
   expect((current.data as any).gitlabState).toBe('pending');
   expect(await db.historyEvent.findFirst({where:{itemId:item.id,action:'GITLAB_EFFECT_OBSERVED',outcome:'SUCCEEDED'}})).toBeTruthy();
 });
});
