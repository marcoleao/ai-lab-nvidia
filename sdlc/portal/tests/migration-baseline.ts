import {readdirSync,readFileSync} from 'node:fs';
import pg from 'pg';

// A historical migration test cannot inherit foreign keys from later migrations.
export async function migrationBaseline(url:string,through:string){
 if(new URL(url).pathname!=='/portal_test')throw Error('Disposable portal_test required');
 const folders=readdirSync('prisma/migrations').filter(name=>/^\d/.test(name)).sort();
 if(!folders.includes(through))throw Error('Unknown migration baseline');
 const sql=new pg.Client({connectionString:url});await sql.connect();
 try{
  if((await sql.query('SELECT current_database() name')).rows[0].name!=='portal_test')throw Error('Disposable portal_test required');
  await sql.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public; CREATE TABLE "_prisma_migrations" (id TEXT PRIMARY KEY)');
  for(const folder of folders.filter(name=>name<=through))await sql.query(readFileSync(`prisma/migrations/${folder}/migration.sql`,'utf8'));
 }finally{await sql.end();}
}
