"""Actual build, candidate failure and stable DEV gateway using only owned source fixtures."""
from pathlib import Path
import importlib.util,json,subprocess,sys,uuid,urllib.request,tempfile,threading,os
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT.parent/'scripts'))
from audit_admin import administrative_operation
def load(path,name):
 spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
build=load(ROOT/'executor/service.py','build');runtime=load(ROOT/'runtime/service.py','runtime');fixtures=load(ROOT/'tests/build-executor.test.py','fixtures')
with_tests='--with-tests' in sys.argv[1:]
identifier=('test-live-' if with_tests else 'deployment-live-')+uuid.uuid4().hex[:8];directory=ROOT/'test-results/regression'/identifier;directory.mkdir(parents=True);installation=identifier+'-installation';images=[];checks=[];test_receipts={}
def docker(*args):return subprocess.check_output(['docker',*args],text=True)
def runtime_docker(*args,**options):
 result=subprocess.run(['docker',*args],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=options.get('timeout',15))
 if result.returncode:
  with (directory/'docker-failure.log').open('ab') as log:log.write(runtime.canonical(list(args))+b'\n'+result.stderr+b'\n')
  raise runtime.RuntimeFailure('RUNTIME_UNAVAILABLE')
 return result.stdout
base=json.loads(docker('image','inspect','sdlc-node24-react:prepared'))[0]['Id'];config={'installationId':installation,'buildStateRoot':str(directory/'builds')};engine=runtime.Engine(directory/'runtime',config,run=runtime_docker)
def trace(frame,event,arg):
 if event=='exception' and frame.f_code.co_filename==str(ROOT/'runtime/service.py'):
  with (directory/'isolated-exceptions.log').open('a') as log:log.write(str(frame.f_lineno)+' '+str(arg[0].__name__)+': '+str(arg[1])+'\n')
 return trace
sys.settrace(trace)
with administrative_operation('PORTAL_REGRESSION_PROVIDER_VALIDATION',source='portal/deployment-validation',details={'scope':'owned-build-runtime-fixtures-no-pilot','path':directory.relative_to(ROOT).as_posix()},root=ROOT/'test-results/regression/control') as operation:
 try:
  files,source=fixtures.fixture();source.update(id=identifier+'-build1',baseImageId=base);files['scripts/build.mjs']=b"import fs from 'node:fs';fs.mkdirSync('dist',{recursive:true});fs.writeFileSync('dist/app.js','export const compiled=true;')"
  if with_tests:files['tests/dev-http.json']=runtime.canonical({'schemaVersion':1,'scope':'acceptance','cases':[{'id':'own-order','name':'Requisição de fixture isolada','method':'POST','path':'/orders','status':201,'contains':'fixture','body':{'fixture':identifier},'criterionIndices':[0]},{'id':'expected-state','name':'Estado esperado da fixture','method':'GET','path':'/expected','status':200,'contains':'fixture','criterionIndices':[0]}]})
  def artifact(number,healthy):
   intent={**source,'id':identifier+'-build'+str(number)};files['server.mjs']=("import http from 'node:http';let orders=0;http.createServer((req,res)=>{res.statusCode=req.url==='/health'?"+('200' if healthy else '503')+":req.method==='POST'?(orders++,201):req.url==='/expected'&&orders!==1?409:200;res.end(req.url==='/count'?String(orders):'fixture "+str(number)+"')}).listen(8080,'0.0.0.0');").encode();builder=build.Engine(directory/'builds',{'baseImageId':base,'packages':{}},fetch=lambda _:fixtures.archive(files));builder.accept(intent,background=False);builder.execute(intent);receipt=builder.public(intent['id']);assert receipt['state']=='succeeded',receipt;images.append(receipt['imageId']);return intent,receipt
  source,receipt=artifact(1,True)
  target={'id':identifier+'-target','kind':'prepare','systemId':identifier+'-system','environmentId':identifier+'-environment','repositoryId':identifier+'-repository','profile':runtime.PROFILE,'unitId':'web','sourceSha':source['sourceSha'],'contractDigest':source['contractDigest']};target['configDigest']=runtime.digest(runtime.canonical(runtime.configuration(target)));engine.accept(target,background=False);engine.execute(target);assert engine.public(target['id'])['state']=='succeeded'
  def deploy(number,b,r,previous):
   intent={**target,'id':identifier+'-deploy'+str(number),'kind':'deploy','storyId':identifier+'-story','buildId':b['id'],'projectId':b['projectId'],'imageId':r['imageId'],'archiveDigest':r['archiveDigest'],'artifactSize':r['size'],'expectedDeploymentId':previous};engine.accept(intent,background=False);engine.execute(intent);return intent,engine.public(intent['id'])
  first,positive=deploy(1,source,receipt,None);assert positive['state']=='succeeded',positive;url=positive['proof']['url'];assert urllib.request.urlopen(url+'/health').status==200;checks.append('built-image-deployed-and-healthy')
  data=json.loads(docker('inspect',positive['proof']['containerId']))[0];assert data['HostConfig']['ReadonlyRootfs'] and data['Config']['User']=='1000:1000' and data['HostConfig']['Memory']==536870912 and data['HostConfig']['CapDrop']==['ALL'];assert not data['HostConfig']['PortBindings'];checks.append('bounded-nonroot-readonly-loopback-runtime')
  assert engine.accept(first,background=False)==positive
  try:engine.accept({**first,'sourceSha':'9'*40},background=False);raise AssertionError('retarget accepted')
  except runtime.RuntimeFailure:pass
  checks.append('replay-and-retarget-protection')
  if with_tests:
   plan=engine.test_plan(first);test_intent={**first,'kind':'test','id':identifier+'-tests1','deploymentId':first['id'],'suiteDigest':plan['suiteDigest'],'policyVersion':'dev-http-v1'};engine.accept(test_intent,background=False);engine.execute(test_intent);passed=engine.public(test_intent['id']);assert passed['state']=='succeeded',passed
   assert urllib.request.urlopen(url+'/count').read()==b'1';assert engine.accept(test_intent,background=False)==passed;engine.execute(test_intent);assert urllib.request.urlopen(url+'/count').read()==b'1';checks.append('actual-http-suite-passed-and-replay-did-not-repeat-post')
   retry={**test_intent,'id':identifier+'-tests2'};engine.accept(retry,background=False);engine.execute(retry);failed_test=engine.public(retry['id']);assert failed_test['state']=='failed' and failed_test['proof']['cases'][1]['actualStatus']==409;assert urllib.request.urlopen(url+'/health').status==200;checks.append('actual-functional-rejection-with-healthy-deployment')
   test_receipts={'passed':passed,'failed':failed_test,'failedIntent':retry}
  negativeSource,negativeReceipt=artifact(2,False);negative,failed=deploy(2,negativeSource,negativeReceipt,first['id']);assert failed['state']=='failed',failed;assert engine.active(first)['id']==first['id'];assert urllib.request.urlopen(url+'/health').status==200;checks.append('unhealthy-candidate-preserves-previous')
  replacementSource,replacementReceipt=artifact(3,True);replacement,replaced=deploy(3,replacementSource,replacementReceipt,first['id']);assert replaced['state']=='succeeded' and replaced['proof']['url']==url;assert urllib.request.urlopen(url).read()==b'fixture 3';assert engine.deployment_observation(first)['state']=='changed';checks.append('healthy-replacement-stable-url')
  if with_tests:
   try:engine.test_plan(first);raise AssertionError('Old deployment accepted')
   except runtime.RuntimeFailure as error:assert str(error)=='DEPLOYMENT_CHANGED'
   checks.append('old-deployment-cannot-be-tested-after-replacement')
   (directory/'node-client.json').write_text(json.dumps({'test':test_receipts['failedIntent'],'deployment':replacement}))
   with tempfile.TemporaryDirectory(prefix='sdlc-test-socket-') as socket_root:
    os.chmod(socket_root,0o755);socket_path=str(Path(socket_root)/'executor.sock');server=runtime.UnixHTTPServer(socket_path,runtime.Handler);server.engine=engine;os.chown(socket_path,0,1000);os.chmod(socket_path,0o660);threading.Thread(target=server.serve_forever,daemon=True).start()
    try:
     code="""import assert from 'node:assert/strict';import fs from 'node:fs';import {LocalRuntimeProvider} from './apps/api/src/runtime-provider.ts';import {LocalDevelopmentTestProvider} from './apps/api/src/development-test-provider.ts';import {LocalDeploymentProvider} from './apps/api/src/deployment-provider.ts';const data=JSON.parse(fs.readFileSync('/reports/node-client.json','utf8'));const runtime=new LocalRuntimeProvider({base:'http://disabled.invalid',token:'',root:'isolated',socketPath:'/socket/executor.sock'},{});const tests=new LocalDevelopmentTestProvider(runtime),deployments=new LocalDeploymentProvider(runtime);assert.equal((await tests.health()).ready,true);assert.equal((await deployments.health()).ready,true);const result=await tests.read(data.test);assert.equal(result.state,'failed');assert.equal(result.proof.cases[1].actualStatus,409);const plan=await tests.plan(data.deployment);assert.equal(plan.mutatesData,true);assert.equal(plan.cases.length,2);process.stdout.write(JSON.stringify({typedNodeSocketClient:true,failedCases:1,planCases:2}));"""
     mounts=[]
     for file in ['apps/api/src/runtime-provider.ts','apps/api/src/deployment-provider.ts','apps/api/src/development-test-provider.ts','packages/shared/src/environment-runtime.ts']:
      mounts.extend(['--mount','type=bind,src='+str(ROOT/file)+',dst=/app/'+file+',readonly'])
     client=docker('run','--rm','--pull','never','--name',identifier+'-client','--network','none','--user','1000:1000','--read-only','--tmpfs','/tmp:size=64m,mode=1777','--cap-drop','ALL','--security-opt','no-new-privileges:true','--memory','512m','--cpus','1','--pids-limit','128','--label','org.sdlc.installation='+installation,*mounts,'--mount','type=bind,src='+str(directory)+',dst=/reports,readonly','--mount','type=bind,src='+socket_root+',dst=/socket,readonly','--workdir','/app','--entrypoint','node','sdlc-portal-regression:toolchain','--import','tsx','--input-type=module','-e',code);test_receipts['nodeSocket']=json.loads(client);checks.append('typed-node-client-real-unix-socket-proof-and-plan')
    finally:server.shutdown();server.server_close()
  engine.write(engine.directory(replacement['id'])/'receipt.json',{'id':replacement['id'],'state':'unknown'});assert engine.public(replacement['id'])['state']=='succeeded';checks.append('lost-receipt-read-only-reconciliation')
  value={'passed':True,'operationId':operation.id,'checks':checks,'first':positive,'replacement':replaced,'tests':test_receipts,'scope':'actual owned Docker builds, deployments and optional HTTP tests; no portal database, GitLab fetch, business data or pilot source changed'}
 finally:
  for gateway in engine.gateways.values():gateway.shutdown();gateway.server_close()
  for container in docker('ps','-a','-q','--filter','label=org.sdlc.installation='+installation).split():
   data=json.loads(docker('inspect',container))[0];assert data['Config']['Labels']['org.sdlc.installation']==installation;docker('rm','-f',container)
  for network in docker('network','ls','-q','--filter','label=org.sdlc.installation='+installation).split():
   data=json.loads(docker('network','inspect',network))[0];assert data['Labels']['org.sdlc.installation']==installation and not data.get('Containers');docker('network','rm',network)
  for image in images:
   data=json.loads(docker('image','inspect',image))[0];assert data['Config']['Labels']['org.sdlc.build'].startswith(identifier);docker('image','rm',image)
  if 'value' in locals():value['ownedResourcesRemoved']=True;(directory/'validation.json').write_text(json.dumps(value,indent=2)+'\n')
 operation.result(count=len(checks))
print(json.dumps(value));print('Deployment validation:',directory.name)
