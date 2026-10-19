"""Keep this project's bridge isolation independent of another WSL Docker daemon."""
import hashlib
import json
import subprocess
import sys


def run(*args, check=True):
    return subprocess.run(args, check=check, capture_output=True, text=True)


def guard(project, remove=False):
    chain = 'SDLC-' + hashlib.sha256(project.encode()).hexdigest()[:12]
    def rule(table, *args):
        if run('iptables', '-w', '5', '-C', table, *args, check=False).returncode:
            run('iptables', '-w', '5', '-A', table, *args)
    if remove:
        while not run('iptables', '-w', '5', '-D', 'DOCKER-USER', '-j', chain, check=False).returncode:
            pass
        if not run('iptables', '-w', '5', '-F', chain, check=False).returncode:
            run('iptables', '-w', '5', '-X', chain)
        return
    networks = []
    for kind in ('core', 'front'):
        result = run('docker', 'network', 'inspect', project + '_' + kind, check=False)
        if result.returncode:
            continue
        network = json.loads(result.stdout)[0]
        if (network.get('Labels') or {}).get('com.docker.compose.project') != project:
            raise ValueError('Network ownership mismatch')
        networks.append('br-' + network['Id'][:12])
    if not networks:
        return
    run('iptables', '-w', '5', '-N', chain, check=False)
    for bridge in networks:
        # Only intra-bridge forwarding is accepted; never bridge-to-bridge/LAN.
        rule(chain, '-i', bridge, '-o', bridge, '-j', 'ACCEPT')
        rule(chain, '-i', bridge, '-j', 'DROP')
        rule(chain, '-o', bridge, '-j', 'DROP')
    if run('iptables', '-w', '5', '-C', 'DOCKER-USER', '-j', chain, check=False).returncode:
        run('iptables', '-w', '5', '-I', 'DOCKER-USER', '1', '-j', chain)


if __name__ == '__main__':
    guard(sys.argv[1], len(sys.argv) > 2 and sys.argv[2] == 'remove')
