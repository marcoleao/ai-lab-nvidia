"""Accidental-target guard for synthetic acceptance, not an authentication boundary."""
import json
import os
from pathlib import Path
import re


def require_disposable_acceptance():
    root = os.environ.get('SDLC_ACCEPTANCE_ROOT', '')
    project = os.environ.get('SDLC_ACCEPTANCE_PROJECT', '')
    if not re.fullmatch(r'/tmp/sdlc-package-[a-f0-9-]{36}', root):
        raise RuntimeError('Synthetic acceptance requires an isolated disposable installation; use doctor for the human environment')
    if project != Path(root).name:
        raise RuntimeError('Acceptance project does not match disposable installation')
    marker = Path('/state/disposable-test.json')
    if marker.is_symlink() or not marker.is_file():
        raise RuntimeError('Disposable acceptance marker missing')
    if json.loads(marker.read_text()) != {'version': 1, 'root': root, 'project': project}:
        raise RuntimeError('Disposable acceptance marker does not match target')
