"""Profile-specific LAB assets. Selection preserves all installed model weights."""
from pathlib import Path
import argparse,hashlib,json,os,re,stat,subprocess,sys,tempfile

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'lib'))
if not (ROOT/'lib/audit_admin.py').is_file():sys.path.insert(0,str(ROOT.parent/'sdlc/scripts'))
from audit_admin import administrative_operation,atomic_json

def profiles(value):
 result=value.split(',') if isinstance(value,str) else list(value)
 if not result or len(set(result))!=len(result) or any(v not in ['core','rag','dev','agents','observability','sdlc'] for v in result):raise ValueError('Invalid LAB profile selection')
 if 'sdlc' in result and result!=['sdlc']:raise ValueError('The sdlc profile must be selected alone')
 return result

def runtime_values(path):
 values={}
 for line in path.read_text().splitlines():
  if not line or line.startswith('#'):continue
  key,separator,value=line.partition('=')
  if not separator or not re.fullmatch('[A-Z_]+',key) or not re.fullmatch('[a-zA-Z0-9.,/:@_-]+',value) or key in values:raise ValueError('Invalid declarative runtime environment')
  values[key]=value
 profiles(values['LAB_PROFILES'])
 return values

def declared_models(root):
 state=0;result=[]
 for line in (root/'config/models.yaml').read_text().splitlines():
  if not line.strip() or line.lstrip().startswith('#'):continue
  if line=='ollama:' and state==0:state=1;continue
  if line=='  models:' and state==1:state=2;continue
  if state!=2 or not re.fullmatch(r'    - [a-zA-Z0-9][a-zA-Z0-9._/:@-]*',line):raise ValueError('Invalid model declaration')
  model=line[6:]
  if any(part in ['','.','..'] for part in model.split('/')) or model in result:raise ValueError('Duplicate or unsafe model declaration')
  result.append(model)
 if not result:raise ValueError('Declare at least one model')
 return result

def selected_models(root,selected):
 selected=profiles(selected);declared=declared_models(root)
 if selected!=['sdlc']:return declared
 policy=json.loads((root/'config/sdlc-profile.json').read_text())
 if set(policy)!={'version','models'} or policy['version']!=1 or not isinstance(policy['models'],dict) or set(policy['models'])!={'general','coding'}:raise ValueError('Invalid SDLC profile policy')
 models=[policy['models'][role] for role in ['general','coding']]
 if len(set(models))!=2 or any(model not in declared for model in models):raise ValueError('SDLC models must be two distinct existing declarations')
 return models

def image_plan(root,selected):
 selected=profiles(selected)
 refs={}
 for line in (root/'config/versions.env').read_text().splitlines():
  if line and not line.startswith('#'):
   key,separator,value=line.partition('=')
   if not separator or key in refs or not re.fullmatch('[A-Z_]+',key) or not re.fullmatch('[a-zA-Z0-9./:@_-]+',value):raise ValueError('Invalid image declaration')
   refs[key]=value
 if selected==['sdlc']:return [refs['OLLAMA_IMAGE']]
 return list(refs.values())+['ai-local-lab/dev:local','ai-local-lab/qwen-code:0.26.4']

def atomic_bytes(path,content):
 if path.is_symlink() or path.parent.resolve()!=path.parent:raise ValueError('Profile files cannot be symbolic links')
 descriptor,temporary=tempfile.mkstemp(prefix='.profile-',dir=path.parent)
 try:
  os.fchmod(descriptor,0o600)
  with os.fdopen(descriptor,'wb') as stream:stream.write(content);stream.flush();os.fsync(stream.fileno())
  os.replace(temporary,path)
 finally:
  if os.path.exists(temporary):os.unlink(temporary)

def selection(root,incoming):
 root=Path(root)
 if root.resolve()!=root or root.is_symlink():raise ValueError('Regular absolute runtime root required')
 values=runtime_values(incoming);selected=profiles(values['LAB_PROFILES']);models=selected_models(root,selected)
 receipt=json.dumps({'version':1,'profiles':selected,'models':models},sort_keys=True).encode()+b'\n'
 desired={'.runtime.env':incoming.read_bytes(),'.models':('\n'.join(models)+'\n').encode(),'.profile-selection.json':receipt}
 before={}
 for name in desired:
  path=root/name
  if path.is_symlink() or path.exists() and not stat.S_ISREG(path.stat().st_mode):raise ValueError('Keep an unexpected profile file')
  before[name]=path.read_bytes() if path.exists() else None
 with administrative_operation('LAB_PROFILE_SELECTED',source='lab/profile-assets',root=root,details={'scope':','.join(selected),'count':len(models)}) as operation:
  if before==desired:operation.result('NO_CHANGE');return {'selected':True,'changed':False,'profiles':selected}
  evidence=root/'audit'/('profile-selection-'+operation.id);evidence.mkdir(mode=0o700)
  def snapshot(files):return {name:None if data is None else {'sha256':hashlib.sha256(data).hexdigest(),'content':data.decode()} for name,data in files.items()}
  atomic_json(evidence/'before.json',snapshot(before))
  try:
   for name,data in desired.items():atomic_bytes(root/name,data)
   atomic_json(evidence/'after.json',snapshot(desired))
  except BaseException:
   try:
    for name,data in before.items():
     if data is None:(root/name).unlink(missing_ok=True)
     else:atomic_bytes(root/name,data)
    restored=all((root/name).read_bytes()==data if data is not None else not (root/name).exists() for name,data in before.items())
   except BaseException:restored=False
   atomic_json(evidence/'rollback.json',{'confirmed':restored})
   if not restored:raise RuntimeError('Profile selection rollback not confirmed') from None
   operation.result('FAILED');return {'selected':False,'rollbackConfirmed':True}
  operation.result(count=len(models));return {'selected':True,'changed':True,'profiles':selected}

def prepare_sdlc(root):
 root=Path(root);values=runtime_values(root/'.runtime.env')
 if profiles(values['LAB_PROFILES'])!=['sdlc']:raise ValueError('Expected the exclusive sdlc profile')
 models=selected_models(root,['sdlc'])
 if (root/'.models').read_text().splitlines()!=models:raise ValueError('Active model selection differs; synchronize the profile first')
 references=image_plan(root,['sdlc'])
 with administrative_operation('LAB_SDLC_PROFILE_PREPARED',source='lab/profile-assets',root=root,details={'scope':'ollama-and-existing-SDLC-models-only','count':len(models)}) as operation:
  evidence=root/'audit'/('sdlc-preparation-'+operation.id);evidence.mkdir(mode=0o700)
  manifest=root/'.offline-manifest.json'
  if manifest.is_symlink():raise ValueError('Prepared manifest cannot be a symbolic link')
  atomic_json(evidence/'before.json',{'profiles':['sdlc'],'models':models,'manifest':json.loads(manifest.read_text()) if manifest.exists() else None})
  def run(*args):subprocess.run(list(map(str,args)),cwd=root,check=True)
  run('docker','pull',references[0])
  run('docker','compose','--project-name','ai-local-lab','--env-file',root/'.env','--env-file',root/'.runtime.env','-f',root/'compose.yaml','-f',root/'.override.yaml','--profile','sdlc','up','-d','--no-build','--pull','never','--wait','--wait-timeout',values['HEALTH_TIMEOUT_SECONDS'],'ollama')
  run('bash',root/'scripts/linux/pull-models.sh')
  run(sys.executable,root/'scripts/linux/offline-manifest.py','prepare')
  atomic_json(evidence/'after.json',{'manifest':json.loads(manifest.read_text())})
  operation.result(count=len(models))

def check_services():
 identifiers=subprocess.check_output(['docker','ps','-q','--filter','label=com.docker.compose.project=ai-local-lab'],text=True).split()
 if not identifiers:return
 values=json.loads(subprocess.check_output(['docker','inspect',*identifiers],text=True))
 extras=[]
 for value in values:
  labels=value.get('Config',{}).get('Labels',{})
  if labels.get('com.docker.compose.project')!='ai-local-lab':raise RuntimeError('Unexpected LAB resource')
  if labels.get('com.docker.compose.service')!='ollama':extras.append(labels.get('com.docker.compose.service','unknown'))
 if extras:raise RuntimeError('Other LAB services remain active: '+', '.join(sorted(extras))+'. Run bootstrap down before switching profiles; volumes are preserved.')

def main():
 parser=argparse.ArgumentParser();parser.add_argument('command',choices=['select','prepare-sdlc','check-services']);parser.add_argument('--incoming',type=Path);args=parser.parse_args()
 if not Path('/etc/ai-local-lab-owner').is_file():raise RuntimeError('Owned LAB required')
 if args.command=='select':
  if os.geteuid()!=0 or not args.incoming:raise RuntimeError('Selection requires root and the validated incoming runtime')
  result=selection(ROOT,args.incoming);print(json.dumps(result));return 0 if result['selected'] else 1
 if args.command=='check-services':check_services();print('[OK] No optional LAB service running.');return 0
 prepare_sdlc(ROOT);print('[OK] SDLC assets prepared: Ollama and two existing models; no optional LAB toolchains.');return 0

if __name__=='__main__':sys.exit(main())
