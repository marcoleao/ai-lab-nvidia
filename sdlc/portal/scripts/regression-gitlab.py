"""Explicit live contract-provider validation against one owned temporary project."""
from pathlib import Path
import json,subprocess,sys,uuid
from regression import ROOT,OUTPUT,IMAGE,OWNER,LABEL
sys.path.insert(0,str(ROOT.parent/'scripts'))
from audit_admin import administrative_operation
name='sdlc-regression-contract-provider-live';directory=OUTPUT/('provider-live-'+uuid.uuid4().hex[:8]);directory.mkdir(parents=True)
extra=[]
if len(sys.argv)>1:
 if len(sys.argv)!=3 or sys.argv[1]!='--cleanup':raise SystemExit('Expected --cleanup path-to-own-receipt')
 receipt=Path(sys.argv[2]).resolve()
 if not receipt.is_relative_to(OUTPUT.resolve()) or receipt.name!='provider-live.json':raise SystemExit('Owned regression receipt required')
 value=json.loads(receipt.read_text());project_id=value.get('projectId');project_name=value.get('name','')
 if not isinstance(project_id,int) or project_id<=0 or not project_name.startswith('regression-contract-'):raise SystemExit('Own test-project reference required')
 extra=['-e','REGRESSION_LIVE_CLEANUP_ONLY=1','-e','REGRESSION_LIVE_PROJECT_ID='+str(project_id),'-e','REGRESSION_LIVE_PROJECT_NAME='+project_name]
def run(*args,**options):return subprocess.run(['docker',*map(str,args)],check=True,**options)
if subprocess.run(['docker','inspect',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:raise SystemExit('Keep existing live validation container')
secret=Path('/opt/agentic-sdlc/gitlab-demo/.secrets')
for token in ['token','merge_token']:
 if not (secret/token).is_file() or (secret/token).is_symlink():raise SystemExit('Expected local isolated GitLab credential source')
audit_root=OUTPUT/'control';audit_root.mkdir(exist_ok=True)
with administrative_operation('PORTAL_REGRESSION_PROVIDER_VALIDATION',source='portal/regression-live',details={'scope':'own-temporary-contract-project','path':directory.relative_to(ROOT).as_posix()},root=audit_root) as operation:
 try:
  run('run','-d','--pull','never','--name',name,'--network','host','--label',LABEL+'='+OWNER,'--mount','type=bind,src='+str(ROOT)+',dst=/source,readonly','--mount','type=bind,src='+str(directory)+',dst=/reports','--mount','type=bind,src='+str(secret/'token')+',dst=/run/secrets/gitlab-admin,readonly','--mount','type=bind,src='+str(secret/'merge_token')+',dst=/run/secrets/gitlab-merge,readonly','-e','DATABASE_URL=postgresql://test:only@127.0.0.1:1/portal_test','-e','REGRESSION_TEST_HOST=1','-e','REGRESSION_RESOURCE_ID='+OWNER+'-provider-live','-e','REGRESSION_LIVE_GITLAB=1',*extra,'--entrypoint','sleep',IMAGE,'infinity')
  run('exec','-w','/app',name,'node','/source/scripts/regression-sync.mjs',stdout=subprocess.DEVNULL)
  checked=subprocess.run(['docker','exec','-w','/app',name,'node','--import','tsx','tests/contract-integration-live.mjs'],text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
  (directory/'runner.stdout.log').write_text(checked.stdout);(directory/'runner.stderr.log').write_text(checked.stderr)
  value={}
  if (directory/'provider-live.json').is_file():
   value=json.loads((directory/'provider-live.json').read_text());value['operationId']=operation.id;(directory/'provider-live.json').write_text(json.dumps(value,indent=2));print(json.dumps(value,indent=2))
  operation.result('SUCCEEDED' if checked.returncode==0 else 'FAILED',exitCode=checked.returncode,projectId=value.get('projectId'),count=len(value.get('checks',[])))
 finally:
  inspected=subprocess.run(['docker','inspect',name],capture_output=True,text=True)
  if inspected.returncode==0:
   row=json.loads(inspected.stdout)[0]
   if row['Config'].get('Labels',{}).get(LABEL)!=OWNER:raise RuntimeError('Keep unowned live runner')
   run('rm','-f',name,stdout=subprocess.DEVNULL)
print('Live provider artifacts:',directory)
raise SystemExit(checked.returncode)
