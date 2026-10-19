"""Read-only integrity checks for a stopped, private Forgejo snapshot."""
import hashlib
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import sys
import tempfile


def normalize(directory):
    """Merge WAL into an independent main DB in the stopped staging copy."""
    root = Path(directory).resolve()
    database = root / 'data/data/forgejo.db'
    with tempfile.NamedTemporaryFile(dir=database.parent, prefix='.normalized-', delete=False) as stream:
        target = Path(stream.name)
    try:
        with closing(sqlite3.connect(database.as_uri() + '?mode=ro', uri=True)) as source:
            with closing(sqlite3.connect(target)) as destination:
                source.backup(destination)
        target.replace(database)
        for suffix in ('-wal', '-shm'):
            database.with_name(database.name + suffix).unlink(missing_ok=True)
    finally:
        target.unlink(missing_ok=True)


def inventory(directory):
    root = Path(directory).resolve()
    files = {}
    for path in sorted(root.rglob('*')):
        if path.is_symlink():
            raise ValueError('Forgejo snapshot cannot contain symlinks')
        if path.is_file():
            with path.open('rb') as stream:
                files[path.relative_to(root).as_posix()] = hashlib.file_digest(stream, 'sha256').hexdigest()
    database = root / 'data/data/forgejo.db'
    with closing(sqlite3.connect(database.as_uri() + '?mode=ro&immutable=1', uri=True)) as connection:
        if connection.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
            raise ValueError('Forgejo SQLite integrity check failed')
        counts = {table: connection.execute('SELECT count(*) FROM ' + table).fetchone()[0] for table in ('user', 'repository', 'issue')}
    return {'files': files, 'counts': counts}


if __name__ == '__main__':
    command, directory, *rest = sys.argv[1:]
    if command == 'inventory':
        normalize(directory)
    result = inventory(directory)
    if command == 'inventory' and not rest:
        print(json.dumps(result, sort_keys=True))
    elif command == 'verify' and len(rest) == 1:
        if result != json.loads(Path(rest[0]).read_text()):
            raise ValueError('Forgejo snapshot differs from backup inventory')
        print('[OK] Forgejo snapshot: file hashes, SQLite integrity and row counts verified.')
    else:
        raise ValueError('Unknown snapshot check')
