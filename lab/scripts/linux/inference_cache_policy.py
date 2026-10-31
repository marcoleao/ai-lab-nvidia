"""Apply only the owned Ollama prompt-cache budget; keep models and networking."""
from pathlib import Path
import argparse,json,os,subprocess,sys,uuid
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'lib'))
if not (ROOT/'lib/audit_admin.py').is_file():sys.path.insert(0,str(ROOT.parent/'sdlc/scripts'))
from audit_admin import administrative_operation,atomic_json
LINE='      LLAMA_ARG_CACHE_RAM: "0"\n'
CONTAINER='ai-local-lab-ollama-1'

def observed():
 value=json.loads(subprocess.check_output(['docker','inspect',CONTAINER],text=True))[0]
 env=dict(line.split('=',1) for line in value['Config']['Env'] if '=' in line)
 return {'image':value['Image'],'cacheRam':env.get('LLAMA_ARG_CACHE_RAM'),'mounts':value['Mounts'],'networks':value['NetworkSettings']['Networks'],'ports':value['HostConfig']['PortBindings'],'project':value['Config']['Labels'].get('com.docker.compose.project'),'service':value['Config']['Labels'].get('com.docker.compose.service')}

def apply_policy(root,desired,inspect=None,restart=None):
 root=Path(root);target=root/'compose.yaml';inspect=inspect or observed
 def default_restart():subprocess.run(['docker','compose','--project-name','ai-local-lab','--env-file',str(root/'.env'),'--env-file',str(root/'.runtime.env'),'-f',str(target),'-f',str(root/'.override.yaml'),'--profile','core','up','-d','--no-deps','--no-build','--pull','never','--wait','--wait-timeout','60','ollama'],check=True,timeout=90,capture_output=True)
 restart=restart or default_restart
 with administrative_operation('LAB_INFRASTRUCTURE_RECOVERY',source='lab/inference-cache',root=root,details={'command':'bound-native-prompt-cache','scope':'owned-Ollama-cache-only-models-and-network-preserved','reasonCode':'PROMPT_CACHE_MEMORY_PRESSURE'}) as operation:
  if root.is_symlink() or target.is_symlink():operation.result('REJECTED');return {'applied':False,'reason':'unexpected-runtime-link'}
  before=target.read_text();facts=inspect()
  if desired.count(LINE)!=1 or desired.replace(LINE,'')!=before.replace(LINE,'') or facts['project']!='ai-local-lab' or facts['service']!='ollama':
   operation.result('REJECTED');return {'applied':False,'reason':'unexpected-source-or-service'}
  if before==desired and facts['cacheRam']=='0':operation.result('NO_CHANGE',count=0);return {'applied':True,'changed':False}
  backup=root/'audit'/('inference-cache-'+uuid.uuid4().hex);backup.mkdir(parents=True,mode=0o700);atomic_json(backup/'before.json',{'compose':before,'runtime':facts})
  def stable(value):
   # Docker assigns new endpoint IDs/MACs on recreation; compare the actual
   # address and preserved network identities instead of ephemeral metadata.
   return {**value,'networks':{name:{key:network.get(key) for key in ['NetworkID','IPAddress','GlobalIPv6Address']} for name,network in value['networks'].items()}}
  try:
   target.write_text(desired);restart();after=inspect();atomic_json(backup/'after.json',after)
   if stable({**after,'cacheRam':facts['cacheRam']})!=stable(facts) or after['cacheRam']!='0':raise RuntimeError('Runtime preservation not confirmed')
  except Exception as error:
   restored=False
   try:target.write_text(before);restart();restored=target.read_text()==before and stable(inspect())==stable(facts)
   except Exception:pass
   atomic_json(backup/'rollback.json',{'confirmed':restored,'errorType':type(error).__name__})
   if not restored:raise RuntimeError('Inference-cache rollback not confirmed') from error
   operation.result('FAILED',backupId=backup.name);return {'applied':False,'rollbackConfirmed':True}
  operation.result(count=1,backupId=backup.name);return {'applied':True,'changed':True,'cacheRamMiB':0,'modelsAndNetworkPreserved':True}

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--source',type=Path,required=True);args=parser.parse_args()
 marker=Path('/etc/ai-local-lab-owner');root=Path('/opt/ai-local-lab')
 if os.geteuid()!=0 or not marker.is_file() or marker.is_symlink() or root.resolve()!=root:raise RuntimeError('Owned LAB and root required')
 result=apply_policy(root,args.source.read_text());print(json.dumps(result));raise SystemExit(0 if result['applied'] else 1)
