CREATE TABLE work_items (
    id VARCHAR PRIMARY KEY,
    project_id VARCHAR NOT NULL REFERENCES projects(id),
    item_key VARCHAR NOT NULL,
    kind VARCHAR NOT NULL CHECK (kind IN ('outcome', 'epic', 'story')),
    parent_id VARCHAR REFERENCES work_items(id),
    version INTEGER NOT NULL CHECK (version > 0),
    payload TEXT NOT NULL,
    source_issue INTEGER NOT NULL,
    source_hash VARCHAR NOT NULL,
    source_state VARCHAR NOT NULL CHECK (source_state IN ('verified', 'diverged')),
    UNIQUE (project_id, item_key)
);
CREATE TABLE work_item_versions (
    item_id VARCHAR NOT NULL REFERENCES work_items(id),
    version INTEGER NOT NULL,
    payload TEXT NOT NULL,
    source_issue INTEGER NOT NULL,
    source_hash VARCHAR NOT NULL,
    PRIMARY KEY (item_id, version)
);
CREATE TABLE backlog_baselines (
    project_id VARCHAR PRIMARY KEY REFERENCES projects(id),
    object_id VARCHAR NOT NULL UNIQUE REFERENCES approval_objects(id)
);
