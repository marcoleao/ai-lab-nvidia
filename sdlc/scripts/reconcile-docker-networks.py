"""Restore only same-bridge traffic lost when another WSL Docker engine starts."""
from pathlib import Path
import json,os,re,subprocess
from audit_admin import administrative_operation

NETWORKS={'sdlc-demo_core':'sdlc-demo','sdlc-portal-foundation_data':'sdlc-portal-foundation','sdlc-portal-foundation_front':'sdlc-portal-foundation'}

def run(args,check=True):
 return subprocess.run(args,check=check,text=True,capture_output=True,timeout=15)

def bridge_rule(value):
 if value.get('Driver')!='bridge' or not re.fullmatch('[a-f0-9]{64}',value.get('Id','')):raise RuntimeError('Unexpected Docker bridge')
 bridge=value.get('Options',{}).get('com.docker.network.bridge.name') or 'br-'+value['Id'][:12]
 if not re.fullmatch('[a-zA-Z][a-zA-Z0-9_.-]{0,14}',bridge):raise RuntimeError('Unexpected bridge name')
 return ['-i',bridge,'-o',bridge,'-j','ACCEPT']

def network_rules(execute=run):
 rules=[]
 for name,project in NETWORKS.items():
  result=execute(['docker','network','inspect',name],check=False)
  if result.returncode:continue
  value=json.loads(result.stdout)[0]
  if value.get('Name')!=name or value.get('Driver')!='bridge' or value.get('Labels',{}).get('com.docker.compose.project')!=project or not re.fullmatch('[a-f0-9]{64}',value.get('Id','')):raise RuntimeError('Keep an unowned or unexpected SDLC network')
  rules.append(bridge_rule(value))
 return rules

def reconcile(rules,execute=run,auditor=administrative_operation):
 missing=[rule for rule in rules if execute(['iptables','-w','5','-C','FORWARD',*rule],check=False).returncode]
 if not missing:return {'checkedNetworks':len(rules),'addedRules':0,'changed':False}
 added=[]
 with auditor('SDLC_DOCKER_NETWORK_RECONCILED',source='sdlc/shared-docker-network',details={'scope':'owned-same-bridge-only','count':len(missing)}) as operation:
  try:
   for rule in missing:
    execute(['iptables','-w','5','-I','FORWARD','1',*rule]);added.append(rule)
  except BaseException:
   # Undo only this attempt's additions; no chain flush or foreign rule removal.
   for rule in reversed(added):execute(['iptables','-w','5','-D','FORWARD',*rule],check=False)
   raise
  operation.result(count=len(added))
 return {'checkedNetworks':len(rules),'addedRules':len(added),'changed':True}

if __name__=='__main__':
 if os.geteuid()!=0 or not Path('/etc/agentic-sdlc-owner').is_file():raise RuntimeError('Owned SDLC and administrator required')
 print(json.dumps(reconcile(network_rules())))
