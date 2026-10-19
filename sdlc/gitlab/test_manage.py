"""Contratos do ciclo: um pipeline malsucedido ou SHA antigo não autoriza merge."""
import importlib.util
import json
import hashlib
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location('manage', Path(__file__).with_name('manage.py'))
manage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(manage)


class MergeTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        root = Path(self.directory.name)
        (root / 'last-demo.json').write_text(json.dumps({'project_id': 7, 'mr': 2, 'project': 'demo-a'}))
        self.root = patch.object(manage, 'ROOT', root)
        self.root.start()
        self.addCleanup(self.root.stop)

    def test_failed_pipeline_cannot_merge(self):
        with patch.object(manage, 'api', return_value={'head_pipeline': {'status': 'failed'}}) as api:
            with self.assertRaisesRegex(RuntimeError, 'pipeline'):
                manage.verify_or_merge('merge', 'demo-a')
            self.assertEqual(api.call_count, 1)

    def test_explicit_project_required(self):
        with patch.object(manage, 'api', return_value={'head_pipeline': {'status': 'success'}}) as api:
            with self.assertRaisesRegex(ValueError, 'revisar'):
                manage.verify_or_merge('merge', '')
            self.assertEqual(api.call_count, 1)

    def test_merge_is_bound_to_reviewed_sha(self):
        with patch.object(manage, 'api', side_effect=[{
                'sha': 'abc123', 'head_pipeline': {'status': 'success', 'sha': 'abc123'}}, {}]) as api:
            manage.verify_or_merge('merge', 'demo-a')
            api.assert_called_with('PUT', 'projects/7/merge_requests/2/merge',
                {'sha': 'abc123', 'should_remove_source_branch': True})

    def test_wrong_project_cannot_merge(self):
        with patch.object(manage, 'api') as api:
            with self.assertRaises(ValueError):
                manage.verify_or_merge('merge', 'demo-other')
            api.assert_not_called()

    def test_pipeline_from_previous_commit_cannot_merge(self):
        with patch.object(manage, 'api', return_value={
                'sha': 'new', 'head_pipeline': {'status': 'success', 'sha': 'old'}}) as api:
            with self.assertRaises(RuntimeError):
                manage.verify_or_merge('merge', 'demo-a')
            self.assertEqual(api.call_count, 1)

    def test_publish_excludes_git_and_secrets_and_preserves_nested_paths(self):
        root = Path(self.directory.name)
        (root / '.gitlab-ci.yml').write_text('stages: [test]')
        (root / '.env').write_text('SECRET=private')
        (root / '.git').mkdir()
        (root / '.git/config').write_text('remote github')
        (root / 'src').mkdir()
        (root / 'src/app.py').write_text('print(123)')
        paths = {action['file_path'] for action in manage.project_actions(root)}
        self.assertIn('src/app.py', paths)
        self.assertNotIn('.env', paths)
        self.assertNotIn('.git/config', paths)

    def test_tampered_prepared_package_is_rejected_before_docker(self):
        root = Path(self.directory.name)
        (root / 'images.env').write_text('tampered')
        (root / 'prepared.json').write_text(json.dumps({'images.env': hashlib.sha256(b'original').hexdigest()}))
        with patch.object(manage, 'run') as docker:
            with self.assertRaisesRegex(RuntimeError, 'alterado'):
                manage.verify_prepared()
            docker.assert_not_called()

    def test_publish_accepts_only_runtime_workspaces(self):
        root = Path(self.directory.name)
        workspace = root / 'runtime/workspaces/demo'
        workspace.mkdir(parents=True)
        repository = root / 'repository'
        repository.mkdir()
        with patch.object(manage, 'ROOT', root / 'runtime/gitlab-demo'):
            self.assertEqual(manage.workspace_directory(workspace), workspace)
            with self.assertRaises(ValueError):
                manage.workspace_directory(repository)

    def test_first_prepare_builds_complete_offline_package_and_allocates_networks(self):
        base = Path(self.directory.name)
        root = base / 'runtime/gitlab-demo'
        (root / '.secrets/runner').mkdir(parents=True)
        (root.parent / '.owner').write_text('a' * 32)
        source = base / 'source'
        (source / 'template').mkdir(parents=True)
        for name in ('compose.yaml','Runner.Dockerfile','nginx.conf'):
            (source / name).write_text('fixture')
        (source / 'template/.gitlab-ci.yml').write_text('http://127.0.0.1:3181')
        (source / 'images.json').write_text(json.dumps({key: key.lower() for key in ('GITLAB_IMAGE','RUNNER_BASE','ENTRY_IMAGE')}))
        allocator = SimpleNamespace(allocate=lambda root, project: {'core':'10.240.2.0/24','front':'10.240.3.0/24'})
        def docker(*args, **kwargs):
            if args[:3] == ('docker','image','inspect'):
                return json.dumps([{'Id':'sha256:' + 'a'*64, 'RepoDigests':[args[3]]}])
        with patch.object(manage,'ROOT',root), patch.object(manage,'run',side_effect=docker), \
                patch.object(manage,'compose'), patch.dict('sys.modules',{'network_allocation':allocator}):
            manage.prepare(source)
            self.assertIn('GITLAB_CORE_SUBNET=10.240.2.0/24', (root / 'images.env').read_text())
            manage.verify_prepared()


if __name__ == '__main__':
    unittest.main()
