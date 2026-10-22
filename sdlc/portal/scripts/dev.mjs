import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
if(existsSync('.env'))process.loadEnvFile('.env');
process.env.API_BASE_URL??='http://127.0.0.1:4100';
const child=spawn('pnpm',['--parallel','--filter','@sdlc/api','--filter','@sdlc/web','dev'],{stdio:'inherit',env:process.env,shell:process.platform==='win32'});
child.on('exit',code=>process.exit(code??1));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
