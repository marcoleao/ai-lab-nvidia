"""Single local consumer. All effects are transactional in the same database."""
from datetime import datetime, timezone
import json

from sqlalchemy import Column, Integer, MetaData, String, Table, insert, select, update
from control import events

metadata = MetaData()
queue = Table('outbox', metadata, Column('id', String, primary_key=True), Column('event_id', String), Column('state', String), Column('attempts', Integer))
inbox = Table('event_inbox', metadata, Column('event_id', String, primary_key=True), Column('project_id', String), Column('sequence', Integer), Column('kind', String), Column('processed_at', String))


def index_event(connection, event):
    existing = connection.execute(select(inbox.c.event_id).where(inbox.c.event_id == event['id'])).first()
    if existing is None:
        connection.execute(insert(inbox).values(event_id=event['id'], project_id=event['project_id'], sequence=event['sequence'], kind=json.loads(event['payload'])['kind'], processed_at=datetime.now(timezone.utc).isoformat()))


def process_one(engine):
    """Return idle/delivered/retry/failed. No HTTP, shell or external effects."""
    with engine.begin() as connection:
        row = connection.execute(select(queue).where(queue.c.state == 'pending').order_by(queue.c.id).with_for_update(skip_locked=True).limit(1)).mappings().first()
        if row is None:
            return 'idle'
        try:
            # Savepoint rolls back the projection on error, retaining queue lock.
            with connection.begin_nested():
                event = connection.execute(select(events).where(events.c.id == row['event_id'])).mappings().one()
                index_event(connection, event)
        except Exception:
            attempts = row['attempts'] + 1
            state = 'failed' if attempts >= 3 else 'pending'
            connection.execute(update(queue).where(queue.c.id == row['id']).values(attempts=attempts, state=state))
            return 'failed' if state == 'failed' else 'retry'
        connection.execute(update(queue).where(queue.c.id == row['id']).values(state='delivered'))
        return 'delivered'
