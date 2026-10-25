// Every database suite owns a fresh schema in the explicitly disposable database.
// Never call this runner with the acceptance database.
import {readdirSync,readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import pg from 'pg';

const target=process.env.TEST_DATABASE_URL;
if(!target||new URL(target).pathname!=='/portal_test')throw new Error('TEST_DATABASE_URL must name the disposable portal_test database');
if(process.env.DATABASE_URL&&new URL(process.env.DATABASE_URL).pathname!=='/portal_test')throw new Error('DATABASE_URL must also point to portal_test');
const env={...process.env,DATABASE_URL:target};
const all=readdirSync('tests').filter(name=>name.endsWith('.test.ts')).sort();
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
try{
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
