"""Connect only the portal API to the already installed local GitLab.

No GitLab resources, business items, jobs, models or pipelines are created here.
The generated Compose override contains paths and addresses, never the token.
"""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = Path('/opt/agentic-sdlc/gitlab-demo')
SECRET_DIR = Path('/opt/agentic-sdlc/portal/secrets')


def atomic_file(path, content, mode):
    descriptor, temporary = tempfile.mkstemp(dir=path.parent)
    try:
        os.fchmod(descriptor, mode)
        with os.fdopen(descriptor, 'w') as stream:
            stream.write(content)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main():
    if os.geteuid() != 0:
        raise RuntimeError('Execute dentro da distro SDLC como root.')
    for directory in (ROOT / '.prepared', SECRET_DIR):
        if directory.is_symlink():
            raise RuntimeError('Diretório de configuração não pode ser link simbólico.')
        directory.mkdir(parents=True, exist_ok=True)
    SECRET_DIR.chmod(0o700)
    source = RUNTIME / '.secrets/bot_token'
    if source.is_symlink():
        raise RuntimeError('Credencial de origem não pode ser link simbólico.')
    token = source.read_text().strip()
    if not token or '\n' in token or '\r' in token:
        raise RuntimeError('Credencial local inválida.')
    request = urllib.request.Request('http://127.0.0.1:3180/api/v4/user', headers={'PRIVATE-TOKEN': token})
    with urllib.request.urlopen(request, timeout=8) as response:
        user = json.load(response)
    if user.get('username') != 'sdlc-demo-bot' or user.get('is_admin'):
        raise RuntimeError('Esperada a conta de integração local sem privilégios administrativos.')
    container = json.loads(subprocess.check_output(['docker', 'inspect', 'sdlc-demo-gitlab-1'], text=True))[0]
    if 'sdlc-demo_core' not in container['NetworkSettings']['Networks']:
        raise RuntimeError('Rede existente do GitLab não corresponde à instalação esperada.')
    config = {
        'services': {'api': {
            'environment': {'GITLAB_BASE_URL': 'http://gitlab:3180', 'GITLAB_TOKEN': '',
                            'GITLAB_TOKEN_FILE': '/run/secrets/portal_gitlab_token', 'GITLAB_ROOT_GROUP': 'sdlc'},
            'secrets': ['portal_gitlab_token'], 'networks': ['data', 'front', 'gitlab_existing']}},
        'secrets': {'portal_gitlab_token': {'file': str(SECRET_DIR / 'gitlab_token')}},
        'networks': {'gitlab_existing': {'external': True, 'name': 'sdlc-demo_core'}}}
    destination = ROOT / '.prepared/compose.integrations.json'
    if destination.exists() and json.loads(destination.read_text()) != config:
        raise RuntimeError('Já existe configuração diferente de integrações; preserve-a e revise antes de conectar.')
    atomic_file(SECRET_DIR / 'gitlab_token', token + '\n', 0o444)
    atomic_file(destination, json.dumps(config, indent=2) + '\n', 0o600)
    print('GitLab conectado na configuração. Aplique bootstrap.ps1 up; retome os jobs pela interface.')


if __name__ == '__main__':
    try:
        main()
    except Exception:
        raise SystemExit('Não foi possível configurar o GitLab. Verifique conta, arquivo de credencial, rede e configuração existentes; nenhum valor secreto é exibido.')
