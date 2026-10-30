// Every database suite owns a fresh schema in the explicitly disposable database.
// Never call this runner with the acceptance database.
import {readdirSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import pg from 'pg';

const target=process.env.TEST_DATABASE_URL;
if(!target||new URL(target).pathname!=='/portal_test')throw new Error('TEST_DATABASE_URL must name the disposable portal_test database');
if(process.env.DATABASE_URL&&new URL(process.env.DATABASE_URL).pathname!=='/portal_test')throw new Error('DATABASE_URL must also point to portal_test');
const env={...process.env,DATABASE_URL:target};
const available=readdirSync('tests').filter(name=>name.endsWith('.test.ts')).sort();
const arguments_=process.argv.slice(2),reportArgument=arguments_.find(v=>v.startsWith('--report=')),keepGoing=arguments_.includes('--continue');
const requested=arguments_.filter(v=>!v.startsWith('--report=')&&v!=='--continue'&&v!=='--reset-only');
if(requested.some(name=>!available.includes(name)))throw new Error('Select existing test basenames only');
const all=requested.length?available.filter(name=>requested.includes(name)):available;
const databaseVariables=name=>[...new Set(readFileSync(`tests/${name}`,'utf8').match(/\bTEST_[A-Z_]*DATABASE_URL\b/g)||[])];
const integration=all.filter(name=>databaseVariables(name).length>0);
const unit=all.filter(name=>!integration.includes(name));
function run(args,environment=env){
  const result=spawnSync(process.execPath,args,{env:environment,encoding:'utf8',maxBuffer:8*1024*1024});
  if(result.status!==0){process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');throw new Error(`Isolated check failed: ${args.join(' ')}`);}
  process.stdout.write(result.stdout||'');
}
async function reset(){
  const client=new pg.Client({connectionString:target});await client.connect();
  try{
    const {rows}=await client.query('SELECT current_database() AS name');
    if(rows[0].name!=='portal_test')throw new Error('Refusing to reset a non-test database');
    await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  }finally{await client.end();}
  run(['node_modules/prisma/build/index.js','migrate','deploy']);
}
if(arguments_.includes('--reset-only')){await reset();console.log('Owned portal_test reset and migrated.');}
else if(reportArgument){
 const reportPath=resolve(reportArgument.slice('--report='.length)),report={kind:'backend',database:'portal_test',startedAt:new Date().toISOString(),results:[],errors:[]};mkdirSync(dirname(reportPath),{recursive:true});
 let failed=false;
 try{for(const file of all){
   const needsDatabase=integration.includes(file);if(needsDatabase)await reset();
   const suiteEnv={...env};for(const key of Object.keys(suiteEnv))if(/^TEST_.*DATABASE_URL$/.test(key))delete suiteEnv[key];if(needsDatabase)for(const key of databaseVariables(file))suiteEnv[key]=target;
   const outputPath=resolve(dirname(reportPath),file+'.json'),started=performance.now(),result=spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','run','tests/'+file,'--reporter=json','--outputFile='+outputPath],{env:suiteEnv,encoding:'utf8',maxBuffer:16*1024*1024});
   let details=null;try{details=JSON.parse(readFileSync(outputPath,'utf8'));}catch{}
   const row={file,exitCode:result.status,durationMs:Math.round(performance.now()-started),passed:details?.numPassedTests??0,failed:details?.numFailedTests??0,skipped:details?.numPendingTests??0,todo:details?.numTodoTests??0,report:outputPath,collectionErrors:details?.testResults?.flatMap(v=>v.message?[v.message]:[])??[],skipReason:/TEST_GITLAB_ISOLATED/.test(readFileSync('tests/'+file,'utf8'))&&!process.env.TEST_GITLAB_ISOLATED?'Real GitLab integration requires explicitly isolated resources':null};
   if(result.status!==0||!details){failed=true;writeFileSync(outputPath+'.log',(result.stdout||'')+(result.stderr||'')+(result.error?.message||''));}report.results.push(row);writeFileSync(reportPath,JSON.stringify(report,null,2));console.log(JSON.stringify({file,passed:row.passed,failed:row.failed,skipped:row.skipped,exitCode:row.exitCode,durationMs:row.durationMs}));if(failed&&!keepGoing)break;
  }}catch(error){failed=true;report.errors.push(error.message);}finally{try{await reset();}catch(error){failed=true;report.errors.push(error.message);}report.finishedAt=new Date().toISOString();report.ok=!failed&&report.results.length===all.length;writeFileSync(reportPath,JSON.stringify(report,null,2));}
 process.exitCode=failed?1:0;
}else try{
  const unitEnv={...env};for(const key of Object.keys(unitEnv))if(/^TEST_.*DATABASE_URL$/.test(key))delete unitEnv[key];
  if(unit.length)run(['node_modules/vitest/vitest.mjs','run',...unit.map(name=>`tests/${name}`)],unitEnv);
  for(const file of integration){
    await reset();
    const suiteEnv={...env};for(const key of databaseVariables(file))suiteEnv[key]=target;
    run(['node_modules/vitest/vitest.mjs','run',`tests/${file}`],suiteEnv);
  }
}finally{
  // Leave the disposable browser target empty, even when a suite failed.
  await reset();
}
