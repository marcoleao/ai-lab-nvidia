"""Opt-in browser-only pilot checks on an already published DEV application."""
from pathlib import Path
import argparse
import hashlib
import json
import re
import subprocess
import sys
import time
from urllib.parse import urlsplit
from uuid import uuid4

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT.parent/'scripts'))
from audit_admin import administrative_operation

def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--dev-url',required=True);parser.add_argument('--source-sha',required=True);parser.add_argument('--image-id',required=True)
 args=parser.parse_args();url=urlsplit(args.dev_url)
 if url.scheme!='http' or url.hostname not in ['localhost','127.0.0.1'] or not url.port or url.port<1024 or url.username or url.password or url.path not in ['','/'] or url.query or url.fragment:parser.error('Use only the confirmed loopback DEV root URL.')
 if not re.fullmatch('[a-f0-9]{40}',args.source_sha) or not re.fullmatch('sha256:[a-f0-9]{64}',args.image_id):parser.error('Use source and image identities observed in the Portal.')
 script=ROOT/'tests/pilot-ui/jewelry-photos.mjs';source_digest=hashlib.sha256(script.read_bytes()).hexdigest();controller=Path(__file__);controller_digest=hashlib.sha256(controller.read_bytes()).hexdigest()
 browser_image=json.loads(subprocess.check_output(['docker','image','inspect','sdlc-portal-regression:toolchain'],text=True))[0]['Id']
 identifier='photo-ui-'+time.strftime('%Y%m%dT%H%M%SZ',time.gmtime())+'-'+uuid4().hex[:6]
 output=ROOT/'test-results/user-journeys'/identifier;output.mkdir(parents=True,exist_ok=False)
 manifest={'runId':identifier,'harness':str(script.relative_to(ROOT)),'harnessSha256':source_digest,'controllerSha256':controller_digest,'browserImageId':browser_image,'devUrl':args.dev_url,'sourceShaObservedInPortal':args.source_sha,'applicationImageObservedInPortal':args.image_id,'method':'Browser UI only; application identities supplied from Portal UI; no application backend verification','state':'started'}
 (output/'run-manifest.json').write_text(json.dumps(manifest,indent=2))
 name='sdlc-'+identifier;control=ROOT/'test-results/regression/control'
 with administrative_operation('PORTAL_REGRESSION_RUN',source='portal/pilot-ui',root=control,details={'command':'browser','scope':identifier,'manifestDigest':source_digest}) as run:
  with administrative_operation('PORTAL_REGRESSION_ENVIRONMENT',source='browser-fixture',root=control,details={'command':'up','scope':identifier}) as environment:
   command=['docker','run','--rm','--pull','never','--name',name,'--label','org.sdlc.pilot-ui='+identifier,'--network','host','--memory','1200m','--shm-size','512m','--mount','type=bind,src='+str(script)+',dst=/app/pilot-photo-ui.mjs,readonly','--mount','type=bind,src='+str(output)+',dst=/reports','--entrypoint','node',browser_image,'/app/pilot-photo-ui.mjs',args.dev_url,args.source_sha,args.image_id]
   try:result=subprocess.run(command,timeout=240)
   except subprocess.TimeoutExpired:
    observed=subprocess.run(['docker','inspect',name],capture_output=True,text=True)
    if observed.returncode==0 and json.loads(observed.stdout)[0]['Config']['Labels'].get('org.sdlc.pilot-ui')==identifier:subprocess.run(['docker','stop','--time','10',name],check=True,timeout=20,capture_output=True)
    raise
   environment.result('SUCCEEDED' if result.returncode==0 else 'FAILED',exitCode=result.returncode)
  with administrative_operation('PORTAL_REGRESSION_ENVIRONMENT',source='browser-fixture',root=control,details={'command':'down','scope':identifier}) as environment:
   if subprocess.run(['docker','inspect',name],capture_output=True).returncode==0:raise RuntimeError('Keep remaining test container until ownership/cleanup is confirmed')
   environment.result(count=1)
  stable=source_digest==hashlib.sha256(script.read_bytes()).hexdigest() and controller_digest==hashlib.sha256(controller.read_bytes()).hexdigest()
  report_path=output/'results.json';report=json.loads(report_path.read_text()) if report_path.is_file() else {}
  verified=report.get('ok') is True and report.get('passed')==6 and report.get('failed')==0 and report.get('blocked')==0 and report.get('sourceSha')==args.source_sha and report.get('imageId')==args.image_id and {row.get('id') for row in report.get('cases',[])}=={'PHOTO-UI-0'+str(i) for i in range(1,7)} and len(report.get('cases',[]))==6 and all(row.get('status')=='PASSED' for row in report.get('cases',[]))
  manifest.update(state='completed',sourceStable=stable,exitCode=result.returncode,reportVerified=verified,reportSha256=hashlib.sha256(report_path.read_bytes()).hexdigest() if report_path.exists() else None)
  (output/'run-manifest.json').write_text(json.dumps(manifest,indent=2))
  run.result('SUCCEEDED' if result.returncode==0 and stable and verified else 'FAILED',exitCode=result.returncode)
 print(json.dumps({'report':str(report_path),'sourceStable':stable,'reportVerified':verified,'exitCode':result.returncode}))
 raise SystemExit(result.returncode if result.returncode else 0 if stable and verified else 1)

if __name__=='__main__':main()
