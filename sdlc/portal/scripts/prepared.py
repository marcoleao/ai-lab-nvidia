"""Verify the local prepared portal without build, download or service changes."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
POSTGRES = 'postgres@sha256:2d2b8998d31037bf721cfdf764d76ba74171b4fab3431b7f72c27c56ddbdf9e3'
SCANNER = 'semgrep/semgrep@sha256:81474464c1f07483ba0682a44787fd93c91397419762a04abe2bafaae396304b'


def fingerprint():
    excluded = {'.prepared', 'node_modules', '.next', 'generated', 'test-results', 'playwright-report', 'docs', '__pycache__'}
    records = []
    for path in sorted(ROOT.rglob('*')):
        if excluded.intersection(path.relative_to(ROOT).parts):
            continue
        if path.is_symlink():
            raise RuntimeError('Prepared source cannot contain symlinks')
        if not path.is_file() or path.name in {'.env', 'README.md'} or path.name.endswith('.tsbuildinfo'):
            continue
        records.append([path.relative_to(ROOT).as_posix(), hashlib.sha256(path.read_bytes()).hexdigest()])
    return hashlib.sha256(json.dumps(records, separators=(',', ':')).encode()).hexdigest()


def image_id(image):
    return subprocess.check_output(['docker', 'image', 'inspect', image, '--format', '{{.Id}}'], text=True).strip()


def image_source():
    return (json.loads(subprocess.check_output(['docker', 'image', 'inspect', 'sdlc-portal:prepared'], text=True))[0]['Config'].get('Labels') or {}).get('org.sdlc.source')


def scanner_matches_source():
    output = subprocess.check_output(['docker','run','--rm','--pull','never','--network','none','--read-only','--entrypoint','sha256sum','sdlc-security-scanner:prepared','/scanner/service.py','/scanner/rules.yaml'],text=True)
    actual = {Path(line.split()[1]).name:line.split()[0] for line in output.splitlines()}
    return actual == {name:hashlib.sha256((ROOT/'security'/name).read_bytes()).hexdigest() for name in ['service.py','rules.yaml']}


if __name__ == '__main__':
    command = sys.argv[1] if len(sys.argv) == 2 else ''
    manifest = ROOT / '.prepared/manifest.json'
    if command == 'prepare':
        snapshot = fingerprint()
        subprocess.run(['docker', 'pull', POSTGRES], check=True)
        subprocess.run(['docker', 'pull', SCANNER], check=True)
        subprocess.run(['docker', 'build', '--network=none', '-t', 'sdlc-security-scanner:prepared', str(ROOT / 'security')], check=True)
        subprocess.run(['docker', 'build', '--build-arg', 'SOURCE_SHA256=' + snapshot, '-t', 'sdlc-portal:prepared', '-f', str(ROOT / 'infra/Dockerfile'), str(ROOT)], check=True)
        if snapshot != fingerprint() or snapshot != image_source():
            raise SystemExit('Source changed during preparation; repeat prepare')
        command = 'record'
    if command == 'record':
        if image_source() != fingerprint():
            raise SystemExit('Image does not match current source; run prepare')
        if not scanner_matches_source():
            raise SystemExit('Scanner does not match current source; run prepare')
        manifest.parent.mkdir(exist_ok=True)
        manifest.write_text(json.dumps({'version': 2, 'source': fingerprint(), 'image': image_id('sdlc-portal:prepared'), 'postgres': image_id(POSTGRES), 'scanner':image_id('sdlc-security-scanner:prepared')}, indent=2))
    elif command == 'verify':
        if not manifest.is_file():
            raise SystemExit('Portal not prepared; run portal/bootstrap.ps1 prepare first')
        expected = json.loads(manifest.read_text())
        if not scanner_matches_source() or image_source() != fingerprint() or expected != {'version': 2, 'source': fingerprint(), 'image': image_id('sdlc-portal:prepared'), 'postgres': image_id(POSTGRES), 'scanner':image_id('sdlc-security-scanner:prepared')}:
            raise SystemExit('Prepared portal changed; run portal/bootstrap.ps1 prepare again')
    elif command == 'fingerprint':
        print(fingerprint())
    else:
        raise SystemExit('Usage: prepared.py prepare|record|verify|fingerprint')
