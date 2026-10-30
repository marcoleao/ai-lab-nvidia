"""Owned project: source-bound build/HTTP test, required GitLab pipeline, merge and archive build."""
from pathlib import Path
import importlib.util,json,subprocess,sys,uuid,tempfile,time
from regression import ROOT,OUTPUT,IMAGE,OWNER,LABEL
sys.path.insert(0,str(ROOT.parent/'scripts'))
from audit_admin import administrative_operation
identifier=uuid.uuid4().hex[:8];name='sdlc-regression-application-'+identifier;directory=OUTPUT/('application-live-'+identifier);directory.mkdir(parents=True);secret=Path('/opt/agentic-sdlc/gitlab-demo/.secrets')
def run(*args,**options):return subprocess.run(['docker',*map(str,args)],check=True,**options)
def read(path):return json.loads(path.read_text())
if subprocess.run(['docker','inspect',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:raise RuntimeError('Keep existing fixture container')
image_id=json.loads(subprocess.check_output(['docker','image','inspect','sdlc-node24-react:prepared'],text=True))[0]['Id'];artifact=None;result={};cleanup={};source={};service=None
with administrative_operation('PORTAL_REGRESSION_PROVIDER_VALIDATION',source='portal/application-validation',details={'scope':'owned-source-build-http-required-pipeline-merge','path':directory.relative_to(ROOT).as_posix()},root=OUTPUT/'control') as operation,tempfile.TemporaryDirectory(prefix='sdlc-preparation-') as socket_directory:
 config={'stateRoot':str(directory/'preparation-state'),'socketPath':str(Path(socket_directory)/'executor.sock'),'baseImageId':image_id,'packages':{'react':'19.3.1','react-dom':'19.3.1','esbuild':'0.28.2'},'gitlabBase':'http://127.0.0.1:3180','gitlabRoot':'sdlc','gitlabTokenFile':str(secret/'merge_token')};config_path=directory/'executor-config.json';config_path.write_text(json.dumps(config))
 try:
  service_log=(directory/'executor-service.log').open('w');service=subprocess.Popen([sys.executable,str(ROOT/'executor/service.py'),'--config',str(config_path)],stdout=subprocess.DEVNULL,stderr=service_log)
  for attempt in range(60):
   if Path(config['socketPath']).exists():break
   if service.poll() is not None:raise RuntimeError('Isolated executor exited')
   time.sleep(.1)
  else:raise RuntimeError('Isolated executor socket did not start')
  run('run','-d','--pull','never','--name',name,'--network','host','--label',LABEL+'='+OWNER,'--mount','type=bind,src='+str(ROOT)+',dst=/source,readonly','--mount','type=bind,src='+str(directory)+',dst=/reports','--mount','type=bind,src='+socket_directory+',dst=/application-executor,readonly','--mount','type=bind,src='+str(secret/'token')+',dst=/run/secrets/gitlab-admin,readonly','--mount','type=bind,src='+str(secret/'merge_token')+',dst=/run/secrets/gitlab-merge,readonly','-e','DATABASE_URL=postgresql://test:only@127.0.0.1:1/portal_test','-e','REGRESSION_TEST_HOST=1','-e','REGRESSION_RESOURCE_ID='+OWNER+'-application-live','-e','REGRESSION_LIVE_GITLAB=1','--entrypoint','sleep',IMAGE,'infinity')
  run('exec','-w','/app',name,'node','/source/scripts/regression-sync.mjs',stdout=subprocess.DEVNULL)
  checked=subprocess.run(['docker','exec','-w','/app',name,'node','--import','tsx','tests/application-preparation-live.mjs'],capture_output=True,text=True);(directory/'provider.stdout.log').write_text(checked.stdout);(directory/'provider.stderr.log').write_text(checked.stderr);source=read(directory/'application-provider.json');assert checked.returncode==0 and source['passed'],source
  spec=importlib.util.spec_from_file_location('executor',ROOT/'executor/service.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
  intent={'id':'regression-application-'+identifier,'projectId':source['projectId'],'sourceSha':source['integrationSha'],'contractDigest':source['contractDigest'],'unitId':source['unitId'],'baseImageId':image_id,'policyVersion':'node24-react-v1'}
  engine=module.Engine(directory/'integrated-build',config);engine.accept(intent,background=False);engine.execute(intent);artifact=engine.public(intent['id']);assert artifact['state']=='succeeded',artifact
  smoke=subprocess.run(['docker','run','--rm','--pull','never','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true','--memory','256m','--pids-limit','64','--entrypoint','node',artifact['imageId'],'scripts/test.mjs'],capture_output=True,text=True,timeout=30);(directory/'technical-smoke.stdout.log').write_text(smoke.stdout);(directory/'technical-smoke.stderr.log').write_text(smoke.stderr);assert smoke.returncode==0,'Integrated starter smoke failed'
  result={'version':1,'operationId':operation.id,'passed':True,'provider':source,'artifact':artifact,'technicalSmokeExitCode':0,'scope':'Owned GitLab project and isolated executor only; required pipeline approved by actual exact-source build/HTTP test; no pilot/database or DEV/QA deployment altered.'}
 finally:
  if service:service.terminate();service.wait(timeout=10);service_log.close()
  try:
   source=read(directory/'application-provider.json') if (directory/'application-provider.json').exists() else {}
   if source.get('projectId'):
    checked=subprocess.run(['docker','exec','-w','/app','-e','REG_APP_CLEANUP=1','-e','REG_APP_ID='+str(source['projectId']),'-e','REG_APP_NAME='+source['name'],name,'node','--import','tsx','tests/application-preparation-live.mjs'],capture_output=True,text=True);cleanup=read(directory/'application-cleanup.json');assert checked.returncode==0 and cleanup['removed'],'Own GitLab cleanup unconfirmed'
  finally:
   own_ids={'regression-application-'+identifier}
   if source.get('validationOperationId'):own_ids.add(source['validationOperationId'])
   for own in own_ids:
    containers=subprocess.check_output(['docker','ps','-a','-q','--filter','label=org.sdlc.build='+own],text=True).split()
    for container in containers:
     data=json.loads(subprocess.check_output(['docker','inspect',container],text=True))[0];assert data['Config'].get('Labels',{}).get('org.sdlc.build')==own;run('rm','-f',container,stdout=subprocess.DEVNULL)
    images=subprocess.check_output(['docker','image','ls','--no-trunc','-q','--filter','label=org.sdlc.build='+own],text=True).split()
    for image in set(images):
     data=json.loads(subprocess.check_output(['docker','image','inspect',image],text=True))[0];assert data['Config'].get('Labels',{}).get('org.sdlc.build')==own;run('image','rm',image,stdout=subprocess.DEVNULL)
   inspection=subprocess.run(['docker','inspect',name],capture_output=True,text=True)
   if inspection.returncode==0:
    owned=json.loads(inspection.stdout)[0];assert owned['Config'].get('Labels',{}).get(LABEL)==OWNER;run('rm','-f',name,stdout=subprocess.DEVNULL)
   result.update(provider=source,cleanup=cleanup,removedOwnImagesAndContainers=True);(directory/'application-live.json').write_text(json.dumps(result,indent=2)+'\n')
 operation.result(projectId=source['projectId'],imageId=image_id,count=7)
print(json.dumps(result,indent=2));print('Application validation:',directory.name)
