"""Install the SDLC-only local relay without changing the laboratory stack."""
import argparse
import ipaddress
import json
import os
from pathlib import Path
import secrets
import re
import shutil
import subprocess
import urllib.parse
import urllib.request
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from audit_admin import administrative_operation

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = Path('/opt/agentic-sdlc/portal/llm-relay')


def configure():
    parser = argparse.ArgumentParser()
    parser.add_argument('--upstream')
    parser.add_argument('--model', default='qwen3.5:9b')
    args = parser.parse_args()
    if args.upstream is None:
        declared=(ROOT.parents[1]/'lab/config/lab.yaml').read_text()
        address=re.search(r'^ollama_address:\s*([0-9.]+)\s*$',declared,re.MULTILINE)
        if not address:raise RuntimeError('Declare ollama_address or pass an explicit private --upstream')
        args.upstream='http://'+address[1]+':11434'
    if os.geteuid() != 0:
        raise RuntimeError('Run as root inside the SDLC distro')
    url = urllib.parse.urlparse(args.upstream)
    if url.scheme != 'http' or url.username or url.password or url.path not in ['', '/'] or url.query or url.fragment or url.port != 11434 or not ipaddress.ip_address(url.hostname).is_private:
        raise RuntimeError('Expected the private laboratory Ollama address on port 11434')
    upstream = args.upstream.rstrip('/')
    with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(upstream + '/v1/models', timeout=5) as response:
        catalog = json.load(response)
    if args.model not in [model['id'] for model in catalog['data']]:
        raise RuntimeError('Selected model is not installed; no downloads will be performed')
    network = json.loads(subprocess.check_output(['docker', 'network', 'inspect', 'sdlc-portal-foundation_front'], text=True))[0]['IPAM']['Config'][0]
    if RUNTIME.is_symlink() or (ROOT / '.prepared').is_symlink():
        raise RuntimeError('Configuration directories cannot be symbolic links')
    RUNTIME.mkdir(parents=True, exist_ok=True)
    RUNTIME.chmod(0o700)
    token = RUNTIME / 'token'
    if not token.exists():
        token.write_text(secrets.token_urlsafe(48) + '\n')
    token.chmod(0o444)
    config = {'upstream': upstream, 'model': args.model, 'bind': network['Gateway'], 'sourceSubnet': network['Subnet'], 'tokenFile': str(token)}
    (RUNTIME / 'config.json').write_text(json.dumps(config, indent=2))
    shutil.copyfile(ROOT / 'scripts/llm-relay.py', RUNTIME / 'relay.py')
    unit = '''[Unit]
Description=SDLC authenticated local inference relay
After=docker.service
Requires=docker.service
[Service]
ExecStart=/usr/bin/python3 /opt/agentic-sdlc/portal/llm-relay/relay.py
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
CapabilityBoundingSet=
RestrictAddressFamilies=AF_INET AF_UNIX
UMask=0077
[Install]
WantedBy=multi-user.target
'''
    Path('/etc/systemd/system/sdlc-llm-relay.service').write_text(unit)
    subprocess.run(['systemctl', 'daemon-reload'], check=True)
    subprocess.run(['systemctl', 'enable', 'sdlc-llm-relay.service'], check=True)
    subprocess.run(['systemctl', 'restart', 'sdlc-llm-relay.service'], check=True)
    override = {'services': {'api': {'environment': {'LLM_BASE_URL': 'http://' + network['Gateway'] + ':11435', 'LLM_MODEL': args.model, 'LLM_TOKEN_FILE': '/run/secrets/portal_llm_token'}, 'secrets': ['portal_llm_token']}}, 'secrets': {'portal_llm_token': {'file': str(token)}}}
    (ROOT / '.prepared').mkdir(exist_ok=True)
    (ROOT / '.prepared/compose.llm.json').write_text(json.dumps(override, indent=2) + '\n')
    print('Relay installed on the portal bridge only. Apply portal bootstrap up. No inference or download executed.')
    return args.model


def main():
    with administrative_operation('INTEGRATION_LLM_CONFIGURED', source='portal/connect-llm', details={'integration': 'local-llm'}) as operation:
        model = configure()
        operation.result(model=model)


if __name__ == '__main__':
    main()
