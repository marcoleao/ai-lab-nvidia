import {spawn} from 'node:child_process';
import {cpSync} from 'node:fs';
cpSync('/source/tests','/app/prototype-tests',{recursive:true});
const server=spawn('node',['/source/scripts/static-server.mjs'],{env:{...process.env,PORT:'8080',HOST:'127.0.0.1'},stdio:'inherit'});
try{
  let ready=false;
  for(let i=0;i<30;i++){try{if((await fetch('http://127.0.0.1:8080/')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}
  if(!ready)throw Error('Servidor estático não iniciou');
  const test=spawn('node',['node_modules/@playwright/test/cli.js','test','--config','prototype-tests/playwright.config.mjs'],{cwd:'/app',env:{...process.env,PROTOTYPE_BASE_URL:'http://127.0.0.1:8080',TEST_OUTPUT_DIR:'/output/test-results',SCREENSHOT_DIR:'/output/screenshots'},stdio:'inherit'});
  process.exitCode=await new Promise(resolve=>test.on('exit',resolve));
}finally{server.kill();}
