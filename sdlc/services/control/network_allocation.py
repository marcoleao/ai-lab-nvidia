"""Allocate SDLC bridge pairs outside connected WSL/lab networks."""
import ipaddress
import json
from pathlib import Path
import subprocess
import sys


class AllocationConflict(ValueError):
    """A prepared subnet was claimed by another stack or reservation."""


def reservations(root):
    root = Path(root)
    sibling = root.parent / 'state/network-allocation.json' if root.name == 'gitlab-demo' else root / 'gitlab-demo/state/network-allocation.json'
    if sibling.is_symlink():
        raise ValueError('Reservation marker cannot be a symlink')
    if not sibling.exists():
        return []
    value = json.loads(sibling.read_text())
    return [ipaddress.ip_network(value[key]) for key in ('core', 'front')]


def allocate(root, project, reallocate=False, write=True):
    root = Path(root)
    names = subprocess.check_output(['docker', 'network', 'ls', '-q'], text=True).split()
    networks = json.loads(subprocess.check_output(['docker', 'network', 'inspect', *names], text=True)) if names else []
    owned = {network['Name']: network for network in networks if (network.get('Labels') or {}).get('com.docker.compose.project') == project}
    reserved = reservations(root)
    foreign = [ipaddress.ip_network(item['Subnet']) for network in networks
               if (network.get('Labels') or {}).get('com.docker.compose.project') != project
               for item in (network.get('IPAM', {}).get('Config') or []) if item.get('Subnet')]
    marker = root / 'state/network-allocation.json'
    if marker.is_symlink():
        raise ValueError('Allocation marker cannot be a symlink')
    if marker.exists() and not reallocate:
        value = json.loads(marker.read_text())
        if value['core'] == value['front']:
            raise ValueError('SDLC bridges require distinct subnets')
        for key, name in [('core', project+'_core'), ('front', project+'_front')]:
            subnet = ipaddress.ip_network(value[key])
            if not subnet.subnet_of(ipaddress.ip_network('10.240.0.0/16')) or subnet.prefixlen != 24:
                raise ValueError('Unexpected SDLC allocation')
            if any(subnet.version == other.version and subnet.overlaps(other) for other in reserved + foreign):
                raise AllocationConflict('Prepared subnet overlaps another project allocation: ' + str(subnet))
            network = owned.get(name)
            if network and subnet not in [ipaddress.ip_network(entry['Subnet']) for entry in (network['IPAM']['Config'] or []) if entry.get('Subnet')]:
                raise ValueError('Existing SDLC network differs from allocation')
        return value
    occupied = list(reserved)
    for network in networks:
        occupied.extend(ipaddress.ip_network(item['Subnet']) for item in (network.get('IPAM', {}).get('Config') or []) if item.get('Subnet'))
    routes = json.loads(subprocess.check_output(['ip', '-j', '-4', 'route'], text=True))
    occupied.extend(ipaddress.ip_network(route['dst'], strict=False) for route in routes if route.get('dst') and route['dst'] != 'default')
    for index in range(0, 256, 2):
        pair = [ipaddress.ip_network(f'10.240.{index+offset}.0/24') for offset in (0, 1)]
        if not any(candidate.overlaps(existing) for candidate in pair for existing in occupied if candidate.version == existing.version):
            value = {'core': str(pair[0]), 'front': str(pair[1])}
            if write:
                marker.write_text(json.dumps(value, indent=2))
                marker.chmod(0o600)
            return value
    raise RuntimeError('No free pair in reviewed SDLC pool 10.240.0.0/16; review network before preparing')


if __name__ == '__main__':
    value = allocate(sys.argv[1], sys.argv[2])
    print(f'SDLC_CORE_SUBNET={value["core"]}\nSDLC_FRONT_SUBNET={value["front"]}')
