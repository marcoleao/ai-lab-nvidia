BEGIN;
CREATE TABLE "DevelopmentAiTest" (
 id TEXT PRIMARY KEY,"storyId" TEXT NOT NULL,"referenceDigest" TEXT NOT NULL,"specificationId" TEXT NOT NULL,"executionId" TEXT NOT NULL,"deploymentId" TEXT NOT NULL REFERENCES "DevelopmentDeployment"(id),"buildId" TEXT NOT NULL REFERENCES "DevelopmentBuild"(id),"environmentId" TEXT NOT NULL,"sourceSha" TEXT NOT NULL,"imageId" TEXT NOT NULL,number INTEGER NOT NULL,version INTEGER NOT NULL DEFAULT 1,state TEXT NOT NULL DEFAULT 'queued',stage TEXT NOT NULL DEFAULT 'queued',message TEXT NOT NULL,"actorId" TEXT NOT NULL,"actorName" TEXT NOT NULL,context JSONB NOT NULL,cases JSONB NOT NULL DEFAULT '[]',proof JSONB,adjustments TEXT,"leaseId" TEXT,"leaseUntil" TIMESTAMP(3),"dispatchStartedAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,"finishedAt" TIMESTAMP(3),
 CONSTRAINT ai_dev_state CHECK(state IN ('queued','running','succeeded','failed','inconclusive','unknown','stale')),
 CONSTRAINT ai_dev_version CHECK(version>0 AND number>0),CONSTRAINT ai_dev_adjustments CHECK(adjustments IS NULL OR length(adjustments)<=1800),CONSTRAINT ai_dev_cases CHECK(jsonb_typeof(cases)='array')
);
CREATE UNIQUE INDEX "DevelopmentAiTest_storyId_number_key" ON "DevelopmentAiTest"("storyId",number);
CREATE INDEX "DevelopmentAiTest_state_createdAt_idx" ON "DevelopmentAiTest"(state,"createdAt");
CREATE INDEX "DevelopmentAiTest_environmentId_state_idx" ON "DevelopmentAiTest"("environmentId",state);
CREATE FUNCTION retain_ai_dev_test_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Retain AI test evidence';END IF;
 IF (to_jsonb(NEW)-ARRAY['version','state','stage','message','cases','proof','adjustments','leaseId','leaseUntil','dispatchStartedAt','updatedAt','finishedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['version','state','stage','message','cases','proof','adjustments','leaseId','leaseUntil','dispatchStartedAt','updatedAt','finishedAt']) THEN RAISE EXCEPTION 'Retain frozen AI test source';END IF;
 IF OLD.state IN ('succeeded','failed','inconclusive','stale') AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN RAISE EXCEPTION 'Retain terminal AI test result';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER retain_ai_dev_test BEFORE UPDATE OR DELETE ON "DevelopmentAiTest" FOR EACH ROW EXECUTE FUNCTION retain_ai_dev_test_source();
GRANT SELECT,INSERT,UPDATE ON "DevelopmentAiTest" TO sdlc_portal_app;
COMMIT;
