"""Prepare/install Qwen Code. No application source or business state is edited."""
from pathlib import Path
import argparse,hashlib,ipaddress,json,os,shutil,subprocess,sys,urllib.parse,urllib.request
ROOT=Path(__file__).resolve().parents[1];SOURCE=ROOT.parents[1]/'lab/qwen-code';INSTALL=Path('/opt/agentic-sdlc/portal/coding-executor');IMAGE='sdlc-qwen-code:prepared'
BROWSER_IMAGE='sdlc-coding-browser:prepared'
sys.path.insert(0,str(ROOT.parent/'scripts'))
from audit_admin import administrative_operation
def run(*args,capture=False):return subprocess.run(list(map(str,args)),check=True,text=True,stdout=subprocess.PIPE if capture else None,stderr=subprocess.PIPE if capture else None)
def image():return json.loads(run('docker','image','inspect',IMAGE,capture=True).stdout)[0]
def prepare():
 with administrative_operation('PORTAL_CODING_EXECUTOR_PREPARED',source='portal/coding-executor',details={'scope':'fixed-qwen-code-0.26.4-sdk-0.1.26-no-application'}) as operation:
  run('docker','build','-t',IMAGE,'-f',SOURCE/'Dockerfile',SOURCE);value=image()
  # This cache contains only pinned dependencies and Chromium, never a project.
  cached='sdlc-portal-regression:toolchain'
  available=subprocess.run(['docker','image','inspect',cached],text=True,capture_output=True)
  browser_base=json.loads(available.stdout)[0] if available.returncode==0 else None
  locked=run('docker','run','--rm','--pull','never','--network','none','--entrypoint','cat',browser_base['Id'],'/app/pnpm-lock.yaml',capture=True).stdout if browser_base else None
  if locked!=(ROOT/'pnpm-lock.yaml').read_text():
   run('docker','build','-f',ROOT/'infra/Dockerfile.regression','-t',cached,ROOT)
   browser_base=json.loads(run('docker','image','inspect',cached,capture=True).stdout)[0]
  run('docker','build','--network','none','--build-arg','BROWSER_TOOLCHAIN='+browser_base['Id'],'-t',BROWSER_IMAGE,'-f',ROOT/'infra/Dockerfile.coding-browser',ROOT)
  browser=json.loads(run('docker','image','inspect',BROWSER_IMAGE,capture=True).stdout)[0];operation.result(imageId=value['Id'],browserImageId=browser['Id'])
 print(json.dumps({'prepared':True,'imageId':value['Id'],'browserImageId':browser['Id']}))
def install(model=None):
 if os.geteuid()!=0 or not Path('/etc/agentic-sdlc-owner').is_file():raise RuntimeError('Owned SDLC and administrator required')
 if INSTALL.is_symlink() or INSTALL.parent.is_symlink() or (INSTALL.exists() and not (INSTALL/'installation.json').is_file()):raise RuntimeError('Keep unowned installation')
 for receipt in (INSTALL/'state').glob('*/receipt.json'):
  if json.loads(receipt.read_text()).get('state') in ['queued','running']:raise RuntimeError('Wait for active coding jobs')
 base=image()
 browser=json.loads(run('docker','image','inspect',BROWSER_IMAGE,capture=True).stdout)[0]
 if browser['Config'].get('Labels',{}).get('org.sdlc.coding-browser')!='react-entry-v1':raise RuntimeError('Prepare the isolated browser validator')
 for name in ['coding-browser.mjs','browser-controls.mjs']:
  actual=run('docker','run','--rm','--pull','never','--network','none','--entrypoint','cat',browser['Id'],'/opt/sdlc/'+name,capture=True).stdout
  if actual!=(ROOT/'executor'/name).read_text():raise RuntimeError('Browser source differs; run prepare-agents')
 if base['Config'].get('Labels',{}).get('org.sdlc.qwen-code-version')!='0.26.4':raise RuntimeError('Prepare the pinned Qwen toolchain')
 relay=json.loads(Path('/opt/agentic-sdlc/portal/llm-relay/config.json').read_text());upstream=relay['upstream'];url=urllib.parse.urlsplit(upstream)
 if url.scheme!='http' or not ipaddress.ip_address(url.hostname).is_private or url.username or url.password or url.path not in ['', '/'] or url.query or url.fragment:raise RuntimeError('Only the configured internal inference service is supported')
 # Coding is a separate role: changing the conversational/planning provider
 # must not silently change the qualified native tool-calling model.
 model=model or 'qwen3:14b'
 with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(upstream+'/api/tags',timeout=4) as response:models=json.load(response)
 if model not in {m['name'] for m in models.get('models',[])}:raise RuntimeError('Prepare and qualify the selected local model first')
 for name in ['workspace.mjs','runner.mjs','ui-probes.mjs','patch.mjs']:
  actual=run('docker','run','--rm','--pull','never','--network','none','--entrypoint','cat',base['Id'],'/opt/qwen-code/'+name,capture=True).stdout
  if actual!=(SOURCE/name).read_text():raise RuntimeError('Tool source differs; run prepare-agents')
 source=ROOT/'executor/coding_service.py';fingerprint=hashlib.sha256(b''.join((ROOT/'executor'/name).read_bytes() for name in ['coding_service.py','coding_browser.py','coding-browser.mjs','coding_workflow.py','coding_ui_agent.py','browser-controls.mjs','coding_micro.py'])).hexdigest()
 with administrative_operation('PORTAL_CODING_EXECUTOR_INSTALLED',source='portal/coding-executor',details={'scope':'networkless-coding-private-unix-sockets-no-business-data','imageId':base['Id'],'manifestDigest':fingerprint,'model':model}) as operation:
  INSTALL.mkdir(exist_ok=True,mode=0o700);os.chmod(INSTALL,0o700)
  for name,mode in [('socket',0o755),('inference',0o700),('state',0o700)]:
   (INSTALL/name).mkdir(exist_ok=True);os.chmod(INSTALL/name,mode)
  shutil.copyfile(source,INSTALL/'service.py');os.chmod(INSTALL/'service.py',0o600)
  shutil.copyfile(ROOT/'executor/coding_browser.py',INSTALL/'coding_browser.py');os.chmod(INSTALL/'coding_browser.py',0o600)
  shutil.copyfile(ROOT/'executor/coding_workflow.py',INSTALL/'coding_workflow.py');os.chmod(INSTALL/'coding_workflow.py',0o600)
  shutil.copyfile(ROOT/'executor/coding_ui_agent.py',INSTALL/'coding_ui_agent.py');os.chmod(INSTALL/'coding_ui_agent.py',0o600)
  shutil.copyfile(ROOT/'executor/coding_micro.py',INSTALL/'coding_micro.py');os.chmod(INSTALL/'coding_micro.py',0o600)
  config={'stateRoot':str(INSTALL/'state'),'socketPath':str(INSTALL/'socket/executor.sock'),'inferenceSocket':str(INSTALL/'inference/inference.sock'),'imageId':base['Id'],'browserImageId':browser['Id'],'model':model,'upstream':upstream,'workflow':'focused-local-v1','implementationMode':'micro-json-v1','microThinking':False}
  for name,value in [('config.json',config),('installation.json',{'policy':'qwen-code-node24-v1','sourceDigest':fingerprint,'imageId':base['Id'],'model':model})]:
   (INSTALL/name).write_text(json.dumps({**value,'browserImageId':browser['Id']},indent=2));os.chmod(INSTALL/name,0o600)
  unit=Path('/etc/systemd/system/sdlc-coding-executor.service')
  if unit.exists() and 'SDLC networkless Qwen Code executor' not in unit.read_text():raise RuntimeError('Keep unowned service')
  unit.write_text('[Unit]\nDescription=SDLC networkless Qwen Code executor\nAfter=docker.service\nRequires=docker.service\n[Service]\nType=simple\nExecStart=/usr/bin/python3 '+str(INSTALL/'service.py')+' --config '+str(INSTALL/'config.json')+'\nRestart=on-failure\nUMask=0077\nNoNewPrivileges=true\n[Install]\nWantedBy=multi-user.target\n')
  run('systemctl','daemon-reload');run('systemctl','enable','--now','sdlc-coding-executor.service');run('systemctl','restart','sdlc-coding-executor.service')
  override={'services':{'api':{'environment':{'CODING_EXECUTOR_SOCKET':'/run/sdlc-coding/executor.sock'},'volumes':[{'type':'bind','source':str(INSTALL/'socket'),'target':'/run/sdlc-coding','read_only':True}]}}}
  (ROOT/'.prepared/compose.coding-executor.json').write_text(json.dumps(override,indent=2));operation.result(imageId=base['Id'],model=model)
 print(json.dumps({'installed':True,'imageId':base['Id'],'model':model,'sourceDigest':fingerprint}))
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('command',choices=['prepare','install']);parser.add_argument('--model');args=parser.parse_args();prepare() if args.command=='prepare' else install(args.model)
