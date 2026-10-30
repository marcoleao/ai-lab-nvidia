BEGIN;
CREATE TABLE "MergeIntegrationReference" (
 id TEXT PRIMARY KEY,"operationId" TEXT NOT NULL UNIQUE REFERENCES "MergeOperation"(id) ON DELETE RESTRICT,
 "executionId" TEXT NOT NULL REFERENCES "StoryExecution"(id) ON DELETE RESTRICT,"storyId" TEXT NOT NULL REFERENCES "Item"(id) ON DELETE RESTRICT,
 "repositoryId" TEXT NOT NULL REFERENCES "Repository"(id) ON DELETE RESTRICT,"repositoryVersion" INTEGER NOT NULL CHECK("repositoryVersion">0),
 "projectId" INTEGER NOT NULL CHECK("projectId">0),iid INTEGER NOT NULL CHECK(iid>0),
 "sourceBranch" TEXT NOT NULL CHECK(length("sourceBranch") BETWEEN 1 AND 255),"targetBranch" TEXT NOT NULL CHECK(length("targetBranch") BETWEEN 1 AND 255),
 "sourceSha" TEXT NOT NULL CHECK("sourceSha" ~ '^([a-f0-9]{40}|[a-f0-9]{64})$'),
 "mergeCommitSha" TEXT CHECK("mergeCommitSha" IS NULL OR "mergeCommitSha" ~ '^([a-f0-9]{40}|[a-f0-9]{64})$'),
 "squashCommitSha" TEXT CHECK("squashCommitSha" IS NULL OR "squashCommitSha" ~ '^([a-f0-9]{40}|[a-f0-9]{64})$'),
 "integrationSha" TEXT CHECK("integrationSha" IS NOT DISTINCT FROM coalesce("mergeCommitSha","squashCommitSha")),
 "mergedAt" TIMESTAMP(3),"mergedBy" TEXT,"policyVersion" TEXT NOT NULL CHECK("policyVersion"='gitlab-merge-reference-v1'),
 "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "MergeIntegrationReference_storyId_observedAt_id_idx" ON "MergeIntegrationReference"("storyId","observedAt",id);
CREATE FUNCTION validate_merge_integration_reference() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE op "MergeOperation"; run "StoryExecution"; repo "Repository";
BEGIN
 SELECT * INTO op FROM "MergeOperation" WHERE id=NEW."operationId";
 SELECT * INTO run FROM "StoryExecution" WHERE id=NEW."executionId";
 SELECT * INTO repo FROM "Repository" WHERE id=NEW."repositoryId";
 IF op.state<>'succeeded' OR run.state<>'succeeded' OR op."executionId"<>run.id OR op."storyId"<>NEW."storyId" OR run."storyId"<>NEW."storyId"
 OR run."repositoryId"<>repo.id OR repo.version<>NEW."repositoryVersion" OR repo."gitlabProjectId" IS DISTINCT FROM NEW."projectId"
 OR op."projectId"<>NEW."projectId" OR op.iid<>NEW.iid OR op.sha<>NEW."sourceSha" OR run."commitSha" IS DISTINCT FROM NEW."sourceSha"
 OR op."sourceBranch"<>NEW."sourceBranch" OR op."targetBranch"<>NEW."targetBranch" THEN
 RAISE EXCEPTION 'Integration reference must match the observed successful delivery and repository'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER merge_integration_reference_scope BEFORE INSERT ON "MergeIntegrationReference" FOR EACH ROW EXECUTE FUNCTION validate_merge_integration_reference();
CREATE TRIGGER merge_integration_reference_immutable BEFORE UPDATE OR DELETE ON "MergeIntegrationReference" FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TRIGGER merge_integration_reference_no_truncate BEFORE TRUNCATE ON "MergeIntegrationReference" FOR EACH STATEMENT EXECUTE FUNCTION prevent_history_mutation();
REVOKE ALL ON "MergeIntegrationReference" FROM sdlc_portal_app;
GRANT SELECT,INSERT ON "MergeIntegrationReference" TO sdlc_portal_app;
COMMIT;
