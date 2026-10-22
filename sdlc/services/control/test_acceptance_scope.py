import json
from unittest.mock import patch

import pytest

from acceptance_scope import require_disposable_acceptance


def test_permanent_acceptance_refused_before_reading_credentials(monkeypatch):
    monkeypatch.setenv('SDLC_ACCEPTANCE_ROOT', '/opt/agentic-sdlc')
    monkeypatch.setenv('SDLC_ACCEPTANCE_PROJECT', 'agentic-sdlc')
    with patch('acceptance_scope.Path') as path:
        with pytest.raises(RuntimeError, match='disposable'):
            require_disposable_acceptance()
        path.assert_not_called()


def test_only_matching_disposable_marker_is_accepted(monkeypatch):
    root = '/tmp/sdlc-package-12345678-1234-1234-1234-123456789abc'
    project = root.rsplit('/', 1)[1]
    monkeypatch.setenv('SDLC_ACCEPTANCE_ROOT', root)
    monkeypatch.setenv('SDLC_ACCEPTANCE_PROJECT', project)
    with patch('acceptance_scope.Path') as path:
        path.return_value.name = project
        marker = path.return_value
        marker.is_symlink.return_value = False
        marker.is_file.return_value = True
        marker.read_text.return_value = json.dumps({'version': 1, 'root': root, 'project': project})
        require_disposable_acceptance()
        marker.read_text.return_value = json.dumps({'version': 1, 'root': root, 'project': 'agentic-sdlc'})
        with pytest.raises(RuntimeError, match='marker does not match'):
            require_disposable_acceptance()
        marker.is_symlink.return_value = True
        with pytest.raises(RuntimeError, match='marker missing'):
            require_disposable_acceptance()
