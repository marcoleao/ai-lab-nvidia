"""Block external forwarding and host access for the owned laboratory bridge."""
import json
import ipaddress
import os
from pathlib import Path
import subprocess
import sys
import importlib.util


def migrate():
    """Explicit maintenance entry; normal guard never replaces a network."""
    spec=importlib.util.spec_from_file_location('lab_network_migration',ROOT/'scripts/linux/network-migration.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module.migrate(network_settings())

ROOT=Path(__file__).resolve().parents[2]

def network_settings(values=None):
    if values is None:
        values={}
        for line in (ROOT/'config/lab.yaml').read_text().splitlines():
            if ':' in line and not line.lstrip().startswith('#'):
                key,value=line.split(':',1);values[key.strip()]=value.strip()
    subnet=ipaddress.ip_network(values['lab_network_subnet'],strict=True)
    dynamic=ipaddress.ip_network(values['lab_network_dynamic_range'],strict=True)
    address=ipaddress.ip_address(values['ollama_address'])
    private=[ipaddress.ip_network(value) for value in ['10.0.0.0/8','172.16.0.0/12','192.168.0.0/16']]
    if subnet.version!=4 or not any(subnet.subnet_of(block) for block in private) or not dynamic.subnet_of(subnet) or address not in subnet or address in dynamic or address in [subnet.network_address,subnet.broadcast_address,subnet.network_address+1]:
        raise ValueError('Use a private IPv4 subnet, a dynamic range inside it, and an Ollama address outside that range and the gateway')
    return str(subnet),str(dynamic),str(subnet.network_address+1),str(address)


def run(*args, check=True):
    return subprocess.run(args, check=check, capture_output=True, text=True)


def guard(remove=False, ensure=False, prepare=False, validate_declared=True):
    if os.geteuid() != 0 or not Path('/etc/ai-local-lab-owner').is_file():
        raise RuntimeError('Owned laboratory and root required.')
    subnet,dynamic,gateway,_=network_settings()
    # Verify before removing existing isolation: a refused migration must keep
    # the restored bridge blocked, even while the declaration names a new subnet.
    preflight=run('docker','network','inspect','ai-local-lab_lab',check=False)
    if preflight.returncode==0:
        current=json.loads(preflight.stdout)[0]
        if current.get('Labels',{}).get('com.docker.compose.project')!='ai-local-lab':raise RuntimeError('Laboratory network ownership mismatch.')
        actual=current.get('IPAM',{}).get('Config',[])
        if validate_declared and not remove and (len(actual)!=1 or actual[0].get('Subnet')!=subnet or actual[0].get('IPRange')!=dynamic or actual[0].get('Gateway')!=gateway):raise RuntimeError('Laboratory subnet differs from its declaration; migrate the owned network while preserving volumes before continuing.')
    # WSL distributions share netfilter. Another Docker engine can rebuild
    # DOCKER-FORWARD without this engine's bridge. Own explicit rules avoid
    # restarting either daemon or weakening other SDLC networks.
    for parent in ['FORWARD']:
        while run('iptables','-w','5','-D',parent,'-j','AILAB-PREPARE',check=False).returncode==0:pass
    run('iptables','-w','5','-F','AILAB-PREPARE',check=False)
    run('iptables','-w','5','-X','AILAB-PREPARE',check=False)
    pairs = [('DOCKER-USER','AILAB-OFFLINE'), ('INPUT','AILAB-HOST')]
    for parent, chain in pairs:
        while run('iptables','-w','5','-D',parent,'-j',chain,check=False).returncode == 0:
            pass
        run('iptables','-w','5','-F',chain,check=False)
        run('iptables','-w','5','-X',chain,check=False)
    if remove and not prepare:
        return
    result = run('docker','network','inspect','ai-local-lab_lab',check=False)
    if result.returncode and ensure:
        # Install the guard before any application container can start.
        run('docker','network','create',
            '--subnet',subnet,'--ip-range',dynamic,'--gateway',gateway,'--label','com.docker.compose.project=ai-local-lab',
            '--label','com.docker.compose.network=lab','ai-local-lab_lab')
        result = run('docker','network','inspect','ai-local-lab_lab')
    if result.returncode:
        return
    network = json.loads(result.stdout)[0]
    if network.get('Labels',{}).get('com.docker.compose.project') != 'ai-local-lab':
        raise RuntimeError('Laboratory network ownership mismatch.')
    actual=network.get('IPAM',{}).get('Config',[])
    if validate_declared and (len(actual)!=1 or actual[0].get('Subnet')!=subnet or actual[0].get('IPRange')!=dynamic or actual[0].get('Gateway')!=gateway):
        raise RuntimeError('Laboratory subnet differs from its declaration; migrate the owned network while preserving volumes before continuing.')
    bridge = network.get('Options',{}).get('com.docker.network.bridge.name') or 'br-' + network['Id'][:12]
    if prepare:
        sys.path.insert(0,str(ROOT/'lib'))
        from audit_admin import administrative_operation
        with administrative_operation('LAB_NETWORK_PREPARATION_OPENED',source='lab/offline-network',root=ROOT,details={'scope':'owned-lab-bridge-only-online-preparation'}) as operation:
            run('iptables','-w','5','-N','AILAB-PREPARE')
            run('iptables','-w','5','-A','AILAB-PREPARE','-o',bridge,'-m','conntrack','--ctstate','ESTABLISHED,RELATED','-j','ACCEPT')
            run('iptables','-w','5','-A','AILAB-PREPARE','-i',bridge,'-j','ACCEPT')
            run('iptables','-w','5','-I','FORWARD','1','-j','AILAB-PREPARE')
            operation.result(scope='owned-lab-bridge-ready-for-explicit-downloads')
        return
    for parent, chain in pairs:
        run('iptables','-w','5','-N',chain)
        run('iptables','-w','5','-A',chain,'-i',bridge,'-m','conntrack','--ctstate','ESTABLISHED,RELATED','-j','ACCEPT')
        if parent == 'DOCKER-USER':
            run('iptables','-w','5','-A',chain,'-i',bridge,'-o',bridge,'-j','ACCEPT')
        run('iptables','-w','5','-A',chain,'-i',bridge,'-j','DROP')
        run('iptables','-w','5','-I',parent,'1','-j',chain)
    print('OK: laboratório sem saída externa; conexões internas e respostas locais permitidas.')


if __name__ == '__main__':
    if sys.argv[1:]==['isolate']:
        guard(validate_declared=False)
        raise SystemExit(0)
    if sys.argv[1:]==['migrate']:
        migrate()
        raise SystemExit(0)
    preparing='prepare' in sys.argv[1:]
    was_preparing=not preparing and run('iptables','-w','5','-C','FORWARD','-j','AILAB-PREPARE',check=False).returncode==0
    if was_preparing:
        sys.path.insert(0,str(ROOT/'lib'))
        from audit_admin import administrative_operation
        with administrative_operation('LAB_NETWORK_ISOLATION_RESTORED',source='lab/offline-network',root=ROOT,details={'scope':'close-owned-lab-online-preparation'}) as operation:
            guard(remove='remove' in sys.argv[1:],ensure='ensure' in sys.argv[1:])
            operation.result(scope='owned-lab-network-online-window-closed')
    else:
        guard(remove='remove' in sys.argv[1:], ensure='ensure' in sys.argv[1:] or preparing,prepare=preparing)
