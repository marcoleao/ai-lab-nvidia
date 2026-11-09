import {readFileSync,readdirSync} from 'node:fs';
import type pg from 'pg';

// Test-only: reverse dependent migrations, then restore the current schema.
// One transaction also restores the starting schema if reapplication fails.
export async function cycleEmptyMigrations(client:Pick<pg.Client,'query'>,first:string){
 const database=await client.query('SELECT current_database() AS name');
 if(database.rows[0]?.name!=='portal_test')throw Error('Migration cycle requires disposable portal_test');
 const root='prisma/migrations',names=readdirSync(root).filter(name=>/^\d{12}_/.test(name)).sort();
 if(!names.includes(first))throw Error('Select an existing migration');
 const selected=names.filter(name=>name>=first);
 const body=(name:string,file:string)=>{
  const source=readFileSync(`${root}/${name}/${file}`,'utf8'),match=/^\s*BEGIN;([\s\S]*)COMMIT;\s*$/.exec(source);
  if(!match)throw Error(`Migration cycle requires an explicit transaction: ${name}/${file}`);
  return match[1];
 };
 // Resolve all scripts before changing the schema; missing rollback is an error.
 const rollback=[...selected].reverse().map(name=>body(name,'rollback.sql'));
 const forward=selected.map(name=>body(name,'migration.sql'));
 await client.query('BEGIN');
 try{
  for(const sql of rollback)await client.query(sql);
  for(const sql of forward)await client.query(sql);
  await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}
}
