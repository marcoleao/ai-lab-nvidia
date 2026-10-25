"""Validate conversation changes in disposable Docker resources only.

Run from WSL: python3 scripts/validate-conversations.py prepare|refresh|check|test|e2e|status|cleanup.
The source mount is read-only. No installed portal container, database or secret is used.
"""
from pathlib import Path
import argparse
import json
import re
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
PREFIX = 'sdlc-conversations-test-20261024'
LABEL = 'org.sdlc.validation'
OWNER = 'conversations-20261024'
NETWORK = PREFIX + '-network'
DATABASE = PREFIX + '-db'
RUNNER = PREFIX + '-runner'
BROWSER = PREFIX + '-browser'
IMAGE = 'sdlc-portal:prepared'
BROWSER_IMAGE = 'sdlc-portal-browser:prepared'
POSTGRES = 'postgres@sha256:2d2b8998d31037bf721cfdf764d76ba74171b4fab3431b7f72c27c56ddbdf9e3'
URL = f'postgresql://sdlc:conversations-test-only@{DATABASE}:5432/portal_test'
ENV = ['-e', 'DATABASE_URL=' + URL, '-e', 'TEST_DATABASE_URL=' + URL,
       '-e', 'DEMO_MODE=true', '-e', 'PORTAL_ORIGIN=http://127.0.0.1:3000',
       '-e', 'API_BASE_URL=http://127.0.0.1:4100', '-e', 'NEXT_TELEMETRY_DISABLED=1']

SYNC = r"""
const {cpSync,existsSync}=require('node:fs');
if(existsSync('/app/.env'))throw new Error('Test image must not contain a .env file');
const excluded=new Set(['node_modules','.next','.prepared','.git','generated','test-results','playwright-report','__pycache__']);
const filter=source=>!source.slice('/source/'.length).split('/').some(part=>excluded.has(part)||part==='.env'||part.startsWith('.env.'));
for(const name of ['apps','packages','prisma','tests','scripts'])cpSync('/source/'+name,'/app/'+name,{recursive:true,force:true,filter});
for(const name of ['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','tsconfig.json','prisma.config.ts','vitest.config.ts','playwright.config.ts'])cpSync('/source/'+name,'/app/'+name,{force:true});
console.log('Current sources copied into disposable runner; secrets and generated/build files excluded.');
"""


def docker(*args, capture=False, check=True):
    return subprocess.run(['docker', *args], check=check, text=True,
                          stdout=subprocess.PIPE if capture else None,
                          stderr=subprocess.PIPE if capture else None)


def exists(name, kind='container'):
    return docker(kind, 'inspect', name, capture=True, check=False).returncode == 0


def owned(name, kind='container'):
    field = '.Config.Labels' if kind == 'container' else '.Labels'
    result = docker(kind, 'inspect', name, '--format', '{{json ' + field + '}}', capture=True)
    if (json.loads(result.stdout) or {}).get(LABEL) != OWNER:
        raise SystemExit('Refusing to change a resource without this validation label: ' + name)


def checked_runner():
    owned(RUNNER)
    output = docker('exec', RUNNER, 'node', '-e',
                    "if(new URL(process.env.DATABASE_URL).pathname!=='/portal_test'||new URL(process.env.TEST_DATABASE_URL).pathname!=='/portal_test')throw Error('Disposable database required'); console.log('Database target: portal_test');",
                    capture=True)
    print(output.stdout, end='')


def refresh():
    checked_runner()
    docker('exec', '-u', '0', RUNNER, 'node', '-e', SYNC)
    docker('exec', RUNNER, 'pnpm', 'db:generate')


def prepare():
    for name, kind in [(NETWORK, 'network'), (DATABASE, 'container'), (RUNNER, 'container')]:
        if exists(name, kind):
            owned(name, kind)
    if not exists(NETWORK, 'network'):
        docker('network', 'create', '--internal', '--label', LABEL + '=' + OWNER, NETWORK)
    if not exists(DATABASE):
        docker('run', '-d', '--pull', 'never', '--name', DATABASE,
               '--label', LABEL + '=' + OWNER, '--network', NETWORK,
               '--memory', '384m', '-e', 'POSTGRES_USER=sdlc',
               '-e', 'POSTGRES_PASSWORD=conversations-test-only',
               '-e', 'POSTGRES_DB=portal_test', POSTGRES)
    for _ in range(60):
        if docker('exec', DATABASE, 'pg_isready', '-U', 'sdlc', '-d', 'portal_test', capture=True, check=False).returncode == 0:
            break
        time.sleep(0.5)
    else:
        raise SystemExit('Disposable PostgreSQL did not become ready')
    if not exists(RUNNER):
        docker('run', '-d', '--pull', 'never', '--name', RUNNER, '-u', '0',
               '--label', LABEL + '=' + OWNER, '--network', NETWORK,
               '--mount', f'type=bind,source={ROOT},target=/source,readonly',
               '--memory', '3g', *ENV, IMAGE, 'sleep', 'infinity')
    refresh()
    docker('exec', RUNNER, 'pnpm', 'db:setup')
    print('Disposable runner ready:', RUNNER)


def check():
    refresh()
    docker('exec', RUNNER, 'pnpm', 'typecheck')
    docker('exec', RUNNER, 'pnpm', 'audit:check')
    docker('exec', RUNNER, 'pnpm', 'build')


def test(files):
    checked_runner()
    if not files:
        # This runner resets portal_test before every integration suite.
        result = docker('exec', RUNNER, 'pnpm', 'test', capture=True, check=False)
        output = re.sub(r'\x1b\[[0-9;]*m', '', result.stdout + result.stderr)
        log = ROOT / 'test-results/conversations-backend.log'
        log.parent.mkdir(exist_ok=True)
        log.write_text(output, encoding='utf-8')
        for line in output.splitlines():
            if 'Test Files ' in line or re.match(r'\s*Tests\s', line):
                print(line)
        print('Complete isolated backend log:', log)
        if result.returncode:
            print(output[-18000:])
            raise SystemExit(result.returncode)
        return
    # A targeted suite gets its own fresh disposable schema as well.
    docker('exec', RUNNER, 'node', '-e',
           "const pg=require('pg'); (async()=>{const c=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});await c.connect();try{const r=await c.query('SELECT current_database() AS name');if(r.rows[0].name!=='portal_test')throw Error('Refusing non-test target');await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');}finally{await c.end();}})().catch(e=>{console.error(e.message);process.exit(1)});")
    docker('exec', RUNNER, 'pnpm', 'db:setup')
    docker('exec', RUNNER, 'node', 'node_modules/vitest/vitest.mjs', 'run', *files)


def e2e(files):
    checked_runner()
    if exists(BROWSER):
        owned(BROWSER)
        docker('rm', '-f', '-v', BROWSER)
    # Rebuilding Next while an older server is alive leaves stale workers and
    # chunk manifests. Restart only this labelled disposable runner, retaining
    # its copied sources and build, before starting the test services.
    docker('restart', RUNNER)
    docker('run', '-d', '--pull', 'never', '--name', BROWSER, '-u', '0',
           '--label', LABEL + '=' + OWNER, '--network', 'container:' + RUNNER,
           '--shm-size', '256m', '--mount', f'type=bind,source={ROOT},target=/source,readonly',
           '-e', 'TEST_DATABASE_URL=' + URL,
           '-e', 'PORTAL_TEST_BASE_URL=http://127.0.0.1:3000',
           BROWSER_IMAGE, 'sleep', 'infinity')
    docker('exec', BROWSER, 'node', '-e', SYNC)
    # Processes are confined to this runner and its fresh portal_test database.
    docker('exec', '-d', '-e', 'PORTAL_ORIGIN=http://127.0.0.1:3000', RUNNER, 'node', '--import', 'tsx', 'apps/api/src/server.ts')
    docker('exec', '-d', RUNNER, 'node', 'apps/web/node_modules/next/dist/bin/next',
           'start', 'apps/web', '--hostname', '0.0.0.0', '--port', '3000')
    for _ in range(80):
        ready = docker('exec', RUNNER, 'node', '-e',
                       "fetch('http://127.0.0.1:3000/api/health').then(async r=>{const h=await r.json();process.exit(r.ok&&h.databaseMode==='test'?0:1)}).catch(()=>process.exit(1))",
                       capture=True, check=False)
        if ready.returncode == 0:
            break
        time.sleep(0.5)
    else:
        raise SystemExit('Disposable web/API did not become ready in test mode')
    docker('exec', BROWSER, 'node', 'node_modules/@playwright/test/cli.js', 'test',
           *(files or ['tests/e2e/assistant-workspace.spec.ts', 'tests/e2e/story-task-planning.spec.ts']))


def cleanup():
    for name in [BROWSER, RUNNER, DATABASE]:
        if exists(name):
            owned(name)
            docker('rm', '-f', '-v', name)
    if exists(NETWORK, 'network'):
        owned(NETWORK, 'network')
        docker('network', 'rm', NETWORK)


def status():
    for name, kind in [(NETWORK, 'network'), (DATABASE, 'container'), (RUNNER, 'container'), (BROWSER, 'container')]:
        present = exists(name, kind)
        if present:
            owned(name, kind)
        print(name + ': ' + ('owned disposable resource' if present else 'absent'))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['prepare', 'refresh', 'check', 'test', 'e2e', 'status', 'cleanup'])
    parser.add_argument('files', nargs='*')
    args = parser.parse_args()
    if args.command in ['test', 'e2e']:
        globals()[args.command](args.files)
    else:
        globals()[args.command]()
