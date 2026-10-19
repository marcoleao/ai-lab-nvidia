"""Opaque, expiring human sessions; bearer credentials never enter cookies."""
import hashlib
import secrets
import time

from fastapi import HTTPException, Request
from sqlalchemy import Column, Integer, MetaData, String, Table, insert, select

import security

metadata = MetaData()
sessions = Table('browser_sessions', metadata, Column('id', String, primary_key=True), Column('credential_id', String), Column('csrf_hash', String), Column('expires_at', Integer), Column('revoked', Integer))
SESSION_COOKIE = 'sdlc_session'
CSRF_COOKIE = 'sdlc_csrf'
SESSION_SECONDS = 1800


def hash_token(value):
    return hashlib.sha256(value.encode()).hexdigest()


def create_session(connection, actor):
    if actor['kind'] != 'human':
        raise HTTPException(403, 'Human session required')
    session_token, csrf_token = secrets.token_urlsafe(48), secrets.token_urlsafe(32)
    session_id = hash_token(session_token)
    connection.execute(insert(sessions).values(id=session_id, credential_id=actor['credential_id'], csrf_hash=hash_token(csrf_token), expires_at=int(time.time()) + SESSION_SECONDS, revoked=0))
    security.security_event(connection, actor['id'], 'session.created', session_id)
    return session_token, csrf_token


def authenticate_session(connection, request: Request, origin):
    session_id = hash_token(request.cookies.get(SESSION_COOKIE, ''))
    row = connection.execute(select(sessions).where(sessions.c.id == session_id, sessions.c.revoked == 0, sessions.c.expires_at > int(time.time()))).mappings().first()
    if row is None:
        raise HTTPException(401, 'Session expired or invalid')
    credential = connection.execute(select(security.credentials).where(security.credentials.c.id == row['credential_id'], security.credentials.c.revoked == 0)).mappings().first()
    identity = connection.execute(select(security.identities).where(security.identities.c.id == credential['identity_id'], security.identities.c.active == 1)).mappings().first() if credential else None
    if identity is None or identity['kind'] != 'human':
        raise HTTPException(401, 'Human session invalid')
    if str(request.base_url).rstrip('/') != origin:
        raise HTTPException(403, 'Unexpected portal origin')
    if request.method not in {'GET', 'HEAD', 'OPTIONS'}:
        csrf = request.headers.get('x-csrf-token', '')
        if request.headers.get('origin') != origin or not csrf or not secrets.compare_digest(hash_token(csrf), row['csrf_hash']):
            raise HTTPException(403, 'CSRF validation failed')
    return {**dict(identity), 'credential_id': credential['id'], 'session_id': session_id, 'expires_at': row['expires_at']}
