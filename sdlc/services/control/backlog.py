"""Versioned backlog. Forgejo effects are reconciled by deterministic markers.

No agent/tool execution. Issues are append-only per proposed item version;
failed local transactions recover a previously created remote issue on retry.
"""
import json
import logging
import time
from uuid import NAMESPACE_URL, uuid5

import httpx
from fastapi import Depends, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import Column, Integer, MetaData, String, Table, Text, insert, select, update

metadata = MetaData()
items = Table('work_items', metadata, Column('id', String, primary_key=True), Column('project_id', String), Column('item_key', String), Column('kind', String), Column('parent_id', String), Column('version', Integer), Column('payload', Text), Column('source_issue', Integer), Column('source_hash', String), Column('source_state', String))
versions = Table('work_item_versions', metadata, Column('item_id', String, primary_key=True), Column('version', Integer, primary_key=True), Column('payload', Text), Column('source_issue', Integer), Column('source_hash', String))
baselines = Table('backlog_baselines', metadata, Column('project_id', String, primary_key=True), Column('object_id', String))
TARGET = 'backlog-scope'
POLICY = {'contract': 'backlog-v1', 'canonical': 'forgejo', 'hierarchy': ['outcome', 'epic', 'story'], 'human_approval': True}


class ItemInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    kind: str = Field(pattern=r'^(outcome|epic|story)$')
    parent_id: str | None = Field(default=None, max_length=100)
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(min_length=1, max_length=4000)
    measure: str = Field(default='', max_length=1000)
    criteria: list[str] = Field(default_factory=list, max_length=20)

    @field_validator('title', 'description', 'measure')
    @classmethod
    def trim(cls, value, info):
        value = value.strip()
        if info.field_name != 'measure' and not value:
            raise ValueError('Required text cannot be blank')
        return value

    @field_validator('criteria')
    @classmethod
    def criteria_text(cls, values):
        if any(not value.strip() or len(value) > 500 for value in values):
            raise ValueError('Each acceptance criterion needs 1-500 characters')
        return [value.strip() for value in values]


class ItemUpdate(ItemInput):
    expected_version: int = Field(ge=1)


class Forgejo:
    """Fixed internal destination; no user-controlled URL, redirects or proxy."""
    def __init__(self, token, *, transport=None):
        self.client = httpx.Client(base_url='http://forgejo:3000/api/v1', headers={'Authorization': f'token {token}'}, timeout=5, follow_redirects=False, trust_env=False, transport=transport)

    def request(self, method, path, *, accepted=(200,), **kwargs):
        try:
            response = self.client.request(method, path, **kwargs)
            if response.status_code not in accepted:
                logging.getLogger('backlog').warning('Forgejo %s %s returned HTTP %s', method, path, response.status_code)
                raise HTTPException(503, 'Backlog source unavailable; no local change committed')
            return response.json() if response.content else None
        except (httpx.HTTPError, ValueError):
            raise HTTPException(503, 'Backlog source unavailable; retry the same command') from None

    @staticmethod
    def repository(project_id):
        from uuid import UUID
        return f'/repos/sdlc-backlog/p-{UUID(project_id).hex}'

    def ensure_repository(self, project_id):
        path = self.repository(project_id)
        # Creation is idempotent by repository name; a conflict still needs GET.
        try:
            response = self.client.get(path)
            if response.status_code == 404:
                self.request('POST', '/user/repos', accepted=(201, 409), json={'name': path.rsplit('/', 1)[1], 'private': True, 'auto_init': False})
            elif response.status_code != 200:
                logging.getLogger('backlog').warning('Forgejo repository lookup returned HTTP %s', response.status_code)
                raise HTTPException(503, 'Backlog repository unavailable')
            repo = self.request('GET', path)
            if not repo.get('private'):
                raise HTTPException(409, 'Backlog repository must remain private')
        except httpx.HTTPError:
            raise HTTPException(503, 'Backlog repository unavailable') from None

    def publish(self, payload):
        from control import canonical
        path = self.repository(payload['project_id']) + '/issues'
        title = f"[{payload['item_key']}] {payload['title']} · v{payload['version']}"
        marker = f"<!-- sdlc:{payload['id']}:{payload['version']} -->"
        body = marker + '\n```json\n' + canonical(payload) + '\n```'
        found = []
        deadline = time.monotonic() + 10
        # Search all pages, including closed issues, before any create.
        for page in range(1, 101):
            if time.monotonic() > deadline:
                raise HTTPException(503, 'Source reconciliation timed out; retry the same command')
            batch = self.request('GET', path, params={'state': 'all', 'type': 'issues', 'limit': 50, 'page': page})
            found.extend(issue for issue in batch if (issue.get('body') or '').split('\n', 1)[0] == marker)
            if len(batch) < 50:
                break
        else:
            raise HTTPException(409, 'Backlog exceeds reconciliation search budget')
        if len(found) > 1:
            raise HTTPException(409, 'Duplicate source markers require human reconciliation')
        if found:
            issue = found[0]
            if issue['title'] != title or issue['body'] != body or issue['state'] != 'open':
                raise HTTPException(409, 'Previously published proposal differs; reconcile before retrying')
        else:
            issue = self.request('POST', path, accepted=(201,), json={'title': title, 'body': body})
        if issue['title'] != title or issue['body'] != body or issue['state'] != 'open':
            raise HTTPException(409, 'Source did not preserve the proposed content')
        return issue['number'], self.source_hash(issue)

    @staticmethod
    def source_hash(issue):
        from control import digest
        return digest({'title': issue['title'], 'body': issue.get('body') or '', 'state': issue['state']})

    def verify(self, row):
        issue = self.request('GET', self.repository(row['project_id']) + f"/issues/{row['source_issue']}", accepted=(200, 404))
        if not isinstance(issue, dict) or 'number' not in issue:
            return False
        return self.source_hash(issue) == row['source_hash']


def project_rows(connection, project_id):
    return list(connection.execute(select(items).where(items.c.project_id == project_id).order_by(items.c.item_key)).mappings())


def scope_payload(rows):
    from control import digest
    return {'contract': 'backlog-v1', 'items': [{'id': row['id'], 'item_key': row['item_key'], 'version': row['version'], 'content_hash': digest(json.loads(row['payload'])), 'source_issue': row['source_issue'], 'source_hash': row['source_hash'], 'source_state': row['source_state']} for row in rows]}


def refresh_baseline(connection, project_id):
    from control import canonical, digest, objects
    payload = scope_payload(project_rows(connection, project_id))
    policy_hash = digest(POLICY)
    content_hash = digest({'payload': payload, 'target': TARGET, 'policy_hash': policy_hash})
    baseline = connection.execute(select(baselines).where(baselines.c.project_id == project_id)).mappings().first()
    if baseline:
        obj = connection.execute(select(objects).where(objects.c.id == baseline['object_id'])).mappings().one()
        if obj['hash'] == content_hash:
            return dict(obj)
        value = {**dict(obj), 'version': obj['version'] + 1, 'payload': canonical(payload), 'hash': content_hash}
        connection.execute(update(objects).where(objects.c.id == obj['id']).values(version=value['version'], payload=value['payload'], hash=content_hash))
    else:
        object_id = str(uuid5(NAMESPACE_URL, f'sdlc-backlog-baseline:{project_id}'))
        value = {'id': object_id, 'project_id': project_id, 'version': 1, 'payload': canonical(payload), 'hash': content_hash, 'target': TARGET, 'policy_hash': policy_hash}
        connection.execute(insert(objects).values(**value))
        connection.execute(insert(baselines).values(project_id=project_id, object_id=object_id))
    return value


def assert_scope_current(connection, obj, forgejo):
    """Call on decisions and validity reads; never trust cached sync status."""
    from control import digest
    if forgejo is None:
        raise HTTPException(503, 'Backlog integration unavailable')
    rows = project_rows(connection, obj['project_id'])
    if not rows or {row['kind'] for row in rows} != {'outcome', 'epic', 'story'}:
        raise HTTPException(409, 'Scope needs outcomes, epics and stories')
    parents = {row['parent_id'] for row in rows}
    if any(row['kind'] != 'story' and row['id'] not in parents for row in rows):
        raise HTTPException(409, 'Each outcome needs an epic and each epic needs a story')
    if json.loads(obj['payload']) != scope_payload(rows) or obj['policy_hash'] != digest(POLICY):
        raise HTTPException(409, 'Scope snapshot changed')
    deadline = time.monotonic() + 12
    for row in rows:
        if time.monotonic() > deadline:
            raise HTTPException(503, 'Scope verification timed out; no authorization granted')
        if row['source_state'] != 'verified' or not forgejo.verify(row):
            raise HTTPException(409, 'Source changed; reconcile the backlog and review a new version')


def attach_backlog(app, engine, authenticate, authorize, mutate, forgejo):
    from control import canonical, objects

    def source():
        if forgejo is None:
            raise HTTPException(503, 'Backlog integration not configured')
        return forgejo

    def validate_parent(connection, project_id, body):
        if body.kind == 'outcome':
            if body.parent_id is not None or not body.measure:
                raise HTTPException(422, 'Outcome needs a measurable target and no parent')
        else:
            parent = connection.execute(select(items).where(items.c.id == body.parent_id, items.c.project_id == project_id)).mappings().first()
            if not parent or parent['kind'] != {'epic': 'outcome', 'story': 'epic'}[body.kind]:
                raise HTTPException(422, 'Parent must belong to this project and the preceding hierarchy level')
            if body.kind == 'story' and not body.criteria:
                raise HTTPException(422, 'Story needs acceptance criteria')

    def save(connection, project_id, payload):
        service = source()
        service.ensure_repository(project_id)
        number, source_hash = service.publish(payload)
        value = {'id': payload['id'], 'project_id': project_id, 'item_key': payload['item_key'], 'kind': payload['kind'], 'parent_id': payload['parent_id'], 'version': payload['version'], 'payload': canonical(payload), 'source_issue': number, 'source_hash': source_hash, 'source_state': 'verified'}
        if payload['version'] == 1:
            connection.execute(insert(items).values(**value))
        else:
            connection.execute(update(items).where(items.c.id == payload['id']).values(**value))
        connection.execute(insert(versions).values(item_id=payload['id'], version=payload['version'], payload=value['payload'], source_issue=number, source_hash=source_hash))
        baseline = refresh_baseline(connection, project_id)
        return {**value, 'payload': payload, 'scope_object_id': baseline['id'], 'scope_version': baseline['version'], 'scope_hash': baseline['hash']}

    @app.get('/v1/projects/{project_id}/work-items')
    def listing(project_id: str, actor=Depends(authenticate)):
        authorize(actor, project_id)
        with engine.connect() as connection:
            rows = project_rows(connection, project_id)
            baseline = connection.execute(select(objects).join(baselines, baselines.c.object_id == objects.c.id).where(baselines.c.project_id == project_id)).mappings().first()
            return {'items': [{**dict(row), 'payload': json.loads(row['payload'])} for row in rows], 'scope': {**dict(baseline), 'payload': json.loads(baseline['payload'])} if baseline else None, 'configured': forgejo is not None}

    @app.get('/v1/projects/{project_id}/work-items/{item_id}/versions')
    def history(project_id: str, item_id: str, actor=Depends(authenticate)):
        authorize(actor, project_id)
        with engine.connect() as connection:
            row = connection.execute(select(items).where(items.c.id == item_id, items.c.project_id == project_id)).first()
            if not row:
                raise HTTPException(404, 'Work item not found')
            return [{**dict(row), 'payload': json.loads(row['payload'])} for row in connection.execute(select(versions).where(versions.c.item_id == item_id).order_by(versions.c.version)).mappings()]

    @app.post('/v1/projects/{project_id}/work-items')
    def create(project_id: str, body: ItemInput, idempotency_key: str = Header(default=''), actor=Depends(authenticate)):
        def operation(connection):
            rows = project_rows(connection, project_id)
            if len(rows) >= 100:
                raise HTTPException(409, 'Pilot backlog limit: 100 items per project')
            validate_parent(connection, project_id, body)
            prefix = {'outcome': 'OUT', 'epic': 'EP', 'story': 'US'}[body.kind]
            key = f'{prefix}-{1 + sum(row["kind"] == body.kind for row in rows):03d}'
            item_id = str(uuid5(NAMESPACE_URL, f'sdlc-work-item:{actor["id"]}:{project_id}:{idempotency_key}'))
            return save(connection, project_id, {**body.model_dump(), 'id': item_id, 'project_id': project_id, 'item_key': key, 'version': 1})
        return mutate(project_id, actor, idempotency_key, 'backlog.item_created', body.model_dump(), operation)

    @app.put('/v1/projects/{project_id}/work-items/{item_id}')
    def edit(project_id: str, item_id: str, body: ItemUpdate, idempotency_key: str = Header(default=''), actor=Depends(authenticate)):
        def operation(connection):
            row = connection.execute(select(items).where(items.c.id == item_id, items.c.project_id == project_id)).mappings().first()
            if not row:
                raise HTTPException(404, 'Work item not found')
            if row['version'] != body.expected_version:
                raise HTTPException(409, 'Stale work item version')
            if (row['kind'], row['parent_id']) != (body.kind, body.parent_id):
                raise HTTPException(409, 'Type and parent are immutable; propose a new item')
            validate_parent(connection, project_id, body)
            return save(connection, project_id, {**body.model_dump(exclude={'expected_version'}), 'id': item_id, 'project_id': project_id, 'item_key': row['item_key'], 'version': row['version'] + 1})
        return mutate(project_id, actor, idempotency_key, 'backlog.item_updated', {'item_id': item_id, **body.model_dump()}, operation)

    @app.post('/v1/projects/{project_id}/backlog/reconcile')
    def reconcile(project_id: str, idempotency_key: str = Header(default=''), actor=Depends(authenticate)):
        def operation(connection):
            service = source()
            changed = []
            deadline = time.monotonic() + 12
            for row in project_rows(connection, project_id):
                if time.monotonic() > deadline:
                    raise HTTPException(503, 'Backlog reconciliation timed out; retry the same command')
                state = 'verified' if service.verify(row) else 'diverged'
                if state != row['source_state']:
                    connection.execute(update(items).where(items.c.id == row['id']).values(source_state=state))
                    changed.append({'item_id': row['id'], 'source_state': state})
            baseline = refresh_baseline(connection, project_id)
            return {'changed': changed, 'scope_object_id': baseline['id'], 'scope_version': baseline['version'], 'scope_hash': baseline['hash']}
        return mutate(project_id, actor, idempotency_key, 'backlog.reconciled', {}, operation, permission='manage')
