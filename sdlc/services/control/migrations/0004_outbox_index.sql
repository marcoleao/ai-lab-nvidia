ALTER TABLE outbox ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
CREATE TABLE event_inbox (event_id VARCHAR PRIMARY KEY REFERENCES events(id), project_id VARCHAR NOT NULL REFERENCES projects(id), sequence INTEGER NOT NULL, kind VARCHAR NOT NULL, processed_at VARCHAR NOT NULL, UNIQUE(project_id, sequence));
