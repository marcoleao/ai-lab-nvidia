"""A WAL-backed source must survive snapshot normalization unchanged."""
from contextlib import closing
import shutil
import sqlite3

import pytest

from forgejo_backup import inventory, normalize


def test_snapshot_merges_wal_without_touching_source(tmp_path):
    root = tmp_path / 'source'
    database = root / 'data/data/forgejo.db'
    database.parent.mkdir(parents=True)
    with closing(sqlite3.connect(database)) as connection:
        connection.execute('PRAGMA journal_mode=WAL')
        for table in ('user', 'repository', 'issue'):
            connection.execute('CREATE TABLE ' + table + ' (id INTEGER)')
            connection.execute('INSERT INTO ' + table + ' VALUES (1)')
        connection.commit()
        assert database.with_name('forgejo.db-wal').stat().st_size > 0
        original = {p.relative_to(root): p.read_bytes() for p in root.rglob('*') if p.is_file()}
        stage = tmp_path / 'staging'
        shutil.copytree(root, stage)
        normalize(stage)
        first = inventory(stage)
        assert first['counts'] == {'user': 1, 'repository': 1, 'issue': 1}
        assert first == inventory(stage), 'Read-only verification must not change snapshot hashes'
        assert original == {p.relative_to(root): p.read_bytes() for p in root.rglob('*') if p.is_file()}
        assert not (stage / 'data/data/forgejo.db-wal').exists()


def test_snapshot_rejects_symlink_and_detects_file_changes(tmp_path):
    root = tmp_path / 'snapshot'
    database = root / 'data/data/forgejo.db'
    database.parent.mkdir(parents=True)
    with closing(sqlite3.connect(database)) as connection:
        for table in ('user', 'repository', 'issue'):
            connection.execute('CREATE TABLE ' + table + ' (id INTEGER)')
    initial = inventory(root)
    (root / 'app.ini').write_text('unexpected change')
    assert inventory(root) != initial
    (root / 'escape').symlink_to(tmp_path)
    with pytest.raises(ValueError, match='symlinks'):
        inventory(root)
