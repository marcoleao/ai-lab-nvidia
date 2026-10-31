"""Opt-in local-model qualification with synthetic facts, never pilot/portal data."""
from pathlib import Path
from datetime import datetime,timezone
import argparse,hashlib,ipaddress,json,subprocess,sys,urllib.parse,uuid
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT.parent/'scripts'))
from audit_admin import administrative_operation
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--models',nargs='+',required=True);args=parser.parse_args()
 relay=json.loads(Path('/opt/agentic-sdlc/portal/llm-relay/config.json').read_text());upstream=relay['upstream'];url=urllib.parse.urlsplit(upstream)
 if url.scheme!='http' or not ipaddress.ip_address(url.hostname).is_private or url.username or url.password or url.path not in ['','/'] or url.query or url.fragment:raise RuntimeError('Configured private local inference required')
 identifier='planning-live-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:6];output=ROOT/'test-results/regression'/identifier;output.mkdir(parents=True)
 source=['apps/api/src/plans.ts','apps/api/src/plan-schema.ts','apps/api/src/assistant.ts','apps/api/src/story-slicing.ts','apps/api/src/requirements.ts','scripts/validate-story-slicing.mjs'];fingerprint=hashlib.sha256(b''.join((ROOT/name).read_bytes() for name in source)).hexdigest()
 image=json.loads(subprocess.check_output(['docker','image','inspect','sdlc-portal:prepared'],text=True))[0]['Id'];report={'sourceMode':'current-source-readonly-overlay','sourceDigest':fingerprint,'imageId':image,'synthetic':True,'applicationDataUsed':False,'productionConfigurationChanged':False,'results':[]}
 with administrative_operation('PORTAL_REGRESSION_PROVIDER_VALIDATION',source='provider-validation',root=ROOT/'test-results/regression/control',details={'scope':'three-story-slicing-synthetic','manifestDigest':fingerprint,'imageId':image,'count':len(args.models)}) as operation:
  for index,model in enumerate(args.models):
   if not model or len(model)>128 or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:._-/' for c in model):raise ValueError('Invalid local model name')
   directory=output/str(index);directory.mkdir();config=directory/'config-private.json';config.write_text(json.dumps({'upstream':upstream,'model':model}));config.chmod(0o444)
   mounts=[]
   for name in source:mounts+=['--mount',f'type=bind,src={ROOT/name},dst=/app/{name},readonly']
   name='sdlc-planning-qualification-'+uuid.uuid4().hex[:16]
   command=['docker','run','--rm','--name',name,'--label','org.sdlc.provider-qualification='+identifier,'--pull','never','--network','host','--user','root','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','128','--memory','1g','--tmpfs','/tmp:mode=0700',*mounts,'--mount',f'type=bind,src={ROOT}/scripts/validate-story-slicing.mjs,dst=/request/qualification.mjs,readonly','--mount',f'type=bind,src={config},dst=/request/config.json,readonly','--mount',f'type=bind,src={directory},dst=/reports','--entrypoint','node',image,'--import','tsx','/request/qualification.mjs']
   try:
    done=subprocess.run(command,text=True,capture_output=True,timeout=260);(directory/'private-stderr.log').write_text(done.stderr)
   except subprocess.TimeoutExpired:
    (directory/'result.json').write_text(json.dumps({'model':model,'passed':False,'code':'RUNNER_TIMEOUT'}))
   finally:
    inspected=subprocess.run(['docker','inspect',name],text=True,capture_output=True)
    if inspected.returncode==0:
     container=json.loads(inspected.stdout)[0]
     if container.get('Config',{}).get('Labels',{}).get('org.sdlc.provider-qualification')!=identifier:raise RuntimeError('Keep unowned qualification resource')
     subprocess.run(['docker','stop','--timeout','3',name],check=True,capture_output=True,timeout=10)
   result=json.loads((directory/'result.json').read_text()) if (directory/'result.json').exists() else {'model':model,'passed':False,'code':'RUNNER_FAILED'};report['results'].append(result);(output/'qualification.json').write_text(json.dumps(report,indent=2));print(json.dumps(result),flush=True)
  report['sourceStable']=hashlib.sha256(b''.join((ROOT/name).read_bytes() for name in source)).hexdigest()==fingerprint;passed=report['sourceStable'] and all(row['passed'] for row in report['results']);(output/'qualification.json').write_text(json.dumps(report,indent=2));operation.result('SUCCEEDED' if passed else 'FAILED',count=sum(row['passed'] for row in report['results']))
 print(json.dumps({'report':str(output/'qualification.json')}));return int(not passed)
if __name__=='__main__':raise SystemExit(main())
