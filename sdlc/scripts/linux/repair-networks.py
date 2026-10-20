"""Repair prepared GitLab subnets locally; never pull, build or remove volumes."""
import hashlib
import fcntl
import importlib.util
import json
import os
import re
from pathlib import Path
import subprocess
import sys


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def repair(root):
    root = Path(root)
    if root.is_symlink() or root != root.resolve() or not (root / '.owner').is_file() or not re.fullmatch(r'[a-f0-9]{32}', (root / '.owner').read_text().strip()):
        raise ValueError('Owned runtime required')
    gitlab = root / 'gitlab-demo'
    paths = [gitlab / 'images.env', gitlab / 'state/network-allocation.json', gitlab / 'prepared.json']
    if any(path.is_symlink() for path in [gitlab, gitlab / 'state', *paths]):
        raise ValueError('Network repair paths cannot be symlinks')
    # Validate the installed package before changing any recorded configuration.
    manifest = json.loads((root / 'offline/manifest.json').read_text())
    fingerprint = load('installed_fingerprint', root / 'source/services/control/package_fingerprint.py').fingerprint
    if fingerprint(root / 'source') != manifest['package_sha256']:
        raise ValueError('Prepared source changed; run prepare')
    for name, key in [('runtime.env','runtime_env_sha256'), ('compose.yaml','compose_sha256'),
                      ('forgejo/app.ini','forgejo_config_sha256')]:
        if digest(root / name) != manifest[key]:
            raise ValueError('Prepared configuration changed: ' + name)
    prepared = json.loads(paths[2].read_text())
    for name, expected in prepared.items():
        path = gitlab / name
        if path.is_symlink() or not path.is_file() or digest(path) != expected:
            raise ValueError('Prepared GitLab package changed: ' + name)
    project = (root / '.project').read_text().strip() if (root / '.project').exists() else 'agentic-sdlc'
    if not re.fullmatch(r'[a-z][a-z0-9-]{2,63}', project):
        raise ValueError('Invalid project name')
    gitlab_project = 'sdlc-demo' if project == 'agentic-sdlc' else project + '-demo'
    allocator = load('repair_allocator', Path(__file__).resolve().parents[2] / 'services/control/network_allocation.py')
    try:
        allocator.allocate(gitlab, gitlab_project)
        return False
    except allocator.AllocationConflict:
        replacement = allocator.allocate(gitlab, gitlab_project, reallocate=True, write=False)
    old = dict(line.split('=', 1) for line in paths[0].read_text().splitlines())
    saved = [path.read_bytes() for path in paths]
    # Only this Compose project's containers/networks are stopped; volumes remain.
    command = ['docker','compose','--project-name',gitlab_project,'--project-directory',str(gitlab),
               '--env-file',str(paths[0]),'-f',str(gitlab / 'compose.yaml')]
    subprocess.run([*command, 'down'], check=True)
    try:
        old.update(GITLAB_CORE_SUBNET=replacement['core'], GITLAB_FRONT_SUBNET=replacement['front'])
        paths[0].write_text(''.join(f'{key}={value}\n' for key, value in old.items()))
        paths[1].write_text(json.dumps(replacement, indent=2))
        prepared['images.env'] = digest(paths[0])
        paths[2].write_text(json.dumps(prepared, indent=2))
        subprocess.run([*command, 'config', '--quiet'], check=True)
    except BaseException:
        for path, original in zip(paths, saved):
            path.write_bytes(original)
        raise
    print('OK: redes GitLab realocadas para ' + replacement['core'] + ' / ' + replacement['front'] +
          '; imagens e volumes preservados, sem downloads.')
    return True


if __name__ == '__main__':
    if os.geteuid() != 0 or sys.argv[1] != '/opt/agentic-sdlc':
        raise SystemExit('Owned SDLC and root required')
    root = Path(sys.argv[1])
    lock_path = root / 'gitlab-demo/.operation.lock'
    if (root / 'gitlab-demo').is_symlink() or lock_path.is_symlink() or not (root / '.owner').is_file():
        raise SystemExit('Owned GitLab and regular lock required')
    os.umask(0o077)
    with lock_path.open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        repair(root)
