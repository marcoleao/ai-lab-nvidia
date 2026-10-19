"""Control API foundation. No worker, deployment or shell execution endpoints."""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
from uuid import uuid4

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import Column, Integer, MetaData, String, Table, Text, UniqueConstraint, create_engine, insert, select, update
import security

metadata = MetaData()
projects = Table('projects', metadata, Column('id', String, primary_key=True), Column('name', String, nullable=False))
runs = Table('runs', metadata, Column('id', String, primary_key=True), Column('project_id', String, nullable=False), Column('state', String, nullable=False), Column('version', Integer, nullable=False))
approvals = Table('approvals', metadata, Column('id', String, primary_key=True), Column('project_id', String, nullable=False), Column('actor_id', String, nullable=False), Column('payload', Text, nullable=False), Column('revoked', Integer, nullable=False))
events = Table('events', metadata, Column('id', String, primary_key=True), Column('project_id', String, nullable=False), Column('sequence', Integer, nullable=False), Column('payload', Text, nullable=False), Column('previous_hash', String, nullable=False), Column('hash', String, nullable=False), UniqueConstraint('project_id', 'sequence'))
objects = Table('approval_objects', metadata, Column('id', String, primary_key=True), Column('project_id', String, nullable=False), Column('version', Integer, nullable=False), Column('payload', Text, nullable=False), Column('hash', String, nullable=False), Column('target', String, nullable=False), Column('policy_hash', String, nullable=False))
commands = Table('commands', metadata, Column('id', String, primary_key=True), Column('request_hash', String, nullable=False), Column('result', Text, nullable=False))
outbox = Table('outbox', metadata, Column('id', String, primary_key=True), Column('event_id', String, nullable=False), Column('state', String, nullable=False), Column('attempts', Integer, server_default='0', nullable=False))


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False)


def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


class StrictBody(BaseModel):
    model_config = ConfigDict(extra='forbid')


class ProjectInput(StrictBody):
    name: str = Field(min_length=1, max_length=120)


class RunInput(StrictBody):
    project_id: str = Field(min_length=1, max_length=100)


class TransitionInput(StrictBody):
    expected_version: int = Field(ge=1)
    state: str


class ApprovalInput(StrictBody):
    project_id: str
    object_id: str = Field(min_length=1)
    object_version: int = Field(ge=1)
    object_hash: str = Field(pattern=r'^[a-f0-9]{64}$')
    target: str = Field(min_length=1)
    policy_hash: str = Field(pattern=r'^[a-f0-9]{64}$')
    decision: str = Field(pattern=r'^(approved|rejected)$')
    reason: str = Field(min_length=1, max_length=2000)


class ObjectInput(StrictBody):
    project_id: str
    payload: dict
    target: str = Field(min_length=1, max_length=120)
    policy_hash: str = Field(pattern=r'^[a-f0-9]{64}$')


class ObjectUpdate(ObjectInput):
    expected_version: int = Field(ge=1)


class MembershipInput(StrictBody):
    role: str = Field(pattern=r'^(reader|contributor|approver|manager)$')


TRANSITIONS = {
    'planned': {'ready', 'cancelled'}, 'ready': {'running', 'cancelled'},
    'running': {'validating', 'waiting_human', 'paused', 'failed', 'cancelled'},
    'validating': {'completed', 'waiting_human', 'paused', 'failed', 'cancelled'},
    'waiting_human': {'ready', 'cancelled'}, 'paused': {'ready', 'cancelled'},
    'failed': {'ready', 'cancelled'}, 'cancelled': set(), 'completed': set(),
}


def create_app(database_url: str, *, portal_origin='https://localhost:3100', allow_insecure_local=False, forgejo=None, chat_model='qwen3:14b'):
    """Credentials and memberships come exclusively from the migrated database."""
    engine = create_engine(database_url)
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    app.state.engine = engine

    @app.get('/health/ready', include_in_schema=False)
    def ready():
        from sqlalchemy import text
        with engine.connect() as connection:
            connection.execute(text('SELECT 1 FROM schema_migrations LIMIT 1')).first()
        return {'status': 'ready', 'scope': 'acceptance-nucleus'}

    def authenticate(request: Request, authorization: str = Header(default='')):
        from sessions import SESSION_COOKIE, authenticate_session
        if request.cookies.get(SESSION_COOKIE):
            if authorization:
                raise HTTPException(400, 'Choose session or bearer authentication')
            with engine.connect() as connection:
                return authenticate_session(connection, request, portal_origin)
        scheme, _, token = authorization.partition(' ')
        if scheme.lower() != 'bearer' or not token:
            raise HTTPException(401, 'Authentication required')
        with engine.connect() as connection:
            return security.authenticate(connection, token)

    def authorize(actor, project_id):
        with engine.connect() as connection:
            security.authorize(connection, actor, project_id)

    def record(connection, project_id, actor, kind, data):
        # Every mutation locks the same project row, serializing its audit chain.
        previous = connection.execute(select(events).where(events.c.project_id == project_id).order_by(events.c.sequence.desc()).limit(1)).mappings().first()
        previous_hash = previous['hash'] if previous else '0' * 64
        payload = {'actor_id': actor['id'], 'actor_kind': actor['kind'], 'kind': kind, 'data': data, 'at': datetime.now(timezone.utc).isoformat()}
        event_id = str(uuid4())
        sequence = previous['sequence'] + 1 if previous else 1
        event_hash = digest({'project_id': project_id, 'sequence': sequence, 'previous_hash': previous_hash, 'payload': payload})
        connection.execute(insert(events).values(id=event_id, project_id=project_id, sequence=sequence, payload=canonical(payload), previous_hash=previous_hash, hash=event_hash))
        connection.execute(insert(outbox).values(id=str(uuid4()), event_id=event_id, state='pending'))

    def mutate(project_id, actor, key, action, body, operation, *, permission='write', replay=True, event_data=None):
        if not key or len(key) > 128:
            raise HTTPException(400, 'Idempotency-Key required, maximum 128 characters')
        command_id = digest([actor['id'], project_id, key])
        request_hash = digest([action, body])
        with engine.begin() as connection:
            # Serialize project changes without blocking FK key-share checks
            # performed by the local inbox consumer (project IDs never change).
            project = connection.execute(select(projects).where(projects.c.id == project_id).with_for_update(key_share=True)).first()
            if project is None:
                raise HTTPException(404, 'Project not found')
            # Recheck after taking project lock, before idempotency replay/effect.
            security.authorize(connection, actor, project_id, permission, lock=True)
            prior = connection.execute(select(commands).where(commands.c.id == command_id)).mappings().first()
            if prior:
                if not replay:
                    raise HTTPException(409, 'Lease claims cannot be replayed; consult the current state')
                if prior['request_hash'] != request_hash:
                    raise HTTPException(409, 'Idempotency key reused with different command')
                return json.loads(prior['result'])
            result = operation(connection)
            record(connection, project_id, actor, action, event_data(result) if event_data else result)
            connection.execute(insert(commands).values(id=command_id, request_hash=request_hash, result=canonical(result)))
            return result

    @app.post('/v1/projects')
    def create_project(body: ProjectInput, idempotency_key: str = Header(default=''), actor=Depends(authenticate)):
        if not actor.get('admin') or actor['kind'] != 'human':
            raise HTTPException(403, 'Human administrator required')
        if not idempotency_key or len(idempotency_key) > 128:
            raise HTTPException(400, 'Idempotency-Key required, maximum 128 characters')
        command_id = digest([actor['id'], '__projects__', idempotency_key])
        request_hash = digest(['project.created', body.model_dump()])
        with engine.begin() as connection:
            identity = connection.execute(select(security.identities).where(security.identities.c.id == actor['id']).with_for_update()).mappings().one()
            credential = connection.execute(select(security.credentials).where(security.credentials.c.id == actor['credential_id']).with_for_update(read=True)).mappings().one()
            if not identity['active'] or credential['revoked'] or not identity['admin'] or identity['kind'] != 'human':
                raise HTTPException(403, 'Active human administrator required')
            security.assert_live_session(connection, actor, lock=True)
            prior = connection.execute(select(commands).where(commands.c.id == command_id)).mappings().first()
            if prior:
                if prior['request_hash'] != request_hash:
                    raise HTTPException(409, 'Idempotency key reused with different command')
                return json.loads(prior['result'])
            project_id = str(uuid4())
            connection.execute(insert(projects).values(id=project_id, name=body.name))
            connection.execute(insert(security.memberships).values(project_id=project_id, identity_id=actor['id'], role='manager'))
            value = {'id': project_id, 'name': body.name}
            record(connection, project_id, actor, 'project.created', value)
            connection.execute(insert(commands).values(id=command_id, request_hash=request_hash, result=canonical(value)))
        return value

    @app.put('/v1/projects/{project_id}/members/{identity_id}')
    def grant_member(project_id: str, identity_id: str, body: MembershipInput, idempotency_key: str = Header(default=''), actor=Depends(authenticate)):
        def operation(connection):
            identity = connection.execute(select(security.identities).where(security.identities.c.id == identity_id)).mappings().first()
            if identity is None or not identity['active']:
                raise HTTPException(404, 'Active identity not found')
            if identity['kind'] != 'human' and body.role in {'approver', 'manager'}:
                raise HTTPException(403, 'Agents cannot hold human approval permissions')
            if identity_id == actor['id']:
                raise HTTPException(409, 'Self membership changes require another manager')
            current = connection.execute(select(security.memberships).where(security.memberships.c.project_id == project_id, security.memberships.c.identity_id == identity_id)).first()
            if current:
                connection.execute(update(security.memberships).where(security.memberships.c.project_id == project_id, security.memberships.c.identity_id == identity_id).values(role=body.role))
            else:
                connection.execute(insert(security.memberships).values(project_id=project_id, identity_id=identity_id, role=body.role))
            return {'project_id': project_id, 'identity_id': identity_id, 'role': body.role}
        return mutate(project_id, actor, idempotency_key, 'membership.granted', {'identity_id': identity_id, **body.model_dump()}, operation, permission='manage')

    @app.delete('/v1/projects/{project_id}/members/{identity_id}')
    def revoke_member(project_id: str, identity_id: str, idempotency_key: str = Header(default=''), actor=Depends(authenticate)):
        def operation(connection):
            if identity_id == actor['id']:
                raise HTTPException(409, 'Cannot remove own manager access')
            connection.execute(security.memberships.delete().where(security.memberships.c.project_id == project_id, security.memberships.c.identity_id == identity_id))
            return {'project_id': project_id, 'identity_id': identity_id, 'revoked': True}
        return mutate(project_id, actor, idempotency_key, 'membership.revoked', {'identity_id': identity_id}, operation, permission='manage')

    @app.post('/v1/runs')
    def create_run(body: RunInput, idempotency_key: str = Header(default=''), actor=Depends(authenticate)):
        authorize(actor, body.project_id)
        def operation(connection):
            value = {'id': str(uuid4()), 'project_id': body.project_id, 'state': 'planned', 'version': 1}
            connection.execute(insert(runs).values(**value))
            return value
        return mutate(body.project_id, actor, idempotency_key, 'run.created', body.model_dump(), operation)

    @app.get('/v1/runs/{run_id}')
    def get_run(run_id: str, actor=Depends(authenticate)):
        with engine.connect() as connection:
            row = connection.execute(select(runs).where(runs.c.id == run_id)).mappings().first()
            if row is None:
                raise HTTPException(404, 'Run not found')
            authorize(actor, row['project_id'])
            return dict(row)

    @app.post('/v1/runs/{run_id}/transitions')
    def transition(run_id: str, body: TransitionInput, idempotency_key: str = Header(default=''), actor=Depends(authenticate)):
        current = get_run(run_id, actor)
        if actor['kind'] != 'human':
            raise HTTPException(403, 'Human required for reference transitions')
        # Execution is not enabled: these are control states, not worker commands.
        def operation(connection):
            row = connection.execute(select(runs).where(runs.c.id == run_id)).mappings().one()
            if row['version'] != body.expected_version:
                raise HTTPException(409, 'Stale run version')
            if body.state not in TRANSITIONS[row['state']]:
                raise HTTPException(409, 'Invalid transition')
            connection.execute(update(runs).where(runs.c.id == run_id).values(state=body.state, version=row['version'] + 1))
            return {**dict(row), 'state': body.state, 'version': row['version'] + 1}
        return mutate(current['project_id'], actor, idempotency_key, 'run.transition', {'run_id': run_id, **body.model_dump()}, operation, permission='manage')

    @app.post('/v1/approvals')
    def approve(body: ApprovalInput, idempotency_key: str = Header(default=''), actor=Depends(authenticate)):
        authorize(actor, body.project_id)
        if actor['kind'] != 'human':
            raise HTTPException(403, 'Human required')
        def operation(connection):
            obj = connection.execute(select(objects).where(objects.c.id == body.object_id, objects.c.project_id == body.project_id)).mappings().first()
            if obj is None:
                raise HTTPException(404, 'Approval object not found')
            if (obj['version'], obj['hash'], obj['target'], obj['policy_hash']) != (body.object_version, body.object_hash, body.target, body.policy_hash):
                raise HTTPException(409, 'Approval object changed')
            if obj['target'] == 'backlog-scope' and body.decision == 'approved':
                from backlog import assert_scope_current
                assert_scope_current(connection, obj, forgejo)
            # Pilot has one effective human decision per object version. A new
            # decision supersedes earlier ones, including an earlier approval.
            superseded = []
            for prior in connection.execute(select(approvals).where(approvals.c.project_id == body.project_id, approvals.c.revoked == 0)).mappings():
                content = json.loads(prior['payload'])
                if content['object_id'] == body.object_id and content['object_version'] == body.object_version:
                    superseded.append(prior['id'])
            for prior_id in superseded:
                connection.execute(update(approvals).where(approvals.c.id == prior_id).values(revoked=1))
            value = {'id': str(uuid4()), 'actor_id': actor['id'], 'actor_kind': 'human', **body.model_dump(), 'occurred_at': datetime.now(timezone.utc).isoformat(), 'revoked': False}
            connection.execute(insert(approvals).values(id=value['id'], project_id=body.project_id, actor_id=actor['id'], payload=canonical(value), revoked=0))
            # Returned IDs are included in the audit event by mutate().
            value['superseded_approval_ids'] = superseded
            return value
        return mutate(body.project_id, actor, idempotency_key, 'approval.recorded', body.model_dump(), operation, permission='approve')

    @app.post('/v1/approval-objects')
    def create_object(body: ObjectInput, idempotency_key: str = Header(default=''), actor=Depends(authenticate)):
        if body.target == 'backlog-scope':
            raise HTTPException(409, 'Scope objects are managed by the backlog')
        authorize(actor, body.project_id)
        def operation(connection):
            value = {'id': str(uuid4()), 'project_id': body.project_id, 'version': 1, 'payload': canonical(body.payload), 'target': body.target, 'policy_hash': body.policy_hash}
            value['hash'] = digest({'payload': body.payload, 'target': body.target, 'policy_hash': body.policy_hash})
            connection.execute(insert(objects).values(**value))
            return value
        return mutate(body.project_id, actor, idempotency_key, 'object.created', body.model_dump(), operation)

    @app.put('/v1/approval-objects/{object_id}')
    def update_object(object_id: str, body: ObjectUpdate, idempotency_key: str = Header(default=''), actor=Depends(authenticate)):
        if body.target == 'backlog-scope':
            raise HTTPException(409, 'Scope objects are managed by the backlog')
        authorize(actor, body.project_id)
        def operation(connection):
            obj = connection.execute(select(objects).where(objects.c.id == object_id, objects.c.project_id == body.project_id)).mappings().first()
            if obj is None:
                raise HTTPException(404, 'Object not found')
            if obj['target'] == 'backlog-scope':
                raise HTTPException(409, 'Scope objects are managed by the backlog')
            if obj['version'] != body.expected_version:
                raise HTTPException(409, 'Stale object version')
            value = {'payload': canonical(body.payload), 'version': obj['version'] + 1, 'target': body.target, 'policy_hash': body.policy_hash, 'hash': digest({'payload': body.payload, 'target': body.target, 'policy_hash': body.policy_hash})}
            connection.execute(update(objects).where(objects.c.id == object_id).values(**value))
            return {**dict(obj), **value}
        return mutate(body.project_id, actor, idempotency_key, 'object.updated', {'object_id': object_id, **body.model_dump()}, operation)

    @app.get('/v1/approvals/{approval_id}/validity')
    def approval_validity(approval_id: str, actor=Depends(authenticate)):
        # Informational snapshot only; privileged execution must recheck under lock.
        with engine.connect() as connection:
            row = connection.execute(select(approvals).where(approvals.c.id == approval_id)).mappings().first()
            if row is None:
                raise HTTPException(404, 'Approval not found')
            authorize(actor, row['project_id'])
            value = json.loads(row['payload'])
            obj = connection.execute(select(objects).where(objects.c.id == value['object_id'], objects.c.project_id == row['project_id'])).mappings().first()
            valid = bool(obj and not row['revoked'] and value['decision'] == 'approved' and (obj['version'], obj['hash'], obj['target'], obj['policy_hash']) == (value['object_version'], value['object_hash'], value['target'], value['policy_hash']))
            if valid and obj['target'] == 'backlog-scope':
                from backlog import assert_scope_current
                try:
                    assert_scope_current(connection, obj, forgejo)
                except HTTPException:
                    valid = False
            return {'id': approval_id, 'valid': valid, 'revoked': bool(row['revoked'])}

    @app.post('/v1/approvals/{approval_id}/revoke')
    def revoke(approval_id: str, idempotency_key: str = Header(default=''), actor=Depends(authenticate)):
        if actor['kind'] != 'human':
            raise HTTPException(403, 'Human required')
        with engine.connect() as connection:
            approval = connection.execute(select(approvals).where(approvals.c.id == approval_id)).mappings().first()
            if approval is None:
                raise HTTPException(404, 'Approval not found')
            authorize(actor, approval['project_id'])
        def operation(connection):
            connection.execute(update(approvals).where(approvals.c.id == approval_id).values(revoked=1))
            return {'id': approval_id, 'revoked': True}
        return mutate(approval['project_id'], actor, idempotency_key, 'approval.revoked', {'id': approval_id}, operation, permission='approve')

    @app.get('/v1/projects/{project_id}/events')
    def get_events(project_id: str, after: int = 0, actor=Depends(authenticate)):
        authorize(actor, project_id)
        with engine.connect() as connection:
            return [dict(row) for row in connection.execute(select(events).where(events.c.project_id == project_id, events.c.sequence > after).order_by(events.c.sequence).limit(100)).mappings()]

    @app.get('/v1/projects/{project_id}/processing')
    def processing(project_id: str, actor=Depends(authenticate)):
        authorize(actor, project_id)
        with engine.connect() as connection:
            return [dict(row) for row in connection.execute(select(outbox.c.id, outbox.c.event_id, outbox.c.state, outbox.c.attempts, events.c.sequence).join(events, events.c.id == outbox.c.event_id).where(events.c.project_id == project_id, outbox.c.state != 'delivered').order_by(events.c.sequence).limit(100)).mappings()]

    @app.post('/v1/projects/{project_id}/processing/{message_id}/retry')
    def retry_message(project_id: str, message_id: str, idempotency_key: str = Header(default=''), actor=Depends(authenticate)):
        def operation(connection):
            row = connection.execute(select(outbox).join(events, events.c.id == outbox.c.event_id).where(outbox.c.id == message_id, events.c.project_id == project_id).with_for_update(of=outbox)).mappings().first()
            if row is None:
                raise HTTPException(404, 'Message not found')
            if row['state'] != 'failed':
                raise HTTPException(409, 'Only failed messages can be retried')
            connection.execute(update(outbox).where(outbox.c.id == message_id).values(state='pending', attempts=0))
            return {'id': message_id, 'state': 'pending', 'attempts': 0}
        return mutate(project_id, actor, idempotency_key, 'processing.retry_requested', {'message_id': message_id}, operation, permission='manage')

    from backlog import attach_backlog
    attach_backlog(app, engine, authenticate, authorize, mutate, forgejo)
    from chat import attach_chat
    attach_chat(app, engine, authenticate, authorize, mutate, chat_model)
    from portal import attach_portal
    attach_portal(app, engine, authenticate, portal_origin, allow_insecure_local)
    return app
