BEGIN;
ALTER TABLE "ChatTurn" ADD COLUMN kind TEXT NOT NULL DEFAULT 'chat' CHECK(kind IN ('chat','plan'));
CREATE TABLE "PlanProposal" (
 id TEXT PRIMARY KEY, "turnId" TEXT NOT NULL UNIQUE REFERENCES "ChatTurn"(id) ON DELETE RESTRICT,
 "projectId" TEXT NOT NULL REFERENCES "Item"(id) ON DELETE RESTRICT,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','applied')),version INTEGER NOT NULL DEFAULT 1,
 "projectVersion" INTEGER NOT NULL,"sessionVersion" INTEGER NOT NULL,"contextFingerprint" TEXT NOT NULL,
 content JSONB NOT NULL,"appliedItemIds" JSONB NOT NULL DEFAULT '[]',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "PlanRevision" (
 "proposalId" TEXT NOT NULL REFERENCES "PlanProposal"(id) ON DELETE RESTRICT,
 version INTEGER NOT NULL,content JSONB NOT NULL,"actorId" TEXT NOT NULL,"actorName" TEXT NOT NULL,source TEXT NOT NULL CHECK(source IN ('model','human')),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY("proposalId",version)
);
CREATE TRIGGER plan_revision_append_only BEFORE UPDATE OR DELETE ON "PlanRevision" FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE FUNCTION validate_plan_project() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "Item" i JOIN "ChatSession" s ON s."contextId"=i.id JOIN "ChatTurn" t ON t."sessionId"=s.id WHERE i.id=NEW."projectId" AND i.kind='project' AND t.id=NEW."turnId" AND t.kind='plan') THEN RAISE EXCEPTION 'Proposal must belong to the turn project'; END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER plan_project BEFORE INSERT OR UPDATE ON "PlanProposal" FOR EACH ROW EXECUTE FUNCTION validate_plan_project();
COMMIT;
