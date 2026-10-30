"""Opt-in real Unix-socket/Node/Docker target validation in exclusively owned fixtures."""
from pathlib import Path
import importlib.util,json,subprocess,sys,tempfile,time,uuid
from regression import ROOT,OUTPUT,IMAGE,OWNER,LABEL
sys.path.insert(0,str(ROOT.parent/'scripts'))
from audit_admin import administrative_operation
spec=importlib.util.spec_from_file_location('runtime_fixture',ROOT/'runtime/service.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
identifier=str(uuid.uuid4());directory=OUTPUT/('runtime-live-'+identifier[:8]);directory.mkdir(parents=True);name='sdlc-runtime-validation-'+identifier[:8];installation='validation-'+identifier
intent={'id':identifier,'kind':'prepare','systemId':'regression-system-'+identifier,'environmentId':'regression-environment-'+identifier,'repositoryId':'regression-repository-'+identifier,'profile':module.PROFILE,'unitId':'web','sourceSha':'a'*40,'contractDigest':'b'*64};intent['configDigest']=module.digest(module.canonical(module.configuration(intent)));(directory/'intent.json').write_text(json.dumps(intent))
def docker(*args,check=True):return subprocess.run(['docker',*map(str,args)],check=check,capture_output=True,text=True)
result={};service=None
with administrative_operation('PORTAL_REGRESSION_PROVIDER_VALIDATION',source='portal/runtime-validation',details={'scope':'owned-runtime-targets-only-no-pilot','path':directory.relative_to(ROOT).as_posix()},root=OUTPUT/'control') as operation,tempfile.TemporaryDirectory(prefix='sdlc-runtime-') as sockets:
 config={'stateRoot':str(directory/'state'),'socketPath':str(Path(sockets)/'executor.sock'),'installationId':installation};config_path=directory/'config.json';config_path.write_text(json.dumps(config));log=(directory/'service.log').open('w')
 try:
  service=subprocess.Popen([sys.executable,str(ROOT/'runtime/service.py'),'--config',str(config_path)],stdout=subprocess.DEVNULL,stderr=log)
  for _ in range(100):
   if Path(config['socketPath']).exists():break
   if service.poll() is not None:raise RuntimeError('Isolated runtime service exited')
   time.sleep(.1)
  docker('run','-d','--pull','never','--name',name,'--network','none','--label',LABEL+'='+OWNER,'--mount','type=bind,src='+str(ROOT)+',dst=/source,readonly','--mount','type=bind,src='+str(directory)+',dst=/reports','--mount','type=bind,src='+sockets+',dst=/runtime-socket,readonly','-e','REGRESSION_TEST_HOST=1','-e','REGRESSION_RESOURCE_ID='+OWNER+'-runtime-validation','--entrypoint','sleep',IMAGE,'infinity')
  docker('exec','-w','/app',name,'node','/source/scripts/regression-sync.mjs');checked=docker('exec','-w','/app',name,'node','--import','tsx','tests/runtime-live.mjs',check=False);(directory/'provider.stdout.log').write_text(checked.stdout);(directory/'provider.stderr.log').write_text(checked.stderr);assert checked.returncode==0,checked.stderr
  result=json.loads((directory/'runtime-live-provider.json').read_text());engine=module.Engine(config['stateRoot'],config);engine.write(engine.directory(identifier)/'receipt.json',{'id':identifier,'state':'unknown','code':'EXECUTOR_INTERRUPTED'});seen=engine.public(identifier);assert seen['state']=='succeeded' and seen['proof']==result['proof'];result.update(reconciledOwnEffect=True,networkInternal=True,noApplicationDeployment=True,operationId=operation.id)
 finally:
  if service:service.terminate();service.wait(timeout=10);log.close()
  inspection=docker('inspect',name,check=False)
  if inspection.returncode==0:
   assert json.loads(inspection.stdout)[0]['Config'].get('Labels',{}).get(LABEL)==OWNER;docker('rm','-f',name)
  own=docker('network','ls','-q','--filter','label=org.sdlc.installation='+installation).stdout.split()
  for network in own:
   data=json.loads(docker('network','inspect',network).stdout)[0];assert data['Labels'].get('org.sdlc.installation')==installation and not data.get('Containers');docker('network','rm',network)
  result['removedOwnNetworksAndContainer']=True;(directory/'validation.json').write_text(json.dumps(result,indent=2)+'\n')
 operation.result(count=1)
print(json.dumps(result));print('Runtime validation:',directory.name)
