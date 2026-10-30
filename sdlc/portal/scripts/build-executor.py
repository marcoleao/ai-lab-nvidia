"""Prepare/install the restricted Node 24/React lab executor. Never creates pilot code or business data."""
from pathlib import Path
import argparse,hashlib,json,os,shutil,subprocess,sys,tempfile
ROOT=Path(__file__).resolve().parents[1];INSTALL=Path('/opt/agentic-sdlc/portal/build-executor')
PACKAGES={'react':'19.3.1','react-dom':'19.3.1','scheduler':'0.28.0','esbuild':'0.28.2','@esbuild/linux-x64':'0.28.2'}
sys.path.insert(0,str(ROOT.parent/'scripts'))
from audit_admin import administrative_operation
def run(*args,output=False):return subprocess.run(list(map(str,args)),check=True,text=True,stdout=subprocess.PIPE if output else None,stderr=subprocess.PIPE if output else None)
def image(name):return json.loads(run('docker','image','inspect',name,output=True).stdout)[0]
def prepare(reuse_cached=False):
 if not reuse_cached:
  with administrative_operation('PORTAL_BUILD_EXECUTOR_PREPARED',source='portal/build-executor',details={'scope':'node24-react-v1-fixed-public-dependencies-no-application'}) as operation:
   run('docker','build','-t','sdlc-node24-react:prepared','-f',str(ROOT/'infra/Dockerfile.development-toolchain'),str(ROOT/'infra'))
   operation.result(imageId=image('sdlc-node24-react:prepared')['Id'])
  print(json.dumps({'prepared':True,'imageId':image('sdlc-node24-react:prepared')['Id'],'packages':PACKAGES}));return
 cache=image('sdlc-portal-regression:toolchain');node=image('node:24-bookworm-slim')
 if run('docker','run','--rm','--pull','never','--network','none',node['Id'],'node','--version',output=True).stdout.strip()!='v24.22.0':raise RuntimeError('Expected installed Node 24.22.0; review toolchain explicitly')
 identifier='sdlc-build-toolchain-preparation'
 if subprocess.run(['docker','container','inspect',identifier],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:raise RuntimeError('Keep existing preparation container')
 with administrative_operation('PORTAL_BUILD_EXECUTOR_PREPARED',source='portal/build-executor',details={'scope':'node24-react-v1-cached-tools','imageId':node['Id']}) as operation:
  with tempfile.TemporaryDirectory(prefix='sdlc-toolchain-') as temporary:
   directory=Path(temporary)
   run('docker','create','--pull','never','--name',identifier,'--network','none','--label','org.sdlc.toolchain-preparation=node24-react-v1','--entrypoint','true',cache['Id'])
   try:
    for package,version in PACKAGES.items():
     folder=package.replace('/','+')+'@'+version+('_react@19.3.1' if package=='react-dom' else '')
     target=directory/'node_modules'/package;target.parent.mkdir(parents=True,exist_ok=True)
     run('docker','cp',identifier+':/app/node_modules/.pnpm/'+folder+'/node_modules/'+package,str(target))
     if json.loads((target/'package.json').read_text())['version']!=version:raise RuntimeError('Cached package version differs')
    (directory/'Dockerfile').write_text('FROM node:24-bookworm-slim\nWORKDIR /app\nCOPY node_modules /app/node_modules\nRUN chown node:node /app\nLABEL org.sdlc.toolchain=node24-react-v1\nUSER node\n')
    run('docker','build','--pull=false','--network=none','-t','sdlc-node24-react:prepared',str(directory))
    if image('node:24-bookworm-slim')['Id']!=node['Id']:raise RuntimeError('Node source changed during preparation')
    operation.result(imageId=image('sdlc-node24-react:prepared')['Id'])
   finally:
    current=json.loads(run('docker','inspect',identifier,output=True).stdout)[0]
    if current['Config'].get('Labels',{}).get('org.sdlc.toolchain-preparation')!='node24-react-v1':raise RuntimeError('Keep unowned preparation container')
    run('docker','rm',identifier)
 print(json.dumps({'prepared':True,'imageId':image('sdlc-node24-react:prepared')['Id'],'packages':PACKAGES}))
def install():
 if os.geteuid()!=0:raise RuntimeError('Executor installation requires the lab administrator')
 if INSTALL.is_symlink() or INSTALL.parent.is_symlink():raise RuntimeError('Expected regular installation paths')
 if INSTALL.exists() and not (INSTALL/'installation.json').is_file():raise RuntimeError('Keep unowned executor directory')
 if INSTALL.exists():
  for receipt in (INSTALL/'state').glob('*/receipt.json'):
   if json.loads(receipt.read_text()).get('state') in ['queued','running']:raise RuntimeError('Wait for active builds before replacing executor')
 base=image('sdlc-node24-react:prepared');source=ROOT/'executor/service.py';source_hash=hashlib.sha256(source.read_bytes()).hexdigest()
 if base['Config'].get('Labels',{}).get('org.sdlc.toolchain')!='node24-react-v1':raise RuntimeError('Supported prepared toolchain required')
 credential=Path('/opt/agentic-sdlc/gitlab-demo/.secrets/merge_token')
 if not credential.is_file() or credential.is_symlink():raise RuntimeError('Expected dedicated nonadministrator GitLab credential')
 with administrative_operation('PORTAL_BUILD_EXECUTOR_INSTALLED',source='portal/build-executor',details={'scope':'local-unix-socket-no-business-data','imageId':base['Id'],'manifestDigest':source_hash}) as operation:
  INSTALL.mkdir(parents=True,exist_ok=True,mode=0o700);os.chmod(INSTALL,0o700)
  (INSTALL/'socket').mkdir(exist_ok=True);os.chmod(INSTALL/'socket',0o755)
  (INSTALL/'state').mkdir(exist_ok=True,mode=0o700)
  shutil.copyfile(source,INSTALL/'service.py');os.chmod(INSTALL/'service.py',0o600)
  config={'stateRoot':str(INSTALL/'state'),'socketPath':str(INSTALL/'socket/executor.sock'),'baseImageId':base['Id'],'packages':PACKAGES,'gitlabBase':'http://127.0.0.1:3180','gitlabRoot':'sdlc','gitlabTokenFile':str(credential)}
  (INSTALL/'config.json').write_text(json.dumps(config,indent=2));os.chmod(INSTALL/'config.json',0o600)
  (INSTALL/'installation.json').write_text(json.dumps({'policy':'node24-react-v1','sourceDigest':source_hash,'baseImageId':base['Id']}));os.chmod(INSTALL/'installation.json',0o600)
  unit=Path('/etc/systemd/system/sdlc-build-executor.service')
  if unit.exists() and 'SDLC restricted local build executor' not in unit.read_text():raise RuntimeError('Keep unowned service unit')
  unit.write_text('[Unit]\nDescription=SDLC restricted local build executor\nAfter=docker.service\nRequires=docker.service\n[Service]\nType=simple\nExecStart=/usr/bin/python3 '+str(INSTALL/'service.py')+' --config '+str(INSTALL/'config.json')+'\nRestart=on-failure\nUMask=0077\nNoNewPrivileges=true\n[Install]\nWantedBy=multi-user.target\n')
  run('systemctl','daemon-reload');run('systemctl','enable','--now','sdlc-build-executor.service');run('systemctl','restart','sdlc-build-executor.service')
  override={'services':{'api':{'environment':{'DEVELOPMENT_BUILD_SOCKET':'/run/sdlc-build/executor.sock'},'volumes':[{'type':'bind','source':str(INSTALL/'socket'),'target':'/run/sdlc-build','read_only':True}]}}}
  (ROOT/'.prepared').mkdir(exist_ok=True);(ROOT/'.prepared/compose.build-executor.json').write_text(json.dumps(override,indent=2));operation.result(imageId=base['Id'])
 print(json.dumps({'installed':True,'baseImageId':base['Id'],'sourceDigest':source_hash,'socket':str(INSTALL/'socket/executor.sock')}))
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('command',choices=['prepare','install']);parser.add_argument('--reuse-cached',action='store_true');args=parser.parse_args();prepare(args.reuse_cached) if args.command=='prepare' else install()
