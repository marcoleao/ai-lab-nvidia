"""Block external forwarding and host access for the owned laboratory bridge."""
import json
import os
from pathlib import Path
import subprocess
import sys


def run(*args, check=True):
    return subprocess.run(args, check=check, capture_output=True, text=True)


def guard(remove=False, ensure=False):
    if os.geteuid() != 0 or not Path('/etc/ai-local-lab-owner').is_file():
        raise RuntimeError('Owned laboratory and root required.')
    pairs = [('DOCKER-USER','AILAB-OFFLINE'), ('INPUT','AILAB-HOST')]
    for parent, chain in pairs:
        while run('iptables','-w','5','-D',parent,'-j',chain,check=False).returncode == 0:
            pass
        run('iptables','-w','5','-F',chain,check=False)
        run('iptables','-w','5','-X',chain,check=False)
    if remove:
        return
    result = run('docker','network','inspect','ai-local-lab_lab',check=False)
    if result.returncode and ensure:
        # Install the guard before any application container can start.
        run('docker','network','create',
            '--label','com.docker.compose.project=ai-local-lab',
            '--label','com.docker.compose.network=lab','ai-local-lab_lab')
        result = run('docker','network','inspect','ai-local-lab_lab')
    if result.returncode:
        return
    network = json.loads(result.stdout)[0]
    if network.get('Labels',{}).get('com.docker.compose.project') != 'ai-local-lab':
        raise RuntimeError('Laboratory network ownership mismatch.')
    bridge = network.get('Options',{}).get('com.docker.network.bridge.name') or 'br-' + network['Id'][:12]
    for parent, chain in pairs:
        run('iptables','-w','5','-N',chain)
        run('iptables','-w','5','-A',chain,'-i',bridge,'-m','conntrack','--ctstate','ESTABLISHED,RELATED','-j','ACCEPT')
        if parent == 'DOCKER-USER':
            run('iptables','-w','5','-A',chain,'-i',bridge,'-o',bridge,'-j','ACCEPT')
        run('iptables','-w','5','-A',chain,'-i',bridge,'-j','DROP')
        run('iptables','-w','5','-I',parent,'1','-j',chain)
    print('OK: laboratório sem saída externa; conexões internas e respostas locais permitidas.')


if __name__ == '__main__':
    guard(remove='remove' in sys.argv[1:], ensure='ensure' in sys.argv[1:])
