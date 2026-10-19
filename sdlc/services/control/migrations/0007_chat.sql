CREATE TABLE chat_conversations (
    id VARCHAR PRIMARY KEY,
    project_id VARCHAR NOT NULL REFERENCES projects(id),
    title VARCHAR NOT NULL,
    version INTEGER NOT NULL,
    summary TEXT NOT NULL,
    created_by VARCHAR NOT NULL REFERENCES identities(id)
);
CREATE TABLE chat_turns (
    id VARCHAR PRIMARY KEY,
    conversation_id VARCHAR NOT NULL REFERENCES chat_conversations(id),
    project_id VARCHAR NOT NULL REFERENCES projects(id),
    actor_id VARCHAR NOT NULL REFERENCES identities(id),
    user_text TEXT NOT NULL,
    state VARCHAR NOT NULL CHECK (state IN ('queued','running','completed','failed','cancelled')),
    attempts INTEGER NOT NULL,
    lease_token VARCHAR,
    lease_until INTEGER NOT NULL,
    prompt TEXT NOT NULL,
    prompt_hash VARCHAR NOT NULL,
    result TEXT,
    result_hash VARCHAR,
    model VARCHAR NOT NULL,
    model_digest VARCHAR,
    error_code VARCHAR,
    created_at VARCHAR NOT NULL,
    completed_at VARCHAR
);
CREATE TABLE chat_inference_slot (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    turn_id VARCHAR,
    lease_until INTEGER NOT NULL
);
INSERT INTO chat_inference_slot (id, turn_id, lease_until) VALUES (1, NULL, 0);
CREATE INDEX chat_turns_conversation ON chat_turns (conversation_id, created_at);
