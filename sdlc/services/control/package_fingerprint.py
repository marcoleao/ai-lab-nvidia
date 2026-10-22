"""Hash the reviewed package; generated state and documentation are excluded."""
from pathlib import Path
import hashlib
import json
import sys


def fingerprint(root):
    root = Path(root)
    paths = [root / 'compose.yaml', root / 'bootstrap.ps1', root / '.dockerignore', root / 'gitlab.ps1']
    for directory in ('services/control', 'docker', 'locks', 'config', 'policies', 'scripts', 'gitlab', 'tests/fixtures'):
        paths.extend(p for p in (root / directory).rglob('*') if p.is_file() and not {'__pycache__', '.pytest_cache'}.intersection(p.parts))
    records = []
    for path in sorted(set(paths)):
        if path.is_symlink():
            raise ValueError('Package cannot contain symlinks')
        records.append([path.relative_to(root).as_posix(), hashlib.sha256(path.read_bytes()).hexdigest()])
    return hashlib.sha256(json.dumps(records, separators=(',', ':')).encode()).hexdigest()


if __name__ == '__main__':
    print(fingerprint(sys.argv[1]))
