"""GitLab descartável para demos. Preparação on-line; operação em rede interna."""
import argparse
import base64
import fcntl
import hashlib
import json
import os
import re
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = Path(os.environ.get('SDLC_RUNTIME_ROOT', '/opt/agentic-sdlc')) / 'gitlab-demo'
PROJECT = os.environ.get('SDLC_GITLAB_PROJECT', 'sdlc-demo')
URL = 'http://127.0.0.1:' + os.environ.get('GITLAB_PORT', '3180')
DEMO_URL = 'http://127.0.0.1:' + os.environ.get('DEMO_PORT', '3181')


def require_disposable_acceptance():
    root = ROOT.parent
    if not re.fullmatch(r'/tmp/sdlc-package-[a-f0-9-]{36}', str(root)) or root.resolve() != root:
        raise RuntimeError('Synthetic acceptance requires a disposable installation; use doctor instead')
    if PROJECT != root.name + '-demo' or (root / '.project').read_text() != root.name:
        raise RuntimeError('Disposable GitLab project does not match installation')
    if not re.fullmatch(r'[a-f0-9]{32}', (root / '.owner').read_text().strip()):
        raise RuntimeError('Disposable installation owner missing')


def run(*args, capture=False):
    return subprocess.run(args, check=True, text=True,
                          stdout=subprocess.PIPE if capture else None).stdout


def compose(*args, capture=False):
    return run('docker', 'compose', '--project-name', PROJECT,
               '--project-directory', str(ROOT), '--env-file', str(ROOT / 'images.env'),
               '-f', str(ROOT / 'compose.yaml'), *args, capture=capture)


def api(method, path, data=None, admin=False):
    bot_token = ROOT / '.secrets/bot_token'
    token_path = ROOT / '.secrets/token' if admin or not bot_token.exists() else bot_token
    token = token_path.read_text().strip()
    request = urllib.request.Request(URL + '/api/v4/' + path, method=method,
        headers={'PRIVATE-TOKEN': token, 'Content-Type': 'application/json'},
        data=json.dumps(data).encode() if data is not None else None)
    with urllib.request.urlopen(request, timeout=60) as response:
        raw = response.read()
        return json.loads(raw) if raw else None


def prepare(source):
    if not (ROOT.parent / '.owner').is_file():
        raise RuntimeError('Prepare o núcleo SDLC primeiro.')
    existing = ROOT / 'images.env'
    if existing.exists() and 'GITLAB_CORE_SUBNET=' not in existing.read_text() and subprocess.run(
            ['docker','network','inspect',PROJECT + '_core'], stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL).returncode == 0:
        # Migração de redes automáticas, preservando todos os volumes das demos.
        compose('down')
    for name in ('compose.yaml', 'Runner.Dockerfile', 'nginx.conf'):
        shutil.copyfile(source / name, ROOT / name)
    (ROOT / 'nginx.conf').chmod(0o644)
    # Ready-made applications belong only to disposable acceptance installations.
    if re.fullmatch(r'/tmp/sdlc-package-[a-f0-9-]{36}', str(ROOT.parent)):
        require_disposable_acceptance()
        shutil.copytree(source.parent / 'tests/fixtures/gitlab', ROOT / 'template', dirs_exist_ok=True)
        pipeline = ROOT / 'template/.gitlab-ci.yml'
        pipeline.write_text(pipeline.read_text().replace('http://127.0.0.1:3181', DEMO_URL))
    secret = ROOT / '.secrets/root_password'
    if not secret.exists():
        secret.write_text(secrets.token_urlsafe(32))
    # Referências oficiais fixadas no código; up nunca baixa ou reconstrói imagens.
    refs = {}
    for key, tag in json.loads((source / 'images.json').read_text()).items():
        run('docker', 'pull', tag)
        refs[key] = json.loads(run('docker', 'image', 'inspect', tag, capture=True))[0]['RepoDigests'][0]
    context = ROOT / 'build-context'
    context.mkdir(exist_ok=True)
    shutil.copyfile(ROOT / 'Runner.Dockerfile', context / 'Dockerfile')
    run('docker', 'build', '--build-arg', 'RUNNER_BASE=' + refs['RUNNER_BASE'],
        '-t', 'sdlc-demo-runner:prepared', str(context))
    refs['RUNNER_IMAGE'] = json.loads(run('docker', 'image', 'inspect',
        'sdlc-demo-runner:prepared', capture=True))[0]['Id']
    sys.path.insert(0, str(ROOT.parent / 'source/services/control'))
    from network_allocation import allocate
    (ROOT / 'state').mkdir(exist_ok=True)
    networks = allocate(ROOT, PROJECT)
    refs['GITLAB_CORE_SUBNET'] = networks['core']
    refs['GITLAB_FRONT_SUBNET'] = networks['front']
    env_path = ROOT / 'images.env'
    previous = env_path.read_text() if env_path.exists() else ''
    content = ''.join(f'{key}={value}\n' for key, value in refs.items())
    env_path.write_text(content)
    # Exporta imagens para reinstalação sem internet (não é backup de demos).
    if previous != content or not (ROOT / 'images.tar').exists():
        run('docker', 'save', '-o', str(ROOT / 'images.tar'), refs['GITLAB_IMAGE'],
            refs['RUNNER_IMAGE'], refs['ENTRY_IMAGE'])
    compose('config', '--quiet')
    files = [ROOT / name for name in ('compose.yaml','nginx.conf','images.env')]
    files.extend(file for file in (ROOT / 'template').rglob('*') if file.is_file() and '__pycache__' not in file.parts)
    manifest = {str(file.relative_to(ROOT)): hashlib.sha256(file.read_bytes()).hexdigest() for file in files}
    (ROOT / 'prepared.json').write_text(json.dumps(manifest, indent=2))
    print('Preparação concluída. Imagens fixadas em images.env; operação sem downloads.')


def verify_prepared():
    path = ROOT / 'prepared.json'
    if not path.exists():
        raise RuntimeError('Execute sdlc/bootstrap.ps1 prepare para preparar GitLab e Runner.')
    for name, expected in json.loads(path.read_text()).items():
        file = ROOT / name
        if file.is_symlink() or not file.is_file() or hashlib.sha256(file.read_bytes()).hexdigest() != expected:
            raise RuntimeError('Pacote GitLab alterado; execute prepare: ' + name)
    refs = dict(line.split('=', 1) for line in (ROOT / 'images.env').read_text().splitlines())
    for key in ('GITLAB_IMAGE','RUNNER_IMAGE','ENTRY_IMAGE'):
        run('docker', 'image', 'inspect', refs[key], capture=True)


def up():
    compose('up', '-d', '--pull', 'never', 'gitlab', 'demo', 'entry')
    compose('exec', '-T', 'entry', 'nginx', '-c', '/etc/nginx/demo.conf', '-s', 'reload')
    deadline = time.monotonic() + 1200
    while time.monotonic() < deadline:
        try:
            # O endpoint /-/readiness é restrito ao localhost do contêiner.
            with urllib.request.urlopen(URL + '/users/sign_in', timeout=5) as response:
                if response.status == 200:
                    break
        except (OSError, urllib.error.URLError):
            pass
        time.sleep(5)
    else:
        raise RuntimeError('GitLab ainda não está pronto; consulte logs e execute up novamente.')
    token_path = ROOT / '.secrets/token'
    if not token_path.exists():
        ruby = ("u=User.find_by_username!('root'); "
                "ApplicationSetting.current.update!(signup_enabled: false); "
                "t=u.personal_access_tokens.create!(name: 'sdlc-local', scopes: ['api'], "
                "expires_at: 300.days.from_now); "
                "token=SecureRandom.hex(24); t.set_token(token); t.save!; "
                "puts 'SDLC_TOKEN=' + token")
        result = compose('exec', '-T', 'gitlab', 'gitlab-rails', 'runner', ruby, capture=True)
        tokens = [line.removeprefix('SDLC_TOKEN=') for line in result.splitlines()
                  if line.startswith('SDLC_TOKEN=')]
        if len(tokens) != 1:
            raise RuntimeError('GitLab não retornou uma credencial de integração válida.')
        token_path.write_text(tokens[0])
    api('PUT', 'application/settings', {'signup_enabled': False,
        'gravatar_enabled': False, 'version_check_enabled': False,
        'enabled_git_access_protocol': 'http'}, admin=True)
    runner_config = ROOT / '.secrets/runner/config.toml'
    if not runner_config.exists():
        runner = api('POST', 'user/runners', {'runner_type': 'instance_type',
                     'description': 'SDLC offline demo', 'tag_list': ['offline-demo'],
                     'run_untagged': False}, admin=True)
        runner_config.write_text(
            'concurrent = 1\ncheck_interval = 3\n[[runners]]\n'
            'name = "offline-demo"\nurl = "http://gitlab:3180"\n'
            f'token = "{runner["token"]}"\n'
            'executor = "shell"\nshell = "bash"\n'
            'clone_url = "http://gitlab:3180"\nbuilds_dir = "/builds"\n')
    bot_token = ROOT / '.secrets/bot_token'
    if not bot_token.exists():
        users = api('GET', 'users?username=sdlc-demo-bot', admin=True)
        bot = users[0] if users else api('POST', 'users', {
            'username': 'sdlc-demo-bot', 'name': 'Agente SDLC local',
            'email': 'sdlc-demo-bot@sdlc.invalid', 'password': secrets.token_urlsafe(32),
            'skip_confirmation': True}, admin=True)
        from datetime import date, timedelta
        credential = api('POST', f'users/{bot["id"]}/personal_access_tokens', {
            'name': 'sdlc-demo', 'scopes': ['api'],
            'expires_at': (date.today() + timedelta(days=300)).isoformat()}, admin=True)
        bot_token.write_text(credential['token'])
    compose('up', '-d', '--pull', 'never', 'runner', 'demo')
    # Reutiliza a proteção contra interferência de outros daemons Docker no WSL.
    guard = ROOT.parent / 'source/scripts/linux/network-guard.py'
    if guard.exists():
        run('python3', str(guard), PROJECT)
    print('GitLab: ' + URL + ' | Aplicação: ' + DEMO_URL)


def doctor():
    for service in ('gitlab', 'runner', 'demo', 'entry'):
        container = compose('ps', '-q', service, capture=True).strip()
        if not container:
            raise RuntimeError(f'Serviço GitLab parado: {service}')
        state = json.loads(run('docker', 'inspect', container, capture=True))[0]['State']
        if state['Status'] != 'running' or state.get('Health', {}).get('Status', 'healthy') != 'healthy':
            raise RuntimeError(f'Serviço GitLab indisponível: {service}')
    for url in (URL + '/users/sign_in', DEMO_URL):
        with urllib.request.urlopen(url, timeout=10) as response:
            if response.status != 200:
                raise RuntimeError('HTTP local indisponível: ' + url)
    compose('exec', '-T', 'runner', 'gitlab-runner', 'verify')
    print('OK: GitLab, Runner e publicação local disponíveis.')


def project_actions(directory):
    directory = directory.resolve(strict=True)
    excluded = {'.git', '.secrets', '.venv', 'node_modules', '__pycache__', '.env', '.cache'}
    actions = []
    size = 0
    for file in sorted(directory.rglob('*')):
        relative = file.relative_to(directory)
        if excluded.intersection(relative.parts):
            continue
        if file.is_symlink():
            raise ValueError('Projeto não pode conter links simbólicos.')
        if not file.is_file():
            continue
        size += file.stat().st_size
        if size > 10 * 1024 * 1024 or len(actions) >= 100:
            raise ValueError('Limite da demo: 100 arquivos e 10 MiB por entrega.')
        content = file.read_bytes()
        actions.append({'action': 'create', 'file_path': relative.as_posix(),
                        'encoding': 'base64', 'content': base64.b64encode(content).decode()})
    if '.gitlab-ci.yml' not in {item['file_path'] for item in actions}:
        raise ValueError('Projeto precisa de .gitlab-ci.yml com tag offline-demo e sem downloads.')
    return actions


def workspace_directory(directory):
    base = ROOT.parent / 'workspaces'
    if base.resolve() != base:
        raise ValueError('O diretório de workspaces não pode redirecionar para outro local.')
    resolved = directory.resolve(strict=True)
    if resolved == base or not resolved.is_relative_to(base):
        raise ValueError('Use um workspace dentro do ambiente SDLC, fora do repositório de ferramentas.')
    return resolved


def publish(directory):
    actions = project_actions(directory)
    name = 'demo-' + time.strftime('%Y%m%d-%H%M%S') + '-' + secrets.token_hex(2)
    project = api('POST', 'projects', {'name': name, 'visibility': 'private',
        'initialize_with_readme': True, 'default_branch': 'main',
        'only_allow_merge_if_pipeline_succeeds': True})
    pid = project['id']
    issue = api('POST', f'projects/{pid}/issues', {'title': 'Publicar aplicação local',
        'description': 'Entregar página em português com testes, build e publicação manual off-line.'})
    branch = f'{issue["iid"]}-entrega-local'
    api('POST', f'projects/{pid}/repository/branches', {'branch': branch, 'ref': 'main'})
    # Atualiza o README inicial, caso o projeto forneça seu próprio README.
    for action in actions:
        if action['file_path'] == 'README.md':
            action['action'] = 'update'
    api('POST', f'projects/{pid}/repository/commits', {'branch': branch,
        'commit_message': f'Implementa demo local; refs #{issue["iid"]}', 'actions': actions})
    mr = api('POST', f'projects/{pid}/merge_requests', {'source_branch': branch,
        'target_branch': 'main', 'title': 'Entrega da aplicação local',
        'description': f'Closes #{issue["iid"]}\n\nRevisar o código e o pipeline antes de integrar.',
        'remove_source_branch': True})
    record = {'project_id': pid, 'project': name, 'issue': issue['iid'],
              'mr': mr['iid'], 'url': mr['web_url']}
    (ROOT / 'last-demo.json').write_text(json.dumps(record, indent=2))
    print(json.dumps(record, indent=2))
    print('Revise o MR no GitLab. verify acompanha os testes; merge integra após revisão humana.')


def verify_or_merge(command, selected):
    record = json.loads((ROOT / 'last-demo.json').read_text())
    if selected and selected != record['project']:
        raise ValueError('Project deve corresponder à última demo registrada.')
    pid, iid = record['project_id'], record['mr']
    mr = api('GET', f'projects/{pid}/merge_requests/{iid}')
    pipeline = mr.get('head_pipeline')
    if command == 'verify':
        print(json.dumps({'mr': mr['web_url'], 'state': mr['state'],
            'merge_status': mr.get('detailed_merge_status'),
            'pipeline': {key: pipeline.get(key) for key in ('id','status','sha','web_url')}
                        if pipeline else None}, indent=2))
        if not pipeline or pipeline['status'] != 'success' or pipeline.get('sha') != mr.get('sha'):
            raise RuntimeError('Pipeline do MR ainda não passou.')
        return
    if not selected:
        raise ValueError('Após revisar o MR, informe -Project com o nome exibido por demo.')
    if not pipeline or pipeline['status'] != 'success' or pipeline.get('sha') != mr['sha']:
        raise RuntimeError('Merge bloqueado: pipeline do MR não passou.')
    api('PUT', f'projects/{pid}/merge_requests/{iid}/merge',
        {'sha': mr['sha'], 'should_remove_source_branch': True})
    print('Merge concluído. No pipeline de main, execute o job manual deploy após o build.')


def acceptance():
    """Integra uma demo descartável para verificar infraestrutura; não simula aceite humano."""
    require_disposable_acceptance()
    publish(ROOT / 'template')
    record = json.loads((ROOT / 'last-demo.json').read_text())
    pid, iid = record['project_id'], record['mr']

    def wait(check, message):
        deadline = time.monotonic() + 300
        while time.monotonic() < deadline:
            value = check()
            if value:
                return value
            time.sleep(3)
        raise RuntimeError(message)

    def mr_passed():
        mr = api('GET', f'projects/{pid}/merge_requests/{iid}')
        pipeline = mr.get('head_pipeline') or {}
        if pipeline.get('status') in ('failed', 'canceled'):
            raise RuntimeError('Pipeline do MR falhou; consulte os jobs no GitLab.')
        return pipeline.get('status') == 'success'

    wait(mr_passed, 'Timeout no pipeline do MR.')
    verify_or_merge('merge', record['project'])

    def deploy_job():
        pipelines = api('GET', f'projects/{pid}/pipelines?ref=main')
        if not pipelines:
            return None
        jobs = api('GET', f'projects/{pid}/pipelines/{pipelines[0]["id"]}/jobs')
        if any(job['status'] == 'failed' for job in jobs):
            raise RuntimeError('Pipeline de main falhou.')
        return next((job for job in jobs if job['name'] == 'deploy' and job['status'] == 'manual'), None)

    job = wait(deploy_job, 'Timeout aguardando publicação manual.')
    api('POST', f'projects/{pid}/jobs/{job["id"]}/play', {})
    wait(lambda: api('GET', f'projects/{pid}/jobs/{job["id"]}')['status'] == 'success',
         'Timeout no deploy.')
    with urllib.request.urlopen(DEMO_URL, timeout=10) as response:
        if 'Entrega local pelo SDLC' not in response.read().decode():
            raise RuntimeError('Conteúdo publicado não corresponde à demo.')
    issue = api('GET', f'projects/{pid}/issues/{record["issue"]}')
    if issue['state'] != 'closed':
        raise RuntimeError('Merge não fechou a Issue.')
    network = json.loads(run('docker', 'network', 'inspect', PROJECT + '_core', capture=True))[0]
    if not network['Internal']:
        raise RuntimeError('Rede de execução deve ser interna.')
    compose('exec', '-T', 'runner', 'python3', '-c',
        "import socket,sys\ntry:\n socket.create_connection(('1.1.1.1',443),3)\n"
        "except OSError:\n print('OK: saída externa bloqueada')\nelse:\n sys.exit('Saída externa disponível')")
    record['checks'] = ['MR pipeline', 'merge', 'main pipeline', 'deploy', 'HTTP local',
                        'Issue closed', 'internal network', 'external egress blocked']
    record['review'] = 'Aceite técnico automatizado de demo descartável; sem aprovação humana simulada.'
    (ROOT / 'acceptance.json').write_text(json.dumps(record, indent=2))
    print('OK: ciclo completo e bloqueio de saída validados. Relatório: ' + str(ROOT / 'acceptance.json'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['prepare','up','down','restart','status','doctor','logs','access','publish','verify','merge','test'])
    parser.add_argument('--source', type=Path, default=Path(__file__).parent)
    parser.add_argument('--project', default='')
    parser.add_argument('--directory', type=Path)
    args = parser.parse_args()
    if args.command == 'test':
        require_disposable_acceptance()
    os.umask(0o077)
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / '.secrets/runner').mkdir(parents=True, exist_ok=True)
    with (ROOT / '.operation.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if args.command != 'prepare': verify_prepared()
        if args.command == 'prepare': prepare(args.source)
        elif args.command == 'up': up()
        elif args.command == 'down':
            compose('down')
            guard = ROOT.parent / 'source/scripts/linux/network-guard.py'
            if guard.exists(): run('python3', str(guard), PROJECT, 'remove')
        elif args.command == 'restart':
            compose('restart')
            up()
        elif args.command == 'doctor': doctor()
        elif args.command == 'status': compose('ps')
        elif args.command == 'logs': compose('logs', '--tail', '100')
        elif args.command == 'access':
            print((ROOT / '.secrets/root_password').read_text())
        elif args.command == 'test': acceptance()
        elif args.command == 'publish':
            if not args.directory:
                raise ValueError('Informe -Directory com o workspace Linux do ambiente SDLC.')
            publish(workspace_directory(args.directory))
        else: verify_or_merge(args.command, args.project)


if __name__ == '__main__':
    main()
