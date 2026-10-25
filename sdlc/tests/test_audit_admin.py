"""Administrative audit contracts, exclusively in temporary directories."""
import concurrent.futures
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
import shutil
import subprocess
from uuid import uuid4
from unittest.mock import patch, MagicMock

SPEC = importlib.util.spec_from_file_location('audit_admin', Path(__file__).parents[1] / 'scripts/audit_admin.py')
audit = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(audit)


class AdministrativeAuditTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='sdlc-audit-unit-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()

    def rows(self):
        return [json.loads(line) for line in (self.root / 'audit/admin.jsonl').read_text().splitlines()]

    def test_success_and_failure_have_real_process_identity_without_claiming_human_authentication(self):
        with audit.administrative_operation('BACKUP_CREATED', source='unit', root=self.root):
            pass
        with self.assertRaisesRegex(RuntimeError, 'private'):
            with audit.administrative_operation('GITLAB_API_MUTATION', source='unit', root=self.root):
                raise RuntimeError('private credential must not enter audit')
        rows = self.rows()
        self.assertEqual([r['outcome'] for r in rows], ['ACCEPTED', 'SUCCEEDED', 'ACCEPTED', 'UNKNOWN'])
        self.assertEqual(rows[0]['operator']['effectiveUid'], os.geteuid())
        self.assertEqual(rows[0]['operator']['humanIdentity'], 'not_verified')
        self.assertNotIn('private credential', str(rows))
        self.assertEqual(audit.validate(self.root)['records'], 4)
        self.assertEqual((self.root / 'audit/admin.jsonl').stat().st_mode & 0o777, 0o600)

    def test_metadata_rejects_secrets_bodies_queries_and_control_characters(self):
        for details in [{'token': 'opaque-value'}, {'body': '{}'}, {'path': 'users?token=opaque'},
                        {'scope': 'Bearer opaque-value'}, {'model': 'abc\nother-record'}]:
            with self.subTest(details=details), self.assertRaises(ValueError):
                with audit.administrative_operation('CONFIG_CHANGED', source='unit', root=self.root, details=details):
                    self.fail('Unsafe metadata must fail before the operation')

    def test_tampering_and_incomplete_records_prevent_further_writes(self):
        with audit.administrative_operation('BACKUP_CREATED', source='unit', root=self.root):
            pass
        path = self.root / 'audit/admin.jsonl'
        original = path.read_text()
        rows = self.rows()
        rows[0]['source'] = 'changed'
        path.write_text('\n'.join(audit.canonical(row) for row in rows) + '\n')
        with self.assertRaisesRegex(ValueError, 'digest'):
            audit.validate(self.root)
        path.write_text(original + '{')
        with self.assertRaisesRegex(ValueError, 'Incomplete'):
            audit.validate(self.root)

    def test_pending_request_is_required_and_terminal_event_cannot_be_duplicated(self):
        identifier = str(uuid4())
        with self.assertRaisesRegex(ValueError, 'pending'):
            audit.append('BACKUP_CREATED', 'COMPLETED', 'SUCCEEDED', identifier, source='unit', root=self.root)
        audit.append('BACKUP_CREATED', 'REQUESTED', 'ACCEPTED', identifier, source='unit', root=self.root)
        self.assertEqual(audit.validate(self.root)['pendingOperations'][0]['operationId'], identifier)
        audit.append('BACKUP_CREATED', 'COMPLETED', 'SUCCEEDED', identifier, source='unit', root=self.root)
        with self.assertRaisesRegex(ValueError, 'pending'):
            audit.append('BACKUP_CREATED', 'COMPLETED', 'SUCCEEDED', identifier, source='unit', root=self.root)
        self.assertEqual(audit.validate(self.root)['records'], 2)
        self.assertEqual(audit.validate(self.root)['pendingOperations'], [])

    def test_reset_epoch_changes_without_erasing_previous_administrative_records(self):
        with audit.administrative_operation('BACKUP_CREATED', source='unit', root=self.root):
            pass
        previous = audit.validate(self.root)['epochId']
        with audit.administrative_operation('ACCEPTANCE_DATA_RESET', source='unit', root=self.root) as operation:
            current = audit.rotate_epoch(operation.id, source='unit', root=self.root)
        self.assertNotEqual(previous, current)
        self.assertEqual(audit.validate(self.root)['epochId'], current)
        self.assertEqual(audit.validate(self.root)['records'], 5)
        self.assertEqual(self.rows()[-1]['auditEpochId'], current)

    def test_concurrent_operations_keep_one_sequence_and_link_nested_operations(self):
        def write(index):
            with audit.administrative_operation('BACKUP_CREATED', source='unit', root=self.root, details={'count': index}):
                pass
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
            list(executor.map(write, range(12)))
        self.assertEqual(audit.validate(self.root)['records'], 24)
        with audit.administrative_operation('RUNTIME_UP', source='unit', root=self.root) as parent:
            with audit.administrative_operation('GITLAB_ADMIN_COMMAND', source='unit', root=self.root):
                pass
        child = [r for r in self.rows() if r['action'] == 'GITLAB_ADMIN_COMMAND'][0]
        self.assertEqual(child['parentOperationId'], parent.id)

    def test_symbolic_and_hard_links_cannot_redirect_the_ledger(self):
        other = self.root / 'other'
        other.mkdir()
        (self.root / 'audit').symlink_to(other, target_is_directory=True)
        with self.assertRaises(ValueError):
            audit.validate(self.root)
        (self.root / 'audit').unlink()
        (self.root / 'audit').mkdir()
        outside = self.root / 'outside'
        outside.write_text('untouched')
        os.link(outside, self.root / 'audit/admin.jsonl')
        with self.assertRaises(ValueError):
            audit.validate(self.root)
        self.assertEqual(outside.read_text(), 'untouched')

    def test_gitlab_transport_audit_omits_request_and_response_secrets_and_preserves_acceptance(self):
        spec = importlib.util.spec_from_file_location('audit_manage_test', Path(__file__).parents[1] / 'gitlab/manage.py')
        manage = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(manage)
        runtime = self.root / 'runtime'
        gitlab = runtime / 'gitlab-demo'
        (gitlab / '.secrets').mkdir(parents=True)
        (gitlab / '.secrets/token').write_text('request-secret-value')
        response = MagicMock()
        response.status = 202
        response.read.return_value = b'{"token":"response-secret-value"}'
        response.__enter__.return_value = response
        with patch.object(manage, 'ROOT', gitlab), patch.object(manage.urllib.request, 'urlopen', return_value=response):
            result = manage.api('POST', 'users/2/personal_access_tokens', {'password': 'body-secret-value'}, admin=True)
        self.assertEqual(result['token'], 'response-secret-value')
        rows = (runtime / 'audit/admin.jsonl').read_text()
        for secret in ['request-secret-value', 'response-secret-value', 'body-secret-value']:
            self.assertNotIn(secret, rows)
        self.assertEqual(json.loads(rows.splitlines()[-1])['outcome'], 'ACCEPTED')

    def test_runtime_failure_keeps_exit_status_and_closes_its_audit_request(self):
        # A named disposable root is required by runtime.sh. No manifest exists,
        # so verification exits before Docker or any installed service is used.
        name = 'sdlc-package-' + str(uuid4())
        runtime = Path('/tmp') / name
        runtime.mkdir(mode=0o700)
        self.addCleanup(lambda: shutil.rmtree(runtime) if runtime.parent == Path('/tmp') and runtime.name == name else None)
        (runtime / '.owner').write_text(uuid4().hex)
        script = Path(__file__).parents[1] / 'scripts/linux/runtime.sh'
        environment = dict(os.environ)
        environment.pop('SDLC_ADMIN_OPERATION_ID', None)
        result = subprocess.run(['bash', str(script), str(runtime), 'backup'], env=environment, capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)
        rows = [json.loads(line) for line in (runtime / 'audit/admin.jsonl').read_text().splitlines()]
        self.assertEqual([row['outcome'] for row in rows], ['ACCEPTED', 'UNKNOWN'])
        self.assertEqual(rows[-1]['metadata']['exitCode'], 1)
        self.assertEqual(audit.validate(runtime)['pendingOperations'], [])


if __name__ == '__main__':
    unittest.main()
