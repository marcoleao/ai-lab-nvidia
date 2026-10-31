"""Owned Docker regression environments. Fast is persistent; full starts clean.

WSL: python3 scripts/regression.py prepare|fast|backend|full|catalog|status|cleanup
No operational containers, database, credentials or .prepared helpers are used.
"""
from pathlib import Path
from datetime import datetime,timezone
import argparse,hashlib,importlib.util,json,subprocess,time,uuid,fcntl,sys

ROOT=Path(__file__).resolve().parents[1];LABEL='org.sdlc.regression';OWNER='portal-v1-'+hashlib.sha256(str(ROOT).encode()).hexdigest()[:10]
OUTPUT=ROOT/'test-results/regression';IMAGE='sdlc-portal-regression:toolchain';POSTGRES='postgres@sha256:2d2b8998d31037bf721cfdf764d76ba74171b4fab3431b7f72c27c56ddbdf9e3'
sys.path.insert(0,str(ROOT.parent/'scripts'))
from audit_admin import administrative_operation,CURRENT_OPERATION
def docker(*args,capture=False,check=True):return subprocess.run(['docker',*map(str,args)],check=check,text=True,stdout=subprocess.PIPE if capture else None,stderr=subprocess.PIPE if capture else None)
def exists(name,kind='container'):return docker(kind,'inspect',name,capture=True,check=False).returncode==0
def names(scope):return {'network':'sdlc-regression-'+scope,'db':'sdlc-regression-'+scope+'-db','runner':'sdlc-regression-'+scope+'-runner'}
def owned(name,kind='container'):
 row=json.loads(docker(kind,'inspect',name,capture=True).stdout)[0];labels=row.get('Labels') if kind=='network' else row['Config'].get('Labels')
 if not labels or labels.get(LABEL)!=OWNER:raise RuntimeError('Refusing an unowned regression resource: '+name)
 if kind=='container' and name.endswith('-db') and 'POSTGRES_DB=portal_test' not in row['Config']['Env']:raise RuntimeError('Refusing non-test database')
 if kind=='container' and name.endswith('-runner'):
  expected=env(name.split('-')[-2])[1::2]
  if not all(value in row['Config']['Env'] for value in expected):raise RuntimeError('Regression runner environment differs from the isolated contract')
  mounts={v['Destination']:v for v in row.get('Mounts',[])}
  if mounts.get('/source',{}).get('Source')!=str(ROOT) or mounts['/source'].get('RW') or mounts.get('/reports',{}).get('Source')!=str(OUTPUT):raise RuntimeError('Regression runner mounts differ from this workspace')
 return row
def env(scope):return ['-e','DATABASE_URL=postgresql://sdlc:regression-only@db:5432/portal_test','-e','TEST_DATABASE_URL=postgresql://sdlc:regression-only@db:5432/portal_test','-e','REGRESSION_TEST_HOST=1','-e','REGRESSION_RESOURCE_ID='+OWNER+'-'+scope,'-e','DEMO_MODE=true','-e','PORTAL_ORIGIN=http://127.0.0.1:3000','-e','API_BASE_URL=http://127.0.0.1:4100','-e','PORTAL_TEST_BASE_URL=http://127.0.0.1:3000','-e','NEXT_TELEMETRY_DISABLED=1']
def reconcile_network(scope):
 # WSL distributions share the kernel/netfilter. Another owned Docker engine
 # can leave this bridge without same-bridge forwarding after it restarts.
 network=owned(names(scope)['network'],'network')
 spec=importlib.util.spec_from_file_location('regression_network_guard',ROOT.parent/'scripts/reconcile-docker-networks.py');guard=importlib.util.module_from_spec(spec);spec.loader.exec_module(guard)
 return guard.reconcile([guard.bridge_rule(network)])

def prepare(scope):
 n=names(scope);OUTPUT.mkdir(parents=True,exist_ok=True)
 for key,kind in [('network','network'),('db','container'),('runner','container')]:
  if exists(n[key],kind):owned(n[key],kind)
 if not exists(n['network'],'network'):docker('network','create','--internal','--label',LABEL+'='+OWNER,n['network'])
 if not exists(n['db']):docker('run','-d','--pull','never','--name',n['db'],'--network',n['network'],'--network-alias','db','--label',LABEL+'='+OWNER,'-e','POSTGRES_DB=portal_test','-e','POSTGRES_USER=sdlc','-e','POSTGRES_PASSWORD=regression-only',POSTGRES)
 for attempt in range(60):
  if docker('exec',n['db'],'pg_isready','-U','sdlc','-d','portal_test',capture=True,check=False).returncode==0:break
  time.sleep(.25)
 else:raise RuntimeError('Owned PostgreSQL did not start')
 if not exists(n['runner']):docker('run','-d','--pull','never','--name',n['runner'],'--user','root','--network',n['network'],'--label',LABEL+'='+OWNER,'--shm-size','512m','--mount','type=bind,src='+str(ROOT)+',dst=/source,readonly','--mount','type=bind,src='+str(OUTPUT)+',dst=/reports',*(['-p','127.0.0.1:3390:3000'] if scope=='fast' else []),*env(scope),'--entrypoint','sleep',IMAGE,'infinity')
 reconcile_network(scope)
 return sync(scope)
def sync(scope):
 n=names(scope);owned(n['runner']);result=docker('exec','-w','/app',n['runner'],'node','/source/scripts/regression-sync.mjs',capture=True);print(result.stdout);value=json.loads(result.stdout.strip().splitlines()[-1]);docker('exec','-w','/app',n['runner'],'pnpm','db:setup',capture=True)
 if scope=='fast' and value['apiChanged']:docker('restart',n['runner'])
 return value
def services(scope):
 n=names(scope);docker('exec','-w','/app',n['runner'],'node','scripts/regression-services.mjs')
 for attempt in range(100):
  result=docker('exec',n['runner'],'node','-e',"fetch('http://127.0.0.1:3000/api/__test/status').then(async r=>{const v=await r.json();process.exit(r.ok&&v.harness==='portal-regression-v1'?0:1)}).catch(()=>process.exit(1))",capture=True,check=False)
  if result.returncode==0:return
  time.sleep(.25)
 raise RuntimeError('Owned test API/web did not become ready; inspect .regression logs inside runner')
def support_checks(directory,runner):
 directory.mkdir(parents=True,exist_ok=True);support=[]
 for name,arguments in [('admin-audit',['-m','unittest','discover','-s',str(ROOT.parent/'tests'),'-p','test_audit_admin.py','-v']),('wsl-clock',[str(ROOT.parent/'tests/test_wsl_clock.py')]),('relay',[str(ROOT/'tests/relay_tests.py')]),('controller',[str(ROOT/'tests/regression-runner.test.py')]),('build-executor',[str(ROOT/'tests/build-executor.test.py')]),('coding-executor',[str(ROOT/'tests/coding-executor.test.py')]),('coding-ui-agent',[str(ROOT/'tests/coding-ui-agent.test.py')]),('coding-micro',[str(ROOT/'tests/coding-micro.test.py')]),('runtime-executor',[str(ROOT/'tests/runtime-executor.test.py')]),('dev-test-executor',[str(ROOT/'tests/dev-test-executor.test.py')])]:
  started=time.monotonic();checked=subprocess.run([sys.executable,*arguments],cwd=ROOT,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
  (directory/(name+'.log')).write_text(checked.stdout);support.append({'name':name,'exitCode':checked.returncode,'durationMs':round((time.monotonic()-started)*1000)})
 started=time.monotonic();checked=docker('exec',runner,'node','--test','/source/tests/browser-controls.test.mjs',capture=True,check=False)
 (directory/'browser-controls.log').write_text(checked.stdout+checked.stderr);support.append({'name':'browser-controls','exitCode':checked.returncode,'durationMs':round((time.monotonic()-started)*1000)})
 (directory/'support-checks.json').write_text(json.dumps(support,indent=2));return support

def execute(scope,command,options):
 prepare(scope);n=names(scope);run_id=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:6];path='/reports/'+run_id
 if scope!='fast':docker('restart',n['runner'])
 if command=='smoke':services(scope)
 if command=='browser':docker('exec','-w','/app',n['runner'],'node','scripts/test-isolated.mjs','--reset-only')
 receipt={'version':1,'operationId':CURRENT_OPERATION.get(),'resourceId':OWNER+'-'+scope,'scope':scope,'runnerId':owned(n['runner'])['Id'],'databaseId':owned(n['db'])['Id'],'imageId':owned(n['runner'])['Image'],'postgresImageId':owned(n['db'])['Image'],'startedAt':datetime.now(timezone.utc).isoformat(),'command':command}
 (OUTPUT/run_id).mkdir(parents=True,exist_ok=True);(OUTPUT/run_id/'environment.json').write_text(json.dumps(receipt,indent=2))
 support=support_checks(OUTPUT/run_id,n['runner']) if command=='full' else []
 if command=='full':command='ci'
 argv=['node','scripts/regression.mjs',command,'--output='+path,*(['--reuse-server'] if command=='smoke' else []),*(['--dev'] if command=='browser' else []),*(['--write-catalog'] if options.write_catalog else []),*(['--files='+','.join(options.files)] if options.files else []),*(['--grep='+options.grep] if options.grep else [])]
 result=docker('exec','-w','/app',n['runner'],*argv,check=False)
 if not (OUTPUT/run_id/'summary.json').exists():
  (OUTPUT/run_id/'summary.json').write_text(json.dumps({'version':1,'command':command,'ok':False,'error':'Runner exited before producing its report','exitCode':result.returncode,'operationId':CURRENT_OPERATION.get()},indent=2))
 if support:
  summary_path=OUTPUT/run_id/'summary.json';summary=json.loads(summary_path.read_text());summary['supportChecks']=support;summary['ok']=summary['ok'] and all(row['exitCode']==0 for row in support);summary_path.write_text(json.dumps(summary,indent=2))
 if options.write_catalog:
  docker('cp',n['runner']+':/app/tests/regression/cases.json',str(ROOT/'tests/regression/cases.json'))
 print('Regression artifacts:',OUTPUT/run_id);return result.returncode or int(any(row['exitCode'] for row in support))
def cleanup(scope):
 n=names(scope)
 # Validate every target before removing any resource.
 for key in ['runner','db']:
  if exists(n[key]):owned(n[key])
 if exists(n['network'],'network'):
  row=owned(n['network'],'network');attached={v['Name'] for v in row.get('Containers',{}).values()}
  if attached-set([n['runner'],n['db']]):raise RuntimeError('Keep network with unexpected attached containers')
 for key in ['runner','db']:
  if exists(n[key]):owned(n[key]);docker('rm','-f','-v',n[key])
 if exists(n['network'],'network'):
  row=owned(n['network'],'network')
  if row.get('Containers'):raise RuntimeError('Keep network with unexpected attached containers')
  docker('network','rm',n['network'])

def toolchain(reuse=False):
 if reuse:
  cached='sdlc-portal-browser:prepared'
  result=docker('run','--rm','--pull','never','--network','none','--entrypoint','node',cached,'-e',"process.stdout.write(require('fs').readFileSync('/app/pnpm-lock.yaml'))",capture=True)
  if result.stdout!=(ROOT/'pnpm-lock.yaml').read_text():raise RuntimeError('Cached dependency lock differs; build toolchain instead')
  docker('tag',cached,IMAGE)
 else:docker('build','-f',ROOT/'infra/Dockerfile.regression','-t',IMAGE,ROOT)
 print('Regression toolchain:',json.loads(docker('image','inspect',IMAGE,capture=True).stdout)[0]['Id'])
def dispatch(args):
 if args.command=='toolchain':toolchain(args.reuse_cached)
 elif args.command=='full':
  cleanup('verify')
  try:code=execute('verify','full',args)
  finally:cleanup('verify')
  return code
 elif args.command=='backend':return execute('verify','backend',args)
 elif args.command=='browser':return execute('ui','browser',args)
 elif args.command in ['fast','catalog']:return execute('fast','smoke' if args.command=='fast' else 'catalog',args)
 elif args.command=='prepare':prepare(args.scope);services(args.scope)
 elif args.command=='sync':prepare(args.scope);services(args.scope)
 elif args.command=='cleanup':cleanup(args.scope)
 else:
  for name in names(args.scope).values():print(name+': '+('owned' if exists(name,'network' if name==names(args.scope)['network'] else 'container') and owned(name,'network' if name==names(args.scope)['network'] else 'container') else 'absent'))
 return 0

if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('command',choices=['toolchain','prepare','sync','status','fast','backend','browser','full','catalog','cleanup']);parser.add_argument('files',nargs='*');parser.add_argument('--grep');parser.add_argument('--write-catalog',action='store_true');parser.add_argument('--reuse-cached',action='store_true');parser.add_argument('--scope',choices=['fast','verify','ui'],default='fast');args=parser.parse_args()
 if args.command=='full' and (args.files or args.grep):parser.error('Full regression cannot be filtered; use backend/browser for selected cases')
 if args.grep and args.command not in ['fast','browser']:parser.error('--grep applies only to fast/browser')
 if args.write_catalog and args.command!='catalog':parser.error('--write-catalog applies only to catalog')
 OUTPUT.mkdir(parents=True,exist_ok=True);lock_scope='verify' if args.command in ['backend','full'] else 'ui' if args.command=='browser' else args.scope;lock=(OUTPUT/('environment-'+lock_scope+'.lock')).open('a+')
 try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 except BlockingIOError:raise SystemExit('Another regression command owns this environment; no operation was started')
 if args.command=='status':raise SystemExit(dispatch(args))
 audit_root=OUTPUT/'control';audit_root.mkdir(exist_ok=True)
 action='PORTAL_REGRESSION_RUN' if args.command in ['fast','backend','browser','full','catalog'] else 'PORTAL_REGRESSION_ENVIRONMENT'
 with administrative_operation(action,source='portal/regression',details={'command':args.command,'scope':lock_scope},root=audit_root) as operation:
  code=dispatch(args);operation.result('SUCCEEDED' if code==0 else 'FAILED',exitCode=code)
 raise SystemExit(code)
