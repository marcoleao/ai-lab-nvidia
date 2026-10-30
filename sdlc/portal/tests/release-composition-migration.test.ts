import {readFileSync} from 'node:fs';
import {afterAll,describe,expect,test} from 'vitest';
import pg from 'pg';
import {database} from '../packages/db/client.ts';
import {recordComposition} from '../apps/api/src/release-compositions.ts';
import {migrationBaseline} from './migration-baseline.ts';
const url=process.env.TEST_DATABASE_URL;
if(url&&new URL(url).pathname!=='/portal_test')throw Error('Disposable portal_test required');
describe.skipIf(!url)('composition revision migration and restricted runtime',()=>{
 const db=database(url!);afterAll(()=>db.$disconnect());
 test('observes the complete existing composition, preserves business rows, rolls back only without planned decisions and grants runtime INSERT/SELECT',async()=>{
  await migrationBaseline(url!,'202610280001_release_composition_revisions');
  const system=await db.item.create({data:{kind:'system',key:'MIGSYS',name:'Isolated system',status:'active'}}),project=await db.item.create({data:{kind:'project',key:'MIGPRJ',name:'Isolated project',status:'active',projectLifecycle:'active',parentId:system.id,parentKind:'system'}}),epic=await db.item.create({data:{kind:'epic',key:'MIGEPIC',name:'Isolated epic',status:'active',parentId:project.id,parentKind:'project'}}),story=await db.item.create({data:{kind:'story',key:'MIGSTORY',name:'Isolated Story',status:'merge_request',version:5,parentId:epic.id,parentKind:'epic'}});
  const release=await db.release.create({data:{key:'MIGREL',name:'Isolated legacy release',systemId:system.id,version:7,createdById:'admin',createdByName:'Admin'}});await db.releaseStory.create({data:{storyId:story.id,releaseId:release.id,plannedStoryVersion:4}});
  const sql=new pg.Client({connectionString:url});await sql.connect();
  const folder='prisma/migrations/202610280001_release_composition_revisions/',down=readFileSync(folder+'rollback.sql','utf8'),up=readFileSync(folder+'migration.sql','utf8');
  async function fingerprints(){const {rows:tables}=await sql.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('ReleaseCompositionRevision','_prisma_migrations') ORDER BY tablename");const rows={};for(const {tablename}of tables){if(!/^[A-Za-z_]+$/.test(tablename))throw Error('Unexpected table');const result=await sql.query(`SELECT md5(coalesce(string_agg(row,'|' ORDER BY row),'')) digest FROM (SELECT to_jsonb(t)::text row FROM "${tablename}" t) data`);rows[tablename]=result.rows[0].digest;}return rows;}
  try{
   const before=await fingerprints();await sql.query(down);await sql.query(up);expect(await fingerprints()).toEqual(before);
   const observed=await db.releaseCompositionRevision.findFirstOrThrow({where:{releaseId:release.id}});expect(observed).toMatchObject({number:1,releaseRecordVersion:7,source:'observed',actorId:null,actorName:null,digest:null,storyCount:1});expect(observed.stories).toEqual([{storyId:story.id,storyKey:story.key,storyName:story.name,recordVersion:4,specification:null,execution:null,contentDigest:null}]);
   await sql.query(down);await sql.query(up);expect(await fingerprints()).toEqual(before);
   await db.$transaction(async tx=>{await tx.$executeRawUnsafe('SET LOCAL ROLE sdlc_portal_app');await recordComposition(tx,release,{id:'admin',name:'Admin'});});expect(await db.releaseCompositionRevision.count({where:{releaseId:release.id}})).toBe(2);
   await expect(sql.query(down)).rejects.toThrow('Retain planned composition revisions');await sql.query('ROLLBACK');expect(await db.releaseCompositionRevision.count({where:{releaseId:release.id}})).toBe(2);expect(await fingerprints()).toEqual(before);
  }finally{await sql.end();}
 });
});
