"""Read-only post-reset check. Never creates demonstration records."""
import json
import psycopg
from runtime import database_url

tables=('projects','runs','approvals','events','commands','outbox','approval_objects','memberships','security_events','event_inbox','browser_sessions','work_items','work_item_versions','backlog_baselines','chat_conversations','chat_turns')
with psycopg.connect(database_url('owner').render_as_string(hide_password=False).replace('postgresql+psycopg:', 'postgresql:')) as connection:
    counts={table:connection.execute('SELECT COUNT(*) FROM '+table).fetchone()[0] for table in tables}
    assert not any(counts.values()), 'Business data remains'
    assert connection.execute('SELECT COUNT(*) FROM identities').fetchone()[0] == 3
    assert connection.execute('SELECT COUNT(*) FROM credentials').fetchone()[0] == 3
    assert connection.execute('SELECT turn_id,lease_until FROM chat_inference_slot WHERE id=1').fetchone() == (None,0)
print(json.dumps({'business_records':counts,'installed_access':'preserved','status':'empty'},indent=2))
