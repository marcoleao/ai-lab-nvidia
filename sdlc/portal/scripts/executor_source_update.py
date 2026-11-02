"""Refresh installed sources and an optional qualified browser image reference.

Internal maintenance primitive. The existing installation audit actions describe
the effect; callers must qualify the exact sources/image before invoking it.
Models, budgets, credentials, unrelated configuration and jobs are preserved.
"""
from pathlib import Path
import hashlib,http.client,json,os,re,shutil,socket,subprocess,sys,time,uuid

ROOT=Path(__file__).resolve().parents[1]
INSTALL_ROOT=Path('/opt/agentic-sdlc/portal')
OWNER_FILE=Path('/etc/agentic-sdlc-owner')
sys.path.insert(0,str(ROOT.parent/'scripts'))
from audit_admin import administrative_operation,atomic_json

PLANS={
 'coding':{'action':'PORTAL_CODING_EXECUTOR_INSTALLED','unit':'sdlc-coding-executor.service','files':{'executor/coding_service.py':'service.py','executor/coding_browser.py':'coding_browser.py','executor/coding_workflow.py':'coding_workflow.py','executor/coding_ui_agent.py':'coding_ui_agent.py','executor/coding_micro.py':'coding_micro.py'},'digest':['executor/coding_service.py','executor/coding_browser.py','executor/coding-browser.mjs','executor/coding_workflow.py','executor/coding_ui_agent.py','executor/browser-controls.mjs','executor/coding_micro.py'],'receipts':['state/*/receipt.json']},
 'runtime':{'action':'PORTAL_RUNTIME_EXECUTOR_INSTALLED','unit':'sdlc-runtime-executor.service','files':{'runtime/service.py':'service.py','runtime/dev_ai.py':'dev_ai.py','executor/coding_ui_agent.py':'coding_ui_agent.py','executor/coding_browser.py':'coding_browser.py'},'digest':['runtime/service.py','runtime/dev_ai.py','executor/coding_ui_agent.py','executor/coding_browser.py','executor/coding-browser.mjs','executor/browser-controls.mjs'],'receipts':['state/jobs/*/receipt.json','state/ai-jobs/*/receipt.json']}
}

def digest(value):return hashlib.sha256(value).hexdigest()

def run(*args):return subprocess.run(args,check=True,text=True,capture_output=True).stdout.strip()

def idle(installation,plan):
 for pattern in plan['receipts']:
  for path in installation.glob(pattern):
   if json.loads(path.read_text()).get('state') in ['queued','running']:raise RuntimeError('Wait for active executor jobs; no job was cancelled')

def healthy(installation):
 class Local(http.client.HTTPConnection):
  def connect(self):
   self.sock=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);self.sock.settimeout(3);self.sock.connect(str(installation/'socket/executor.sock'))
 connection=Local('localhost')
 try:
  connection.request('GET','/health');response=connection.getresponse();value=json.load(response)
  return response.status==200 and value.get('ready') is True
 finally:connection.close()

def refresh(kind,*,browser_image=None):
 if kind not in PLANS:raise ValueError('Unknown installed executor')
 if os.geteuid()!=0 or not OWNER_FILE.is_file():raise RuntimeError('Owned installation and administrator required')
 plan=PLANS[kind];installation=INSTALL_ROOT/(kind+'-executor')
 if installation.is_symlink() or INSTALL_ROOT.is_symlink() or (INSTALL_ROOT/'backups').is_symlink():raise RuntimeError('Keep unowned installation')
 names=[*plan['files'].values(),'installation.json','config.json']
 for name in names:
  path=installation/name
  if path.is_symlink() or not path.is_file():raise RuntimeError('Keep missing or unowned installed source')
 if run('systemctl','is-active',plan['unit'])!='active':raise RuntimeError('Executor must be active before refresh')
 idle(installation,plan)
 for relative in plan['digest']:
  path=ROOT/relative
  if path.is_symlink() or not path.is_file():raise RuntimeError('Regular qualified sources required')
 config_bytes=(installation/'config.json').read_bytes();config=json.loads(config_bytes)
 browser_key='browserImageId' if kind=='coding' else 'aiBrowserImageId'
 browser=config.get(browser_key)
 if not browser:raise RuntimeError('Keep the installed browser image identity')
 if browser_image is not None:
  if not isinstance(browser_image,str) or not re.fullmatch(r'sha256:[0-9a-f]{64}',browser_image):raise ValueError('Qualified immutable browser image required')
  image=json.loads(run('docker','image','inspect',browser_image))[0]
  if image.get('Id')!=browser_image or image.get('Config',{}).get('Labels',{}).get('org.sdlc.coding-browser')!='react-entry-v1':raise RuntimeError('Qualified browser identity differs')
  browser=browser_image
 expected_config={**config,browser_key:browser}
 expected_bytes=config_bytes if expected_config==config else json.dumps(expected_config,indent=2).encode()
 for name in ['coding-browser.mjs','browser-controls.mjs']:
  if run('docker','run','--rm','--pull','never','--network','none','--entrypoint','cat',browser,'/opt/sdlc/'+name)!=(ROOT/'executor'/name).read_text().strip():raise RuntimeError('Prepared browser source differs; qualify and prepare it separately')
 fingerprint=digest(b''.join((ROOT/relative).read_bytes() for relative in plan['digest']))
 identifier='executor-source-'+kind+'-'+uuid.uuid4().hex
 stopped=False
 try:
  with administrative_operation(plan['action'],source='portal/'+kind+'-executor',details={'scope':'qualified-source-refresh-models-jobs-preserved','manifestDigest':fingerprint,'backupId':identifier,**({'browserImageId':browser} if browser_image is not None else {})}) as operation:
   backup=INSTALL_ROOT/'backups'/identifier;backup.mkdir(parents=True,mode=0o700,exist_ok=False);backup.chmod(0o700)
   before={}
   for name in names:
    source=installation/name;shutil.copy2(source,backup/name);(backup/name).chmod(0o600)
    before[name]=digest(source.read_bytes())
    if digest((backup/name).read_bytes())!=before[name]:raise RuntimeError('Private backup verification failed')
   atomic_json(backup/'before.json',{'files':before})
   idle(installation,plan);run('systemctl','stop',plan['unit']);stopped=True;idle(installation,plan)
   for relative,name in plan['files'].items():
    shutil.copyfile(ROOT/relative,installation/name);(installation/name).chmod(0o600)
   metadata=json.loads((installation/'installation.json').read_text());metadata['sourceDigest']=fingerprint
   if browser_image is not None and kind=='coding':metadata['browserImageId']=browser
   atomic_json(installation/'installation.json',metadata)
   if (installation/'config.json').read_bytes()!=config_bytes:raise RuntimeError('Executor configuration changed')
   if expected_bytes!=config_bytes:(installation/'config.json').write_bytes(expected_bytes)
   run('systemctl','start',plan['unit'])
   for attempt in range(20):
    try:ready=healthy(installation)
    except (OSError,ValueError,http.client.HTTPException):ready=False
    if ready:break
    time.sleep(.25)
   else:raise RuntimeError('Refreshed executor did not become ready')
   after={name:digest((installation/name).read_bytes()) for name in names}
   if (installation/'config.json').read_bytes()!=expected_bytes:raise RuntimeError('Configuration drift after refresh')
   unchanged=expected_bytes==config_bytes
   atomic_json(backup/'after.json',{'files':after,'ready':True,'configurationPreserved':unchanged,'configurationOnlyBrowserChanged':not unchanged})
   operation.result(manifestDigest=fingerprint,backupId=identifier,count=len(plan['files']))
   return {'executor':kind,'sourceDigest':fingerprint,'backupId':identifier,'ready':True,'configurationPreserved':unchanged,'configurationOnlyBrowserChanged':not unchanged,**({'browserImageId':browser} if browser_image is not None else {})}
 except BaseException:
  # Includes a failure while the recorder closes the operation after result().
  if stopped:
   run('systemctl','stop',plan['unit'])
   for name in names:shutil.copy2(backup/name,installation/name)
   run('systemctl','start',plan['unit'])
   restored=all(digest((installation/name).read_bytes())==before[name] for name in names)
   atomic_json(backup/'rollback.json',{'filesRestored':restored})
   if not restored:raise RuntimeError('Executor source restoration not confirmed')
  raise
