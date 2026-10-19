"""Fail closed when offline prerequisites are absent or changed."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location(
    'offline_manifest', Path(__file__).resolve().parents[1] / 'scripts/linux/offline-manifest.py')
manifest = importlib.util.module_from_spec(spec)
spec.loader.exec_module(manifest)


class OfflinePrerequisites(unittest.TestCase):
    def test_missing_preparation_fails_before_docker(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(manifest, 'ROOT', Path(directory)), \
                patch.object(sys, 'argv', ['manifest', 'verify']), patch.object(manifest, 'output') as command:
            with self.assertRaisesRegex(RuntimeError, 'prepare'):
                manifest.main()
            command.assert_not_called()

    def check_changed_asset(self, changed_file):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'config').write_text('changed' if changed_file else 'prepared')
            (root / '.offline-manifest.json').write_text(json.dumps({
                'files': {'config': hashlib.sha256(b'prepared').hexdigest()},
                'images': {'local:image': 'sha256:prepared'}, 'models': {}}))
            with patch.object(manifest, 'ROOT', root), patch.object(manifest, 'FILES', ('config',)), \
                    patch.object(sys, 'argv', ['manifest', 'verify']), \
                    patch.object(manifest, 'output', return_value='[{"Id":"sha256:changed"}]') as command:
                with self.assertRaisesRegex(RuntimeError, 'prepare'):
                    manifest.main()
                if changed_file:
                    command.assert_not_called()
                else:
                    command.assert_called_once_with('docker', 'image', 'inspect', 'local:image')

    def test_changed_configuration_fails_before_docker(self):
        self.check_changed_asset(True)

    def test_changed_image_fails_without_pull(self):
        self.check_changed_asset(False)


if __name__ == '__main__':
    unittest.main()
