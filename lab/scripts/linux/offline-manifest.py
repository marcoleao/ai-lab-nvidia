"""Inventory prepared images/models; verification never downloads or builds."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from profile_assets import profiles,runtime_values,selected_models,image_plan,atomic_bytes

ROOT = Path('/opt/ai-local-lab')
FILES = ('compose.yaml', 'config/versions.env', 'config/models.yaml', 'python/uv.lock',
         'python/pyproject.toml', 'docker/dev/Dockerfile', 'qwen-code/Dockerfile',
         'qwen-code/package.json', 'qwen-code/package-lock.json', 'qwen-code/runner.mjs', 'qwen-code/workspace.mjs', 'qwen-code/ui-probes.mjs', 'qwen-code/patch.mjs',
         'scripts/linux/agent-tools.py', 'scripts/linux/network-migration.py',
         'scripts/linux/offline-network.py', 'scripts/linux/inference_cache_policy.py', 'scripts/linux/bootstrap.sh', 'scripts/linux/sync.sh', 'config/lab.yaml', 'lib/audit_admin.py', 'lib/wsl_clock.py', '.override.yaml',
         'config/sdlc-profile.json','scripts/linux/profile_assets.py','scripts/linux/offline-manifest.py','scripts/linux/common.sh','scripts/linux/lab.sh','scripts/linux/pull-models.sh','scripts/linux/doctor.sh','tests/smoke-test.sh','tests/test_ollama.py','.runtime.env','.models','.profile-selection.json')
SDLC_FILES=('compose.yaml','config/versions.env','config/models.yaml','config/sdlc-profile.json','config/lab.yaml',
            'scripts/linux/profile_assets.py','scripts/linux/common.sh','scripts/linux/lab.sh','scripts/linux/pull-models.sh',
            'scripts/linux/offline-manifest.py','scripts/linux/offline-network.py','scripts/linux/network-migration.py','scripts/linux/bootstrap.sh',
            'scripts/linux/sync.sh','scripts/linux/doctor.sh','tests/smoke-test.sh','tests/test_ollama.py','lib/audit_admin.py','lib/wsl_clock.py',
            '.override.yaml','.runtime.env','.models','.profile-selection.json')
SCHEMA_VERSION=3

def runtime_profiles():return profiles(runtime_values(ROOT/'.runtime.env')['LAB_PROFILES'])
def required_files(active):return SDLC_FILES if active==['sdlc'] else FILES


def output(*args):
    return subprocess.check_output(args, text=True).strip()


def inventory():
    active=runtime_profiles()
    selected=selected_models(ROOT,active)
    if (ROOT/'.models').read_text().splitlines()!=selected:
        raise RuntimeError('Active model selection differs from the declared profile; synchronize before prepare')
    refs=image_plan(ROOT,active)
    images = {ref: json.loads(output('docker', 'image', 'inspect', ref))[0]['Id'] for ref in refs}
    container = output('docker', 'ps', '-q', '--filter', 'label=com.docker.compose.project=ai-local-lab',
                       '--filter', 'label=com.docker.compose.service=ollama')
    if not container or '\n' in container:
        raise RuntimeError('Inicie o Ollama preparado antes de verificar os modelos.')
    models = {}
    for model in selected:
        name, separator, tag = model.rpartition(':')
        if not separator:
            name, tag = model, 'latest'
        if '/' not in name:
            name = 'library/' + name
        # Ollama's generated Modelfile can reorder parameters between processes.
        # Its stored manifest contains stable content-addressed model layers.
        raw = output('docker','exec',container,'cat',
                     '/root/.ollama/models/manifests/registry.ollama.ai/' + name + '/' + tag)
        models[model] = hashlib.sha256(json.dumps(json.loads(raw), sort_keys=True).encode()).hexdigest()
    files = {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in required_files(active)}
    if runtime_profiles()!=active or selected_models(ROOT,active)!=selected:raise RuntimeError('Profile changed during inventory; repeat prepare')
    return {'version':SCHEMA_VERSION,'profiles':active,'images': images, 'models': models, 'files': files}


def main():
    path = ROOT / '.offline-manifest.json'
    if sys.argv[1] == 'prepare':
        atomic_bytes(path,(json.dumps(inventory(), indent=2)+'\n').encode())
        print('OK: imagens, modelos e fontes registrados para operação off-line.')
    else:
        if not path.exists():
            raise RuntimeError('Execute bootstrap prepare com internet antes da operação off-line.')
        expected = json.loads(path.read_text())
        active=runtime_profiles()
        if expected.get('version')!=SCHEMA_VERSION or expected.get('profiles')!=active or set(expected['files']) != set(required_files(active)):
            raise RuntimeError('Manifesto antigo ou de outro perfil; execute bootstrap prepare para o perfil selecionado.')
        # Models are checked by doctor after services start; do not require a running Ollama in up.
        for name, digest in expected['files'].items():
            if hashlib.sha256((ROOT / name).read_bytes()).hexdigest() != digest:
                raise RuntimeError('Configuração mudou; execute prepare: ' + name)
        if set(expected['images'])!=set(image_plan(ROOT,active)) or set(expected['models'])!=set(selected_models(ROOT,active)):
            raise RuntimeError('Ativos de outro perfil; execute prepare para o perfil selecionado.')
        for ref, digest in expected['images'].items():
            if json.loads(output('docker', 'image', 'inspect', ref))[0]['Id'] != digest:
                raise RuntimeError('Imagem local mudou; execute prepare: ' + ref)
        if sys.argv[1] == 'models' and inventory()['models'] != expected['models']:
            raise RuntimeError('Modelo local ausente ou alterado; execute prepare.')
        if sys.argv[1] == 'caches' and active!=['sdlc']:
            ref = next(ref for ref in expected['images'] if ref.startswith('ghcr.io/open-webui/open-webui'))
            output('docker','run','--rm','--pull','never','--network','none',
                   '-v','ai-local-lab_open_webui_data:/app/backend/data',
                   '-e','HF_HUB_OFFLINE=1','-e','TIKTOKEN_CACHE_DIR=/app/backend/data/cache/tiktoken',ref,'python','-c',
                   "from huggingface_hub import snapshot_download; snapshot_download('sentence-transformers/all-MiniLM-L6-v2',cache_dir='/app/backend/data/cache/embedding/models',local_files_only=True); import tiktoken; tiktoken.get_encoding('cl100k_base')")
        print('OK: artefatos locais preparados, sem downloads.')


if __name__ == '__main__':
    main()
