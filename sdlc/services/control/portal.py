"""Local browser interface, served by the same origin as the control API."""
from pathlib import Path
from urllib.parse import urlsplit
import time
from threading import Lock

from fastapi import Depends, HTTPException, Request, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field, SecretStr
from sqlalchemy import select, update

import security
from sessions import CSRF_COOKIE, SESSION_COOKIE, SESSION_SECONDS, create_session, hash_token, sessions


class LoginInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    token: SecretStr = Field(min_length=1, max_length=256)


def attach_portal(app, engine, authenticate, origin, allow_insecure_local):
    parsed = urlsplit(origin)
    if parsed.path or parsed.query or parsed.fragment or parsed.username or parsed.password or parsed.hostname not in {'localhost', '127.0.0.1'}:
        raise ValueError('Portal requires an explicit loopback origin without path')
    if parsed.scheme != 'https' and not (parsed.scheme == 'http' and allow_insecure_local):
        raise ValueError('HTTPS required unless insecure local mode is explicitly enabled')
    secure = parsed.scheme == 'https'
    assets = Path(__file__).parent / 'web'
    # Single-process development throttle; persistent/distributed limiter pending.
    login_attempts = {}
    login_lock = Lock()

    @app.middleware('http')
    async def browser_headers(request, call_next):
        response = await call_next(request)
        response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Referrer-Policy'] = 'no-referrer'
        response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
        return response

    @app.get('/', include_in_schema=False)
    def index():
        return FileResponse(assets / 'index.html')

    @app.get('/assets/{name}', include_in_schema=False)
    def asset(name: str):
        if name not in {'portal.js', 'portal.css', 'backlog.js'}:
            raise HTTPException(404, 'Asset not found')
        return FileResponse(assets / name)

    @app.post('/v1/session')
    def login(body: LoginInput, request: Request, response: Response):
        if request.headers.get('origin') != origin or str(request.base_url).rstrip('/') != origin:
            raise HTTPException(403, 'Login origin invalid')
        # Bounded throttle state. No proxy headers or tokens are used as keys.
        now = time.monotonic()
        peer = request.client.host if request.client else 'local'
        with login_lock:
            for key in list(login_attempts):
                if now - login_attempts[key][0] > 60:
                    del login_attempts[key]
            if peer not in login_attempts:
                if len(login_attempts) >= 1000:
                    raise HTTPException(429, 'Login temporarily unavailable')
                login_attempts[peer] = [now, 0]
            login_attempts[peer][1] += 1
            if login_attempts[peer][1] > 10:
                raise HTTPException(429, 'Too many login attempts')
        with engine.begin() as connection:
            actor = security.authenticate(connection, body.token.get_secret_value())
            if actor['kind'] != 'human':
                raise HTTPException(403, 'Human session required')
            # Rotate any old session without accepting client-chosen session IDs.
            old = request.cookies.get(SESSION_COOKIE)
            if old:
                connection.execute(update(sessions).where(sessions.c.id == hash_token(old), sessions.c.credential_id == actor['credential_id']).values(revoked=1))
            token, csrf = create_session(connection, actor)
        response.set_cookie(SESSION_COOKIE, token, max_age=SESSION_SECONDS, secure=secure, httponly=True, samesite='strict', path='/')
        response.set_cookie(CSRF_COOKIE, csrf, max_age=SESSION_SECONDS, secure=secure, httponly=False, samesite='strict', path='/')
        return {'id': actor['id'], 'kind': 'human', 'expires_in': SESSION_SECONDS}

    @app.get('/v1/session')
    def session_info(actor=Depends(authenticate)):
        if not actor.get('session_id'):
            raise HTTPException(403, 'Browser session required')
        return {'id': actor['id'], 'kind': actor['kind'], 'expires_at': actor['expires_at'], 'can_create_project': bool(actor.get('admin'))}

    @app.delete('/v1/session')
    def logout(response: Response, actor=Depends(authenticate)):
        if not actor.get('session_id'):
            raise HTTPException(403, 'Browser session required')
        with engine.begin() as connection:
            connection.execute(update(sessions).where(sessions.c.id == actor['session_id']).values(revoked=1))
            security.security_event(connection, actor['id'], 'session.revoked', actor['session_id'])
        for name in (SESSION_COOKIE, CSRF_COOKIE):
            response.delete_cookie(name, path='/', secure=secure, httponly=name == SESSION_COOKIE, samesite='strict')
        return {'logged_out': True}

    @app.get('/v1/projects')
    def project_list(actor=Depends(authenticate)):
        from control import projects
        with engine.connect() as connection:
            return [dict(row) for row in connection.execute(select(projects.c.id, projects.c.name, security.memberships.c.role).join(security.memberships, security.memberships.c.project_id == projects.c.id).where(security.memberships.c.identity_id == actor['id']).order_by(projects.c.name).limit(100)).mappings()]

    @app.get('/v1/projects/{project_id}/overview')
    def overview(project_id: str, actor=Depends(authenticate)):
        import json
        from control import approvals, objects, runs
        with engine.connect() as connection:
            role = security.authorize(connection, actor, project_id)
            return {
                'role': role,
                'runs': [dict(row) for row in connection.execute(select(runs).where(runs.c.project_id == project_id).order_by(runs.c.id).limit(100)).mappings()],
                'objects': [{**dict(row), 'payload': json.loads(row['payload'])} for row in connection.execute(select(objects).where(objects.c.project_id == project_id).order_by(objects.c.id).limit(100)).mappings()],
                'approvals': [{**json.loads(row['payload']), 'revoked': bool(row['revoked'])} for row in connection.execute(select(approvals).where(approvals.c.project_id == project_id).order_by(approvals.c.id).limit(100)).mappings()],
            }
