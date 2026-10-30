BEGIN;
CREATE TABLE "DevelopmentBuild" (
 id TEXT PRIMARY KEY,"storyId" TEXT NOT NULL REFERENCES "Item"(id) ON DELETE RESTRICT,"systemId" TEXT NOT NULL REFERENCES "Item"(id) ON DELETE RESTRICT,
 "executionId" TEXT NOT NULL REFERENCES "StoryExecution"(id) ON DELETE RESTRICT,"integrationReferenceId" TEXT NOT NULL REFERENCES "MergeIntegrationReference"(id) ON DELETE RESTRICT,
 "repositoryId" TEXT NOT NULL REFERENCES "Repository"(id) ON DELETE RESTRICT,"repositoryVersion" INTEGER NOT NULL,"projectId" INTEGER NOT NULL,
 number INTEGER NOT NULL CHECK(number>0),"sourceSha" TEXT NOT NULL CHECK("sourceSha" ~ '^([a-f0-9]{40}|[a-f0-9]{64})$'),"targetBranch" TEXT NOT NULL,
 "contractDigest" TEXT NOT NULL CHECK("contractDigest" ~ '^[a-f0-9]{64}$'),"unitId" TEXT NOT NULL,"baseImageId" TEXT NOT NULL CHECK("baseImageId" ~ '^sha256:[a-f0-9]{64}$'),"policyVersion" TEXT NOT NULL CHECK("policyVersion"='node24-react-v1'),
 reason TEXT NOT NULL CHECK(length(btrim(reason)) BETWEEN 10 AND 2000),"actorId" TEXT NOT NULL,"actorName" TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','paused','blocked','failed','unknown','succeeded','cancelled')),version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),message TEXT NOT NULL,
 "leaseId" TEXT,"leaseUntil" TIMESTAMP(3),"dispatchStartedAt" TIMESTAMP(3),"startedAt" TIMESTAMP(3),"finishedAt" TIMESTAMP(3),
 "imageId" TEXT CHECK("imageId" IS NULL OR "imageId" ~ '^sha256:[a-f0-9]{64}$'),"archiveDigest" TEXT CHECK("archiveDigest" IS NULL OR "archiveDigest" ~ '^[a-f0-9]{64}$'),"artifactSize" INTEGER,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("storyId",number),CHECK(state<>'succeeded' OR ("imageId" IS NOT NULL AND "archiveDigest" IS NOT NULL AND "artifactSize">0 AND "finishedAt" IS NOT NULL AND "dispatchStartedAt" IS NOT NULL))
);
CREATE INDEX "DevelopmentBuild_state_createdAt_idx" ON "DevelopmentBuild"(state,"createdAt");
CREATE UNIQUE INDEX "DevelopmentBuild_one_pending" ON "DevelopmentBuild"("storyId") WHERE state IN ('queued','running','paused','unknown');
CREATE FUNCTION validate_development_build() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r "MergeIntegrationReference";e "StoryExecution";repo "Repository";
BEGIN
 IF TG_OP='INSERT' THEN
  SELECT * INTO r FROM "MergeIntegrationReference" WHERE id=NEW."integrationReferenceId";SELECT * INTO e FROM "StoryExecution" WHERE id=NEW."executionId";SELECT * INTO repo FROM "Repository" WHERE id=NEW."repositoryId";
  IF r.id IS NULL OR r."storyId"<>NEW."storyId" OR r."executionId"<>e.id OR e."repositoryId"<>repo.id OR r."repositoryId"<>repo.id OR r."projectId"<>NEW."projectId" OR repo."gitlabProjectId"<>NEW."projectId" OR repo.version<>NEW."repositoryVersion" OR repo."systemId"<>NEW."systemId" OR r."integrationSha" IS NULL OR NEW.number<>coalesce((SELECT max(number)+1 FROM "DevelopmentBuild" WHERE "storyId"=NEW."storyId"),1) THEN RAISE EXCEPTION 'Build requires exact Story integration and System repository'; END IF;
 ELSE
  IF (to_jsonb(NEW)-ARRAY['state','version','message','leaseId','leaseUntil','dispatchStartedAt','startedAt','finishedAt','imageId','archiveDigest','artifactSize','updatedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version','message','leaseId','leaseUntil','dispatchStartedAt','startedAt','finishedAt','imageId','archiveDigest','artifactSize','updatedAt']) OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Preserve build intent and version'; END IF;
  IF OLD."dispatchStartedAt" IS NOT NULL AND NEW."dispatchStartedAt" IS DISTINCT FROM OLD."dispatchStartedAt" OR OLD."imageId" IS NOT NULL AND NEW."imageId" IS DISTINCT FROM OLD."imageId" OR OLD."archiveDigest" IS NOT NULL AND NEW."archiveDigest" IS DISTINCT FROM OLD."archiveDigest" OR OLD.state='succeeded' AND NEW.state<>'succeeded' THEN RAISE EXCEPTION 'Preserve known build effects'; END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER development_build_validate BEFORE INSERT OR UPDATE ON "DevelopmentBuild" FOR EACH ROW EXECUTE FUNCTION validate_development_build();
CREATE TRIGGER development_build_no_delete BEFORE DELETE ON "DevelopmentBuild" FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TRIGGER development_build_no_truncate BEFORE TRUNCATE ON "DevelopmentBuild" FOR EACH STATEMENT EXECUTE FUNCTION prevent_history_mutation();
GRANT SELECT,INSERT,UPDATE ON "DevelopmentBuild" TO sdlc_portal_app;
COMMIT;
