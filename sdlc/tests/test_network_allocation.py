"""Regression checks using Docker's null IPAM entries and occupied WSL routes."""
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'services/control'))
from network_allocation import allocate


class AllocationTests(unittest.TestCase):
    def test_null_defaults_occupied_route_and_stable_reuse(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'state').mkdir()
            def output(args, **kwargs):
                if args[:3] == ['docker', 'network', 'ls']:
                    return 'id'
                if args[:3] == ['docker', 'network', 'inspect']:
                    return json.dumps([{'Name': 'none', 'Labels': None, 'IPAM': {'Config': None}}])
                return json.dumps([{'dst': 'default'}, {'dst': '10.240.0.0/24'}])
            with patch('network_allocation.subprocess.check_output', side_effect=output):
                first = allocate(root, 'test-sdlc')
                self.assertEqual(first, {'core': '10.240.2.0/24', 'front': '10.240.3.0/24'})
                self.assertEqual(allocate(root, 'test-sdlc'), first)
                (root / 'state/network-allocation.json').write_text(json.dumps({'core': first['core'], 'front': first['core']}))
                with self.assertRaises(ValueError):
                    allocate(root, 'test-sdlc')


if __name__ == '__main__':
    unittest.main()
