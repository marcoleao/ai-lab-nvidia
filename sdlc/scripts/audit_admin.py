"""Private append-only administrative audit. Root can still alter these files.

The ledger lives outside state/backups so a reset cannot erase its own evidence.
Only explicit metadata is accepted; request bodies and credentials are never read.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import tempfile
from uuid import uuid4

ZERO = '0' * 64
OUTCOMES = {'ACCEPTED', 'SUCCEEDED', 'FAILED', 'REJECTED', 'CANCELLED', 'UNKNOWN', 'NO_CHANGE'}
PHASES = {'REQUESTED', 'COMPLETED', 'OBSERVED'}
FIELDS = {'command', 'method', 'path', 'httpStatus', 'errorType', 'backupId', 'projectId',
          'repositoryId', 'groupId', 'model', 'networkName', 'count', 'scope', 'epochId',
          'previousEpochId', 'exitCode', 'manifestDigest', 'imageId', 'browserImageId', 'integration', 'reasonCode'}
SECRET = re.compile(r'(?i)(bearer\s|glpat-|sk-[a-z0-9_-]{8,}|(?:token|password|secret|authorization|cookie)\s*[:=])')
CURRENT_OPERATION = ContextVar('sdlc_admin_operation', default=None)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True)


def metadata(value=None):
    result = {}
    for key, field in (value or {}).items():
        if key not in FIELDS:
            raise ValueError('Administrative audit metadata field is not allowed')
        if field is None or isinstance(field, (bool, int)):
            result[key] = field
        elif isinstance(field, str) and len(field) <= 500 and not SECRET.search(field) and not any(ord(c) < 32 for c in field):
            if key == 'path' and ('?' in field or '#' in field or '://' in field):
                raise ValueError('Audit paths must omit authority and query data')
            result[key] = field
        else:
            raise ValueError('Administrative audit metadata value is not allowed')
    return result


def runtime_root(value=None):
    path = Path(value or os.environ.get('SDLC_RUNTIME_ROOT', '/opt/agentic-sdlc'))
    if not path.is_absolute() or path.is_symlink() or not path.is_dir() or path.resolve() != path:
        raise ValueError('An existing absolute runtime directory without symlinks is required')
    return path


def private_open(path, flags):
    descriptor = os.open(path, flags | os.O_NOFOLLOW, 0o600)
    if not stat.S_ISREG(os.fstat(descriptor).st_mode) or os.fstat(descriptor).st_nlink != 1:
        os.close(descriptor)
        raise ValueError('Audit file must be regular')
    os.fchmod(descriptor, 0o600)
    return descriptor


def atomic_json(path, value):
    if path.is_symlink():
        raise ValueError('Audit metadata cannot be a symbolic link')
    descriptor, name = tempfile.mkstemp(prefix='.epoch-', dir=path.parent)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, 'w') as stream:
            stream.write(canonical(value) + '\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, path)
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(name):
            os.unlink(name)


@contextmanager
def ledger(root=None):
    directory = runtime_root(root) / 'audit'
    if directory.is_symlink():
        raise ValueError('Audit directory cannot be a symbolic link')
    directory.mkdir(mode=0o700, exist_ok=True)
    directory.chmod(0o700)
    descriptor = private_open(directory / 'admin.jsonl', os.O_RDWR | os.O_CREAT | os.O_APPEND)
    with os.fdopen(descriptor, 'a+', encoding='utf-8') as stream:
        fcntl.flock(stream, fcntl.LOCK_EX)
        yield directory, stream


def inspect_chain(stream):
    stream.seek(0)
    previous, sequence, records = ZERO, 0, []
    for line in stream:
        if not line.endswith('\n'):
            raise ValueError('Incomplete administrative audit record')
        row = json.loads(line)
        checksum = row.pop('hash', None)
        if row.get('previousHash') != previous or row.get('sequence') != sequence + 1:
            raise ValueError('Administrative audit sequence diverged')
        if hashlib.sha256(canonical(row).encode()).hexdigest() != checksum:
            raise ValueError('Administrative audit digest diverged')
        metadata(row.get('metadata'))
        previous, sequence = checksum, sequence + 1
        records.append({**row, 'hash': checksum})
    return records, previous


def epoch(directory):
    path = directory / 'epoch.json'
    if path.is_symlink():
        raise ValueError('Audit epoch cannot be a symbolic link')
    if not path.exists():
        atomic_json(path, {'version': 1, 'epochId': str(uuid4())})
    value = json.loads(path.read_text())
    if not re.fullmatch(r'[a-f0-9-]{36}', value.get('epochId', '')):
        raise ValueError('Invalid audit epoch')
    return value['epochId']


def append_locked(directory, stream, action, phase, outcome, operation_id, source, details=None):
    if not re.fullmatch(r'[A-Z][A-Z0-9_.-]{2,119}', action) or phase not in PHASES or outcome not in OUTCOMES:
        raise ValueError('Invalid administrative audit classification')
    if not re.fullmatch(r'[a-f0-9-]{36}', operation_id):
        raise ValueError('Invalid administrative operation identifier')
    if not re.fullmatch(r'[a-zA-Z0-9_.:/-]{1,160}', source):
        raise ValueError('Invalid administrative source')
    safe = metadata(details)
    records, previous = inspect_chain(stream)
    matching = [row for row in records if row['operationId'] == operation_id and row['action'] == action]
    if action != 'AUDIT_EPOCH_STARTED':
        if phase == 'REQUESTED' and matching:
            raise ValueError('Administrative operation was already requested')
        if phase != 'REQUESTED' and (not matching or matching[0]['phase'] != 'REQUESTED' or len(matching) != 1):
            raise ValueError('Administrative result requires exactly one pending request')
    else:
        operation = [row for row in records if row['operationId'] == operation_id and row['action'] != 'AUDIT_EPOCH_STARTED']
        if len(operation) != 1 or operation[0]['phase'] != 'REQUESTED':
            raise ValueError('Epoch rotation requires a pending administrative request')
    parent = CURRENT_OPERATION.get() or os.environ.get('SDLC_ADMIN_OPERATION_ID')
    if parent is not None and not re.fullmatch(r'[a-f0-9-]{36}', parent):
        raise ValueError('Invalid parent administrative operation')
    row = {'schemaVersion': 1, 'sequence': len(records) + 1, 'previousHash': previous,
           'operationId': operation_id, 'auditEpochId': epoch(directory), 'action': action,
           'phase': phase, 'outcome': outcome, 'occurredAt': datetime.now(timezone.utc).isoformat(),
           'operator': {'uid': os.getuid(), 'effectiveUid': os.geteuid(), 'assurance': 'os_process',
                        'humanIdentity': 'not_verified'}, 'source': source, 'metadata': safe}
    if parent and parent != operation_id:
        row['parentOperationId'] = parent
    row['hash'] = hashlib.sha256(canonical(row).encode()).hexdigest()
    stream.seek(0, os.SEEK_END)
    stream.write(canonical(row) + '\n')
    stream.flush()
    os.fsync(stream.fileno())
    return row


def append(action, phase, outcome, operation_id, *, source, details=None, root=None):
    with ledger(root) as (directory, stream):
        return append_locked(directory, stream, action, phase, outcome, operation_id, source, details)


def validate(root=None):
    with ledger(root) as (directory, stream):
        records, head = inspect_chain(stream)
        current = epoch(directory)
        rotations = [row for row in records if row['action'] == 'AUDIT_EPOCH_STARTED']
        if rotations and rotations[-1]['metadata']['epochId'] != current:
            raise ValueError('Epoch marker differs from the administrative ledger')
        requested = {row['operationId']: row for row in records if row['phase'] == 'REQUESTED'}
        completed = {row['operationId'] for row in records if row['phase'] != 'REQUESTED' and row['action'] != 'AUDIT_EPOCH_STARTED'}
        pending = [{'operationId': identifier, 'action': row['action'], 'requestedAt': row['occurredAt']}
                   for identifier, row in requested.items() if identifier not in completed]
        return {'records': len(records), 'head': head, 'epochId': current, 'pendingOperations': pending}


def rotate_epoch(operation_id, *, source, root=None):
    with ledger(root) as (directory, stream):
        previous, current = epoch(directory), str(uuid4())
        append_locked(directory, stream, 'AUDIT_EPOCH_STARTED', 'OBSERVED', 'SUCCEEDED', operation_id,
                      source, {'previousEpochId': previous, 'epochId': current, 'reasonCode': 'ACCEPTANCE_RESET'})
        atomic_json(directory / 'epoch.json', {'version': 1, 'epochId': current})
        return current


class AdministrativeOperation:
    def __init__(self, operation_id):
        self.id, self.outcome, self.details = operation_id, 'SUCCEEDED', {}

    def result(self, outcome='SUCCEEDED', **details):
        if outcome not in OUTCOMES:
            raise ValueError('Invalid administrative result')
        self.outcome, self.details = outcome, metadata(details)


@contextmanager
def administrative_operation(action, *, source, details=None, root=None, failure_outcome='UNKNOWN'):
    operation = AdministrativeOperation(str(uuid4()))
    append(action, 'REQUESTED', 'ACCEPTED', operation.id, source=source, details=details, root=root)
    parent = CURRENT_OPERATION.set(operation.id)
    try:
        yield operation
    except BaseException as error:
        append(action, 'OBSERVED', failure_outcome, operation.id, source=source,
               details={**(details or {}), 'errorType': type(error).__name__}, root=root)
        raise
    else:
        append(action, 'OBSERVED' if operation.outcome == 'ACCEPTED' else 'COMPLETED', operation.outcome,
               operation.id, source=source, details={**(details or {}), **operation.details}, root=root)
    finally:
        CURRENT_OPERATION.reset(parent)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['begin', 'end', 'epoch', 'validate'])
    parser.add_argument('--root', type=Path)
    parser.add_argument('--action')
    parser.add_argument('--source', default='runtime')
    parser.add_argument('--operation-id')
    parser.add_argument('--outcome', choices=sorted(OUTCOMES), default='SUCCEEDED')
    parser.add_argument('--metadata', default='{}')
    args = parser.parse_args()
    if args.command == 'validate':
        print(canonical(validate(args.root)))
    elif args.command == 'epoch':
        print(rotate_epoch(args.operation_id, source=args.source, root=args.root))
    else:
        operation_id = args.operation_id or str(uuid4())
        phase = 'REQUESTED' if args.command == 'begin' else 'OBSERVED' if args.outcome in {'UNKNOWN', 'ACCEPTED'} else 'COMPLETED'
        append(args.action, phase,
               'ACCEPTED' if args.command == 'begin' else args.outcome, operation_id,
               source=args.source, details=json.loads(args.metadata), root=args.root)
        if args.command == 'begin':
            print(operation_id)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        raise SystemExit('Administrative audit failed: ' + type(error).__name__) from None
