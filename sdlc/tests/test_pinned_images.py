"""Pinned image preparation contracts using a fake Docker; no registry or daemon."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / 'scripts/linux/pinned-images.sh'
IMAGE = 'codeberg.org/forgejo/forgejo@sha256:' + 'a' * 64
OTHER_IMAGE = 'codeberg.org/forgejo/forgejo@sha256:' + 'b' * 64


class PinnedImages(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.state = self.root / 'state.json'
        self.calls = self.root / 'calls.jsonl'
        self.marker = self.root / 'prepared'
        self.write_state(images=[], failPull=False, omitPulledImage=False)
        docker = self.root / 'docker'
        docker.write_text('#!' + sys.executable + '\n' + '''\
import json, os, sys
from pathlib import Path
state_path = Path(os.environ['PINNED_TEST_STATE'])
state = json.loads(state_path.read_text())
args = sys.argv[1:]
with Path(os.environ['PINNED_TEST_CALLS']).open('a') as stream:
    stream.write(json.dumps(args) + '\\n')
if args[:2] == ['image', 'inspect'] and len(args) == 3:
    raise SystemExit(0 if args[2] in state['images'] else 1)
if args[:1] == ['pull'] and len(args) == 2:
    if state['failPull']:
        print('Registry unavailable in isolated test', file=sys.stderr)
        raise SystemExit(1)
    if not state['omitPulledImage'] and args[1] not in state['images']:
        state['images'].append(args[1])
        state_path.write_text(json.dumps(state))
    raise SystemExit(0)
raise SystemExit('Unexpected Docker command in isolated test')
''')
        docker.chmod(0o700)

    def tearDown(self):
        self.temporary.cleanup()

    def write_state(self, **state):
        self.state.write_text(json.dumps(state))

    def run_image(self, image=IMAGE):
        return subprocess.run([
            'bash', '-c',
            'set -Eeuo pipefail; source "$1"; ensure_pinned_image "$2"; printf ready >"$3"',
            'pinned-image-test', str(HELPER), image, str(self.marker),
        ], env={**os.environ, 'PATH': str(self.root) + os.pathsep + os.environ['PATH'],
                'PINNED_TEST_STATE': str(self.state), 'PINNED_TEST_CALLS': str(self.calls)},
            capture_output=True, text=True)

    def docker_calls(self):
        return [json.loads(line) for line in self.calls.read_text().splitlines()] if self.calls.exists() else []

    def test_exact_cached_digest_does_not_contact_unavailable_registry(self):
        self.write_state(images=[IMAGE], failPull=True, omitPulledImage=False)
        result = self.run_image()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.docker_calls(), [['image', 'inspect', IMAGE]])
        self.assertEqual(self.marker.read_text(), 'ready')

    def test_missing_image_is_pulled_confirmed_and_reused_on_replay(self):
        result = self.run_image()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.docker_calls(), [
            ['image', 'inspect', IMAGE], ['pull', IMAGE], ['image', 'inspect', IMAGE],
        ])
        self.assertEqual(self.run_image().returncode, 0)
        self.assertEqual(self.docker_calls().count(['pull', IMAGE]), 1)

    def test_another_digest_of_the_same_repository_does_not_satisfy_request(self):
        self.write_state(images=[OTHER_IMAGE], failPull=False, omitPulledImage=False)
        self.assertEqual(self.run_image().returncode, 0)
        self.assertIn(['pull', IMAGE], self.docker_calls())
        self.assertEqual(json.loads(self.state.read_text())['images'], [OTHER_IMAGE, IMAGE])

    def test_failed_pull_stops_preparation_and_retains_existing_images(self):
        self.write_state(images=[OTHER_IMAGE], failPull=True, omitPulledImage=False)
        self.assertNotEqual(self.run_image().returncode, 0)
        self.assertFalse(self.marker.exists())
        self.assertEqual(json.loads(self.state.read_text())['images'], [OTHER_IMAGE])
        self.assertEqual(self.docker_calls(), [['image', 'inspect', IMAGE], ['pull', IMAGE]])

    def test_retry_after_failed_pull_can_complete_without_removing_cached_images(self):
        self.write_state(images=[OTHER_IMAGE], failPull=True, omitPulledImage=False)
        self.assertNotEqual(self.run_image().returncode, 0)
        self.write_state(images=[OTHER_IMAGE], failPull=False, omitPulledImage=False)
        result = self.run_image()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(self.state.read_text())['images'], [OTHER_IMAGE, IMAGE])
        self.assertEqual(self.marker.read_text(), 'ready')

    def test_successful_pull_without_exact_local_reference_cannot_confirm_preparation(self):
        self.write_state(images=[], failPull=False, omitPulledImage=True)
        self.assertNotEqual(self.run_image().returncode, 0)
        self.assertFalse(self.marker.exists())

    def test_unpinned_or_malformed_references_are_refused_before_docker(self):
        for image in ['forgejo:latest', 'forgejo@sha256:abc', '--help@sha256:' + 'a' * 64]:
            with self.subTest(image=image):
                self.assertNotEqual(self.run_image(image).returncode, 0)
                self.assertFalse(self.marker.exists())
        self.assertEqual(self.docker_calls(), [])

    def test_runtime_and_helper_have_valid_bash_syntax(self):
        for path in [ROOT / 'scripts/linux/runtime.sh', HELPER]:
            with self.subTest(path=path.name):
                result = subprocess.run(['bash', '-n', str(path)], capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == '__main__':
    unittest.main()
