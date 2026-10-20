"""First prepare reserves disjoint stacks before Docker creates any network."""
import importlib.util
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


allocation = load('allocation_tests', SOURCE / 'services/control/network_allocation.py')
repair = load('repair_tests', SOURCE / 'scripts/linux/repair-networks.py')


class NetworkAllocation(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'state').mkdir()
        (self.root / 'gitlab-demo/state').mkdir(parents=True)
        self.networks = []
        mock = patch.object(allocation.subprocess, 'check_output', side_effect=self.output)
        mock.start()
        self.addCleanup(mock.stop)

    def output(self, args, **kwargs):
        if args[:3] == ['docker','network','ls']:
            return ' '.join(n['Name'] for n in self.networks)
        if args[:3] == ['docker','network','inspect']:
            return json.dumps(self.networks)
        if args[:2] == ['ip','-j']:
            return '[]'
        raise AssertionError(args)

    def test_two_stacks_prepare_before_any_network_exists(self):
        core = allocation.allocate(self.root, 'agentic-sdlc')
        gitlab = allocation.allocate(self.root / 'gitlab-demo', 'sdlc-demo')
        self.assertTrue(set(core.values()).isdisjoint(gitlab.values()))
        self.assertEqual(gitlab, allocation.allocate(self.root / 'gitlab-demo', 'sdlc-demo'))

    def test_reverse_preparation_order_also_reserves_both_pairs(self):
        gitlab = allocation.allocate(self.root / 'gitlab-demo', 'sdlc-demo')
        core = allocation.allocate(self.root, 'agentic-sdlc')
        self.assertTrue(set(core.values()).isdisjoint(gitlab.values()))

    def test_old_duplicate_reservation_is_rejected(self):
        core = allocation.allocate(self.root, 'agentic-sdlc')
        marker = self.root / 'gitlab-demo/state/network-allocation.json'
        marker.write_text(json.dumps(core))
        with self.assertRaises(allocation.AllocationConflict):
            allocation.allocate(self.root / 'gitlab-demo', 'sdlc-demo')

    def test_existing_foreign_network_cannot_claim_recorded_subnet(self):
        allocation.allocate(self.root, 'agentic-sdlc')
        self.networks = [{'Name':'foreign','Labels':{},'IPAM':{'Config':[{'Subnet':'10.240.0.0/24'}]}}]
        with self.assertRaises(allocation.AllocationConflict):
            allocation.allocate(self.root, 'agentic-sdlc')

    def fixture(self):
        pair = allocation.allocate(self.root, 'agentic-sdlc')
        root = self.root
        (root / '.owner').write_text('a'*32)
        (root / 'offline').mkdir()
        (root / 'forgejo').mkdir()
        for name in ('runtime.env','compose.yaml','forgejo/app.ini'):
            (root / name).write_text('prepared')
        manifest = {'package_sha256':'fingerprint'}
        for name,key in [('runtime.env','runtime_env_sha256'),('compose.yaml','compose_sha256'),('forgejo/app.ini','forgejo_config_sha256')]:
            manifest[key] = repair.digest(root / name)
        (root / 'offline/manifest.json').write_text(json.dumps(manifest))
        gitlab = root / 'gitlab-demo'
        (gitlab / 'state/network-allocation.json').write_text(json.dumps(pair))
        (gitlab / 'images.env').write_text('GITLAB_CORE_SUBNET='+pair['core']+'\nGITLAB_FRONT_SUBNET='+pair['front']+'\nGITLAB_IMAGE=local@sha256:abc\n')
        (gitlab / 'compose.yaml').write_text('prepared gitlab compose')
        (gitlab / 'prepared.json').write_text(json.dumps({name:repair.digest(gitlab/name) for name in ('images.env','compose.yaml')}))
        real_load = repair.load
        def loader(name,path):
            return SimpleNamespace(fingerprint=lambda root:'fingerprint') if name == 'installed_fingerprint' else real_load(name,path)
        mock = patch.object(repair, 'load', side_effect=loader)
        mock.start()
        self.addCleanup(mock.stop)
        return gitlab

    def test_repair_preserves_images_and_volumes_and_is_idempotent(self):
        gitlab = self.fixture()
        with patch.object(repair.subprocess,'run') as docker:
            self.assertTrue(repair.repair(self.root))
            self.assertFalse(repair.repair(self.root))
        self.assertEqual([call.args[0][-1] for call in docker.call_args_list[:1]], ['down'])
        self.assertEqual(len(docker.call_args_list), 2)
        self.assertNotIn('-v', docker.call_args_list[0].args[0])
        self.assertIn('GITLAB_IMAGE=local@sha256:abc', (gitlab / 'images.env').read_text())
        self.assertIn('GITLAB_CORE_SUBNET=10.240.2.0/24', (gitlab / 'images.env').read_text())
        hashes = json.loads((gitlab / 'prepared.json').read_text())
        self.assertEqual(hashes['images.env'],repair.digest(gitlab / 'images.env'))

    def test_failed_compose_validation_restores_all_prepared_records(self):
        gitlab = self.fixture()
        paths=[gitlab/name for name in ('images.env','prepared.json','state/network-allocation.json')]
        before=[path.read_bytes() for path in paths]
        with patch.object(repair.subprocess,'run',side_effect=[None,RuntimeError('config failed')]):
            with self.assertRaisesRegex(RuntimeError,'config failed'):
                repair.repair(self.root)
        self.assertEqual(before,[path.read_bytes() for path in paths])

    def test_tampered_package_is_not_resigned_or_stopped(self):
        gitlab=self.fixture()
        (gitlab / 'images.env').write_text('tampered')
        with patch.object(repair.subprocess,'run') as docker:
            with self.assertRaisesRegex(ValueError,'GitLab package changed'):
                repair.repair(self.root)
            docker.assert_not_called()


if __name__ == '__main__':
    unittest.main()
