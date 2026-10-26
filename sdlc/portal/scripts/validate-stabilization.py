"""Validate lifecycle/specification changes in owned disposable Docker resources.

Run from WSL: python3 scripts/validate-stabilization.py prepare|refresh|check|test|e2e|status|cleanup.
Uses only local prepared images and its own portal_test database; no deployment.
"""
from pathlib import Path
import argparse
import importlib.util
import re

spec = importlib.util.spec_from_file_location('isolated_portal_validation', Path(__file__).with_name('validate-conversations.py'))
validation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validation)
validation.PREFIX = 'sdlc-stabilization-test-20261025'
validation.OWNER = 'stabilization-20261025'
validation.NETWORK = validation.PREFIX + '-network'
validation.DATABASE = validation.PREFIX + '-db'
validation.RUNNER = validation.PREFIX + '-runner'
validation.BROWSER = validation.PREFIX + '-browser'
# prepare() uses the existing isolated password literal; use it consistently.
validation.URL = f'postgresql://sdlc:conversations-test-only@{validation.DATABASE}:5432/portal_test'
validation.ENV = ['-e', 'DATABASE_URL=' + validation.URL, '-e', 'TEST_DATABASE_URL=' + validation.URL,
                  '-e', 'DEMO_MODE=true', '-e', 'PORTAL_ORIGIN=http://127.0.0.1:3000',
                  '-e', 'API_BASE_URL=http://127.0.0.1:4100', '-e', 'NEXT_TELEMETRY_DISABLED=1']

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['prepare', 'refresh', 'check', 'test', 'e2e', 'status', 'cleanup'])
    parser.add_argument('files', nargs='*')
    args = parser.parse_args()
    if args.command == 'test':
        validation.checked_runner()
        names = [Path(name).name for name in args.files]
        # Stop any services left by e2e so workers cannot consume integration
        # fixtures while this runner resets its own disposable schema.
        validation.docker('restart', validation.RUNNER)
        result = validation.docker('exec', validation.RUNNER, 'node', 'scripts/test-isolated.mjs', *names,
                                   capture=True, check=False)
        output = re.sub(r'\x1b\[[0-9;]*m', '', result.stdout + result.stderr)
        log = validation.ROOT / ('test-results/stabilization-targeted.log' if names else 'test-results/stabilization-backend.log')
        log.parent.mkdir(exist_ok=True)
        log.write_text(output, encoding='utf-8')
        for line in output.splitlines():
            if 'Test Files ' in line or re.match(r'\s*Tests\s', line):
                print(line)
        print('Isolated backend log:', log)
        if result.returncode:
            print(output[-18000:])
            raise SystemExit(result.returncode)
    elif args.command == 'e2e':
        validation.e2e(args.files or ['tests/e2e/stabilization.spec.ts'])
    else:
        getattr(validation, args.command)()
