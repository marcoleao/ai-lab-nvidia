"""One clock authority for owned WSL distros: the Windows/Hyper-V host.

Never sets time or changes Windows services. Keeps a reversible unit drop-in and
private before/after evidence outside application databases.
"""
from pathlib import Path
import argparse,hashlib,json,os,subprocess,uuid
from audit_admin import administrative_operation,atomic_json

SERVICE='systemd-timesyncd.service'
CONTENT='# Managed by AI Lab / SDLC WSL host clock policy v1\n[Unit]\nConditionVirtualization=!wsl\n'
RELATIVE=Path(SERVICE+'.d/60-ai-lab-host-clock.conf')

def apply_policy(root,unit_root=Path('/etc/systemd/system'),invoke=None):
 root=Path(root);unit_root=Path(unit_root);target=unit_root/RELATIVE
 invoke=invoke or (lambda args:subprocess.run(['systemctl',*args],capture_output=True,text=True))
 def active():return invoke(['is-active','--quiet',SERVICE]).returncode==0
 def command(*args):
  if invoke(list(args)).returncode:raise RuntimeError('Clock service operation not confirmed')
 with administrative_operation('LAB_WSL_CLOCK_POLICY_APPLIED',source='lab/wsl-clock',root=root,details={'command':'host-clock-policy','scope':'owned-WSL-timesyncd-only-no-clock-setting-or-business-data','path':str(target),'manifestDigest':hashlib.sha256(CONTENT.encode()).hexdigest()}) as operation:
  # Never replace a foreign drop-in or traverse an unexpected link.
  if unit_root.is_symlink() or target.parent.is_symlink() or target.is_symlink() or (target.exists() and target.read_text()!=CONTENT):
   operation.result('REJECTED');return {'applied':False,'reason':'foreign-clock-drop-in','changed':False}
  before={'content':target.read_text() if target.exists() else None,'active':active()}
  if before['content']==CONTENT and not before['active']:
   operation.result('NO_CHANGE',count=0);return {'applied':True,'changed':False,'clockSet':False}
  backup=root/'audit'/('clock-policy-'+uuid.uuid4().hex);backup.mkdir(parents=True,mode=0o700);atomic_json(backup/'before.json',before)
  try:
   target.parent.mkdir(parents=True,exist_ok=True);target.write_text(CONTENT);target.chmod(0o644)
   command('daemon-reload');command('stop',SERVICE)
   after={'content':target.read_text(),'active':active()};atomic_json(backup/'after.json',after)
   if after['active']:raise RuntimeError('Keep deployment stopped: a second clock controller remains')
  except Exception as error:
   restored=False
   try:
    if before['content'] is None:target.unlink(missing_ok=True)
    else:target.write_text(before['content'])
    command('daemon-reload')
    if before['active']:command('start',SERVICE)
    restored=active()==before['active'] and (target.read_text() if target.exists() else None)==before['content']
   except Exception:pass
   atomic_json(backup/'rollback.json',{'confirmed':restored,'errorType':type(error).__name__})
   if not restored:raise RuntimeError('Clock policy rollback was not confirmed') from error
   operation.result('FAILED',backupId=backup.name)
   return {'applied':False,'rollbackConfirmed':restored,'clockSet':False}
  operation.result(backupId=backup.name,count=1)
  return {'applied':True,'changed':True,'clockSet':False,'linuxNtpActive':False}

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--root',choices=['/opt/ai-local-lab','/opt/agentic-sdlc'],required=True);args=parser.parse_args()
 marker=Path('/etc/ai-local-lab-owner' if args.root=='/opt/ai-local-lab' else '/etc/agentic-sdlc-owner')
 if os.geteuid()!=0 or not marker.is_file() or marker.is_symlink():raise RuntimeError('Owned distro and root required')
 virtualization=subprocess.run(['systemd-detect-virt'],capture_output=True,text=True).stdout.strip()
 if virtualization!='wsl':raise RuntimeError('Only the owned WSL host clock policy is supported')
 root=Path(args.root)
 if root.is_symlink() or root.resolve()!=root:raise RuntimeError('Keep unexpected runtime root')
 root.mkdir(exist_ok=True,mode=0o700)
 result=apply_policy(root);print(json.dumps(result));return 0 if result['applied'] else 1
if __name__=='__main__':raise SystemExit(main())
