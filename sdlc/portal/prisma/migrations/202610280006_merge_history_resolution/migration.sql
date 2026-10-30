BEGIN;
CREATE TABLE "MergeHistoryResolution" (
 id TEXT PRIMARY KEY,"operationId" TEXT NOT NULL UNIQUE REFERENCES "MergeOperation"(id) ON DELETE RESTRICT,
 "executionId" TEXT NOT NULL REFERENCES "StoryExecution"(id) ON DELETE RESTRICT,"storyId" TEXT NOT NULL REFERENCES "Item"(id) ON DELETE RESTRICT,
 "repositoryId" TEXT NOT NULL REFERENCES "Repository"(id) ON DELETE RESTRICT,"repositoryVersion" INTEGER NOT NULL CHECK("repositoryVersion">0),
 "projectId" INTEGER NOT NULL CHECK("projectId">0),iid INTEGER NOT NULL CHECK(iid>0),
 "sourceBranch" TEXT NOT NULL CHECK(length("sourceBranch") BETWEEN 1 AND 255),"targetBranch" TEXT NOT NULL CHECK(length("targetBranch") BETWEEN 1 AND 255),
 "sourceSha" TEXT NOT NULL CHECK("sourceSha" ~ '^([a-f0-9]{40}|[a-f0-9]{64})$'),
 "observedState" TEXT NOT NULL CHECK("observedState"='closed'),"observedAt" TIMESTAMP(3) NOT NULL,"decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "actorId" TEXT NOT NULL,"actorName" TEXT NOT NULL,reason TEXT NOT NULL CHECK(length(btrim(reason)) BETWEEN 10 AND 2000),
 "policyVersion" TEXT NOT NULL CHECK("policyVersion"='gitlab-closed-mr-observation-v1')
);
CREATE INDEX "MergeHistoryResolution_storyId_decidedAt_id_idx" ON "MergeHistoryResolution"("storyId","decidedAt",id);
CREATE FUNCTION validate_merge_history_resolution() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE op "MergeOperation"; run "StoryExecution"; repo "Repository";
BEGIN
 SELECT * INTO op FROM "MergeOperation" WHERE id=NEW."operationId";
 SELECT * INTO run FROM "StoryExecution" WHERE id=NEW."executionId";
 SELECT * INTO repo FROM "Repository" WHERE id=NEW."repositoryId";
 IF op.state<>'cancelled' OR run.state<>'succeeded' OR op."executionId"<>run.id OR op."storyId"<>NEW."storyId" OR run."storyId"<>NEW."storyId"
 OR run."repositoryId"<>repo.id OR repo.version<>NEW."repositoryVersion" OR repo."gitlabProjectId" IS DISTINCT FROM NEW."projectId"
 OR op."projectId"<>NEW."projectId" OR op.iid<>NEW.iid OR op.sha<>NEW."sourceSha" OR run."commitSha" IS DISTINCT FROM NEW."sourceSha"
 OR op."sourceBranch"<>NEW."sourceBranch" OR op."targetBranch"<>NEW."targetBranch"
 OR EXISTS(SELECT 1 FROM "MergeIntegrationReference" WHERE "operationId"=op.id)
 THEN RAISE EXCEPTION 'Historical closure must match the observed closed operation without recorded integration'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER merge_history_resolution_scope BEFORE INSERT ON "MergeHistoryResolution" FOR EACH ROW EXECUTE FUNCTION validate_merge_history_resolution();
CREATE TRIGGER merge_history_resolution_immutable BEFORE UPDATE OR DELETE ON "MergeHistoryResolution" FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TRIGGER merge_history_resolution_no_truncate BEFORE TRUNCATE ON "MergeHistoryResolution" FOR EACH STATEMENT EXECUTE FUNCTION prevent_history_mutation();
REVOKE ALL ON "MergeHistoryResolution" FROM sdlc_portal_app;
GRANT SELECT,INSERT ON "MergeHistoryResolution" TO sdlc_portal_app;
COMMIT;
