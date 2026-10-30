BEGIN;
CREATE TABLE "ReleaseBranchPreparation" (
 id TEXT PRIMARY KEY,"releaseId" TEXT NOT NULL REFERENCES "Release"(id) ON DELETE RESTRICT,
 number INTEGER NOT NULL CHECK(number>0),"decisionId" TEXT NOT NULL REFERENCES "ReleaseBranchPlanDecision"(id) ON DELETE RESTRICT,
 "releaseRecordVersion" INTEGER NOT NULL,"compositionRevisionId" TEXT NOT NULL REFERENCES "ReleaseCompositionRevision"(id) ON DELETE RESTRICT,
 "repositoryId" TEXT NOT NULL REFERENCES "Repository"(id) ON DELETE RESTRICT,"repositoryRecordVersion" INTEGER NOT NULL,"gitlabProjectId" INTEGER NOT NULL,
 "branchName" TEXT NOT NULL,"defaultBranch" TEXT NOT NULL,"baseSha" TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','succeeded','blocked','unknown')),
 message TEXT NOT NULL,"actorId" TEXT NOT NULL,"actorName" TEXT NOT NULL,
 "leaseId" TEXT,"leaseUntil" TIMESTAMP(3),"writeStartedAt" TIMESTAMP(3),"reconcileOnly" BOOLEAN NOT NULL DEFAULT false,
 "observedSha" TEXT,"protectionReady" BOOLEAN NOT NULL DEFAULT false,"confirmedAt" TIMESTAMP(3),"checkedAt" TIMESTAMP(3),"errorCode" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("releaseId",number),CHECK(("leaseId" IS NULL)=("leaseUntil" IS NULL)),
 CHECK("observedSha" IS NULL OR "observedSha" ~ '^([a-f0-9]{40}|[a-f0-9]{64})$'),
 CHECK((state='succeeded')=("confirmedAt" IS NOT NULL)),
 CHECK(state<>'succeeded' OR ("observedSha"="baseSha" AND "protectionReady" AND "checkedAt" IS NOT NULL))
);
CREATE INDEX "ReleaseBranchPreparation_state_updatedAt_idx" ON "ReleaseBranchPreparation"(state,"updatedAt");
CREATE UNIQUE INDEX release_branch_preparation_one_unresolved ON "ReleaseBranchPreparation"("releaseId") WHERE state IN ('queued','running','unknown','succeeded');
CREATE FUNCTION validate_release_branch_preparation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d "ReleaseBranchPlanDecision"; r "Release"; repo "Repository";
BEGIN
 IF TG_OP='UPDATE' THEN
  IF (to_jsonb(NEW)-ARRAY['state','message','leaseId','leaseUntil','writeStartedAt','reconcileOnly','observedSha','protectionReady','confirmedAt','checkedAt','errorCode','updatedAt'])
   IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','message','leaseId','leaseUntil','writeStartedAt','reconcileOnly','observedSha','protectionReady','confirmedAt','checkedAt','errorCode','updatedAt'])
   OR (OLD."writeStartedAt" IS NOT NULL AND NEW."writeStartedAt" IS DISTINCT FROM OLD."writeStartedAt")
   OR (OLD.state='succeeded' AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD)) THEN RAISE EXCEPTION 'Preparation intent and confirmed result are preserved'; END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO d FROM "ReleaseBranchPlanDecision" WHERE id=NEW."decisionId";
 SELECT * INTO r FROM "Release" WHERE id=NEW."releaseId";
 SELECT * INTO repo FROM "Repository" WHERE id=NEW."repositoryId";
 IF d.id IS NULL OR d."releaseId"<>r.id OR d.id IS DISTINCT FROM (SELECT id FROM "ReleaseBranchPlanDecision" WHERE "releaseId"=r.id ORDER BY number DESC LIMIT 1)
 OR r."compositionStatus"<>'OPEN' OR r."flowEnvironment" IS DISTINCT FROM 'DEV' OR r.version<>d."releaseRecordVersion"
 OR d."compositionRevisionId" IS DISTINCT FROM (SELECT id FROM "ReleaseCompositionRevision" WHERE "releaseId"=r.id ORDER BY number DESC LIMIT 1)
 OR repo.state<>'ready' OR repo."systemId"<>r."systemId" OR repo.version<>d."repositoryRecordVersion" OR repo."gitlabProjectId" IS DISTINCT FROM d."gitlabProjectId"
 OR NEW."releaseRecordVersion"<>d."releaseRecordVersion" OR NEW."compositionRevisionId"<>d."compositionRevisionId"
 OR NEW."repositoryId"<>d."repositoryId" OR NEW."repositoryRecordVersion"<>d."repositoryRecordVersion" OR NEW."gitlabProjectId"<>d."gitlabProjectId"
 OR NEW."branchName"<>d."branchName" OR NEW."defaultBranch"<>d."defaultBranch" OR NEW."baseSha"<>d."baseSha"
 OR NEW.number<>coalesce((SELECT max(number)+1 FROM "ReleaseBranchPreparation" WHERE "releaseId"=r.id),1)
 OR NEW.state<>'queued' OR NEW."writeStartedAt" IS NOT NULL OR NEW."leaseId" IS NOT NULL
 OR NOT EXISTS(SELECT 1 FROM "Item" WHERE id=r."systemId" AND status='active' AND NOT archived) THEN
 RAISE EXCEPTION 'Preparation requires current accepted OPEN DEV plan and repository'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER release_branch_preparation_scope BEFORE INSERT OR UPDATE ON "ReleaseBranchPreparation" FOR EACH ROW EXECUTE FUNCTION validate_release_branch_preparation();
CREATE TRIGGER release_branch_preparation_no_delete BEFORE DELETE ON "ReleaseBranchPreparation" FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TRIGGER release_branch_preparation_no_truncate BEFORE TRUNCATE ON "ReleaseBranchPreparation" FOR EACH STATEMENT EXECUTE FUNCTION prevent_history_mutation();
GRANT SELECT,INSERT,UPDATE ON "ReleaseBranchPreparation" TO sdlc_portal_app;
COMMIT;
