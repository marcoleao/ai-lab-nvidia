"""Opt-in actual-container validation against owned fixtures, without any portal database or pilot mutation."""
from pathlib import Path
import importlib.util,io,json,subprocess,sys,uuid,tarfile
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT.parent/'scripts'))
from audit_admin import administrative_operation
def load(path,name):
 spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
service=load(ROOT/'executor/service.py','executor');fixtures=load(ROOT/'tests/build-executor.test.py','fixtures')
identifier='executor-live-'+uuid.uuid4().hex[:8];directory=ROOT/'test-results/regression'/identifier;directory.mkdir(parents=True)
base=json.loads(subprocess.check_output(['docker','image','inspect','sdlc-node24-react:prepared'],text=True))[0]['Id'];images=[];checks=[]
with administrative_operation('PORTAL_BUILD_EXECUTOR_VALIDATED',source='portal/build-executor-validation',details={'scope':'own-containers-and-fixtures-no-pilot-data','path':directory.relative_to(ROOT).as_posix()},root=ROOT/'test-results/regression/control') as operation:
 try:
  files,intent=fixtures.fixture();intent.update(id=identifier+'-positive',baseImageId=base)
  files['scripts/build.mjs']=b'''import fs from 'node:fs';import os from 'node:os';import assert from 'node:assert/strict';import {build} from 'esbuild';
assert.equal(process.getuid(),1000);assert.equal(fs.existsSync('/var/run/docker.sock'),false);assert.equal(process.env.GITLAB_TOKEN,undefined);assert.equal(process.env.DATABASE_URL,undefined);assert.deepEqual(Object.keys(os.networkInterfaces()),['lo']);assert.throws(()=>fs.writeFileSync('/outside-workspace','x'));const stat=fs.statfsSync('/app/work');assert(stat.blocks*stat.bsize<=128*1024*1024);
await build({stdin:{contents:'import React from "react"; export const page=<main>Isolated executor acceptance</main>;',resolveDir:process.cwd(),loader:'jsx'},bundle:true,format:'esm',outfile:'dist/app.js'});'''
  def checked_docker(*args,**options):
   result=service.docker(*args,**options)
   if args[0]=='exec' and 'tar' in args:
    with tarfile.open(fileobj=io.BytesIO(result),mode='r:') as archive:(directory/'output-layout.json').write_text(json.dumps([{'name':v.name,'directory':v.isdir(),'regular':v.isfile()} for v in archive],indent=2))
   return result
  engine=service.Engine(directory/'state',{'baseImageId':base,'packages':{}},fetch=lambda _:fixtures.archive(files),run=checked_docker)
  engine.accept(intent,background=False);engine.execute(intent);positive=engine.public(intent['id']);checks.append({'name':'real-react-build-and-sandbox','passed':positive['state']=='succeeded'})
  if positive['state']!='succeeded':raise RuntimeError('Actual build failed: '+positive.get('code','unknown'))
  images.append(positive['imageId']);subprocess.run(['docker','run','--rm','--pull','never','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true','--entrypoint','node',positive['imageId'],'-e',"const assert=require('assert');const fs=require('fs');assert(fs.readFileSync('/app/dist/app.js','utf8').includes('Isolated executor acceptance'));assert.equal(process.getuid(),1000)"],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  checks.append({'name':'packaged-image-contains-real-compiled-react','passed':True})
  negative={**intent,'id':identifier+'-negative'};files['scripts/build.mjs']=b"console.log('glpat-isolated-synthetic-output');process.exit(3)"
  engine.accept(negative,background=False);engine.execute(negative);failed=engine.public(negative['id']);assert failed=={'id':negative['id'],'state':'failed','code':'BUILD_FAILED'};checks.append({'name':'real-nonzero-failure-no-artifact-or-output-leak','passed':True})
  repeat=engine.accept(intent,background=False);assert repeat==positive;checks.append({'name':'same-request-recovers-same-artifact','passed':True})
  value={'version':1,'operationId':operation.id,'policy':service.POLICY,'baseImageId':base,'passed':True,'checks':checks,'artifact':positive,'removedImages':False,'scope':'Actual local containers using only isolated source fixtures; no GitLab archive fetch, application deployment, pilot code or portal database is exercised here.'}
 finally:
  for image in images:
   info=json.loads(subprocess.check_output(['docker','image','inspect',image],text=True))[0]
   if not info['Config'].get('Labels',{}).get('org.sdlc.build','').startswith(identifier):raise RuntimeError('Keep unowned image')
   subprocess.run(['docker','image','rm',image],check=True,stdout=subprocess.DEVNULL)
  pending=subprocess.check_output(['docker','ps','-a','--filter','label=org.sdlc.build','--format','{{.Names}}'],text=True)
  assert not any(identifier in name for name in pending.splitlines()),'Owned validation containers remain'
  if 'value' in locals():value['removedImages']=True;(directory/'executor-live.json').write_text(json.dumps(value,indent=2)+'\n')
 operation.result(count=len(checks),imageId=base)
print(json.dumps(value,indent=2))
