"""Install the controlled local runtime executor; never creates application resources."""
from pathlib import Path
import hashlib,json,os,shutil,subprocess,sys,uuid
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT.parent/'scripts'))
from audit_admin import administrative_operation
INSTALL=Path('/opt/agentic-sdlc/portal/runtime-executor')
def install():
 if os.geteuid()!=0:raise RuntimeError('Runtime installation requires the lab administrator')
 if INSTALL.is_symlink() or INSTALL.parent.is_symlink():raise RuntimeError('Regular installation paths required')
 if INSTALL.exists() and not (INSTALL/'installation.json').is_file():raise RuntimeError('Keep unowned runtime directory')
 if INSTALL.exists():
  for receipt in (INSTALL/'state/jobs').glob('*/receipt.json'):
   if json.loads(receipt.read_text()).get('state') in ['queued','running']:raise RuntimeError('Wait for active runtime operations')
 installation=json.loads((INSTALL/'installation.json').read_text()) if INSTALL.exists() else {'installationId':str(uuid.uuid4())}
 source=ROOT/'runtime/service.py';fingerprint=hashlib.sha256(source.read_bytes()).hexdigest()
 with administrative_operation('PORTAL_RUNTIME_EXECUTOR_INSTALLED',source='portal/runtime-executor',details={'scope':'local-owned-DEV-targets-no-business-data','manifestDigest':fingerprint}) as operation:
  INSTALL.mkdir(parents=True,exist_ok=True,mode=0o700);os.chmod(INSTALL,0o700);(INSTALL/'socket').mkdir(exist_ok=True);os.chmod(INSTALL/'socket',0o755)
  shutil.copyfile(source,INSTALL/'service.py');os.chmod(INSTALL/'service.py',0o600)
  config={'buildStateRoot':'/opt/agentic-sdlc/portal/build-executor/state','installationId':installation['installationId'],'stateRoot':str(INSTALL/'state'),'socketPath':str(INSTALL/'socket/executor.sock')};(INSTALL/'config.json').write_text(json.dumps(config));os.chmod(INSTALL/'config.json',0o600)
  installation.update(sourceDigest=fingerprint,profile='node24-http-v1');(INSTALL/'installation.json').write_text(json.dumps(installation));os.chmod(INSTALL/'installation.json',0o600)
  unit=Path('/etc/systemd/system/sdlc-runtime-executor.service')
  if unit.exists() and 'SDLC controlled application runtime' not in unit.read_text():raise RuntimeError('Keep unowned service')
  unit.write_text('[Unit]\nDescription=SDLC controlled application runtime\nAfter=docker.service\nRequires=docker.service\n[Service]\nType=simple\nExecStart=/usr/bin/python3 '+str(INSTALL/'service.py')+' --config '+str(INSTALL/'config.json')+'\nRestart=on-failure\nUMask=0077\nNoNewPrivileges=true\n[Install]\nWantedBy=multi-user.target\n')
  for args in [('daemon-reload',),('enable','--now','sdlc-runtime-executor.service'),('restart','sdlc-runtime-executor.service')]:subprocess.run(['systemctl',*args],check=True,stdout=subprocess.DEVNULL)
  (ROOT/'.prepared/compose.runtime-executor.json').write_text(json.dumps({'services':{'api':{'environment':{'ENVIRONMENT_RUNTIME_SOCKET':'/run/sdlc-runtime/executor.sock'},'volumes':[{'type':'bind','source':str(INSTALL/'socket'),'target':'/run/sdlc-runtime','read_only':True}]}}},indent=2));operation.result(count=1)
 print(json.dumps({'installed':True,'profile':'node24-http-v1','sourceDigest':fingerprint,'socket':str(INSTALL/'socket/executor.sock')}))
if __name__=='__main__':
 if sys.argv[1:]!=['install']:raise SystemExit('Expected install')
 install()
