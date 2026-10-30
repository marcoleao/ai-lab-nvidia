import {spawn} from 'node:child_process';import {readFileSync,writeFileSync,openSync,mkdirSync} from 'node:fs';
if(process.env.REGRESSION_TEST_HOST!=='1'||!process.env.REGRESSION_RESOURCE_ID||new URL(process.env.DATABASE_URL).pathname!=='/portal_test')throw Error('Owned regression services required');
mkdirSync('.regression',{recursive:true});let previous={};try{previous=JSON.parse(readFileSync('.regression/services.json','utf8'));}catch{}
const live=(pid,entry)=>{try{process.kill(pid,0);return readFileSync('/proc/'+pid+'/cmdline','utf8').split('\0').includes(entry);}catch{return false;}};
if(previous.resourceId===process.env.REGRESSION_RESOURCE_ID&&live(previous.api,'tests/support/server.mjs')&&live(previous.web,'apps/web/node_modules/next/dist/bin/next')){console.log(JSON.stringify({reused:true,...previous}));process.exit(0);}
// A partially stopped environment is restarted by the controller, never duplicated.
if(live(previous.api,'tests/support/server.mjs')||live(previous.web,'apps/web/node_modules/next/dist/bin/next'))throw Error('Partial services detected; restart the owned runner before continuing');
const launch=(name,args)=>{const log=openSync('.regression/'+name+'.log','a'),child=spawn(process.execPath,args,{detached:true,stdio:['ignore',log,log],env:process.env});child.unref();return child.pid;};
const value={resourceId:process.env.REGRESSION_RESOURCE_ID,api:launch('api',['--import','tsx','tests/support/server.mjs']),web:launch('web',['apps/web/node_modules/next/dist/bin/next','dev','apps/web','--hostname','0.0.0.0','--port','3000'])};writeFileSync('.regression/services.json',JSON.stringify(value));console.log(JSON.stringify({started:true,...value}));
