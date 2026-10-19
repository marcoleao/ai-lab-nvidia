"""Database-backed credentials. Provisioning helpers are trusted operator tools."""
from datetime import datetime, timezone
import hashlib
import secrets
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import Column, Integer, MetaData, String, Table, insert, select, update

metadata = MetaData()
identities = Table('identities', metadata, Column('id', String, primary_key=True), Column('kind', String), Column('active', Integer), Column('admin', Integer))
credentials = Table('credentials', metadata, Column('id', String, primary_key=True), Column('identity_id', String), Column('token_hash', String), Column('revoked', Integer))
memberships = Table('memberships', metadata, Column('project_id', String, primary_key=True), Column('identity_id', String, primary_key=True), Column('role', String))
security_events = Table('security_events', metadata, Column('id', String, primary_key=True), Column('actor_id', String), Column('kind', String), Column('subject_id', String), Column('occurred_at', String))
PERMISSIONS = {
    'reader': {'read'},
    'contributor': {'read', 'write'},
    'approver': {'read', 'approve'},
    'manager': {'read', 'write', 'approve', 'manage'},
}


def security_event(connection, actor_id, kind, subject_id):
    connection.execute(insert(security_events).values(id=str(uuid4()), actor_id=actor_id, kind=kind, subject_id=subject_id, occurred_at=datetime.now(timezone.utc).isoformat()))


def provision_identity(engine, *, kind, admin=False, operator_id):
    if kind not in {'human', 'agent'} or (kind != 'human' and admin):
        raise ValueError('Invalid identity kind or administrator')
    identity_id, credential_id, token = str(uuid4()), str(uuid4()), secrets.token_urlsafe(48)
    with engine.begin() as connection:
        connection.execute(insert(identities).values(id=identity_id, kind=kind, active=1, admin=int(admin)))
        connection.execute(insert(credentials).values(id=credential_id, identity_id=identity_id, token_hash=hashlib.sha256(token.encode()).hexdigest(), revoked=0))
        security_event(connection, operator_id, 'identity.provisioned', identity_id)
    # Caller must deliver once over a private channel; never log this dictionary.
    return {'id': identity_id, 'credential_id': credential_id, 'token': token}


def revoke_credential(engine, credential_id, *, operator_id):
    with engine.begin() as connection:
        connection.execute(update(credentials).where(credentials.c.id == credential_id).values(revoked=1))
        security_event(connection, operator_id, 'credential.revoked', credential_id)


def authenticate(connection, token):
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    row = connection.execute(select(identities.c.id, identities.c.kind, identities.c.active, identities.c.admin, credentials.c.id.label('credential_id')).join(credentials, credentials.c.identity_id == identities.c.id).where(credentials.c.token_hash == token_hash, credentials.c.revoked == 0, identities.c.active == 1)).mappings().first()
    if row is None:
        raise HTTPException(401, 'Invalid credential')
    return dict(row)


def assert_live_session(connection, actor, *, lock=False):
    if actor.get('session_id'):
        from sessions import sessions
        import time
        query = select(sessions).where(sessions.c.id == actor['session_id'], sessions.c.revoked == 0, sessions.c.expires_at > int(time.time()))
        session = connection.execute(query.with_for_update(read=True) if lock else query).first()
        if session is None:
            raise HTTPException(401, 'Session expired or revoked')


def authorize(connection, actor, project_id, permission='read', *, lock=False):
    assert_live_session(connection, actor, lock=lock)
    query = select(identities).where(identities.c.id == actor['id'])
    identity = connection.execute(query.with_for_update(read=True) if lock else query).mappings().first()
    credential_query = select(credentials).where(credentials.c.id == actor['credential_id'], credentials.c.identity_id == actor['id'])
    credential = connection.execute(credential_query.with_for_update(read=True) if lock else credential_query).mappings().first()
    if not identity or not identity['active'] or not credential or credential['revoked']:
        raise HTTPException(401, 'Credential revoked or identity disabled')
    membership = connection.execute(select(memberships).where(memberships.c.identity_id == actor['id'], memberships.c.project_id == project_id)).mappings().first()
    if not membership or permission not in PERMISSIONS[membership['role']]:
        raise HTTPException(403, 'Project permission denied')
    if permission in {'approve', 'manage'} and identity['kind'] != 'human':
        raise HTTPException(403, 'Human permission required')
    return membership['role']
