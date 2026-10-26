-- Additive source storage only. Existing business records and approvals are not
-- reconstructed or silently changed when the schema is installed.
CREATE TABLE "StorySpecificationDraft" (
  "storyId" TEXT PRIMARY KEY REFERENCES "Item"(id) ON DELETE RESTRICT,
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
  "baseRevision" INTEGER NOT NULL DEFAULT 0 CHECK ("baseRevision" >= 0),
  "content" JSONB NOT NULL,
  "actorId" TEXT NOT NULL,
  "actorName" TEXT NOT NULL,
  "source" TEXT NOT NULL CHECK ("source" IN ('human', 'agent')),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "StorySpecificationRevision" (
  id TEXT PRIMARY KEY,
  "storyId" TEXT NOT NULL REFERENCES "Item"(id) ON DELETE RESTRICT,
  "number" INTEGER NOT NULL CHECK ("number" > 0),
  "content" JSONB NOT NULL,
  "actorId" TEXT NOT NULL,
  "actorName" TEXT NOT NULL,
  "source" TEXT NOT NULL CHECK ("source" IN ('human', 'agent')),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("storyId", "number")
);
CREATE INDEX "StorySpecificationRevision_storyId_createdAt_id_idx"
  ON "StorySpecificationRevision" ("storyId", "createdAt", id);
CREATE TRIGGER story_specification_append_only BEFORE UPDATE OR DELETE
  ON "StorySpecificationRevision" FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TRIGGER story_specification_no_truncate BEFORE TRUNCATE
  ON "StorySpecificationRevision" FOR EACH STATEMENT EXECUTE FUNCTION prevent_history_mutation();
GRANT SELECT, INSERT, UPDATE ON "StorySpecificationDraft" TO sdlc_portal_app;
GRANT SELECT, INSERT ON "StorySpecificationRevision" TO sdlc_portal_app;
ALTER TABLE "WorkActivity" ALTER COLUMN "taskId" DROP NOT NULL;
CREATE TABLE "FlowPolicyInstallation" (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "FlowPolicyInstallation" (id, version) VALUES (1, 'flow-stabilization-v1');
GRANT SELECT ON "FlowPolicyInstallation" TO sdlc_portal_app;
CREATE TABLE "TaskResultRevision" (
  id TEXT PRIMARY KEY,
  "taskId" TEXT NOT NULL REFERENCES "Item"(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK (version > 0),
  summary TEXT NOT NULL,
  evidence JSONB NOT NULL,
  "actorId" TEXT NOT NULL,
  "actorName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("taskId", version)
);
CREATE INDEX "TaskResultRevision_taskId_createdAt_id_idx" ON "TaskResultRevision" ("taskId", "createdAt", id);
CREATE TRIGGER task_result_append_only BEFORE UPDATE OR DELETE
  ON "TaskResultRevision" FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TRIGGER task_result_no_truncate BEFORE TRUNCATE
  ON "TaskResultRevision" FOR EACH STATEMENT EXECUTE FUNCTION prevent_history_mutation();
GRANT SELECT, INSERT ON "TaskResultRevision" TO sdlc_portal_app;
