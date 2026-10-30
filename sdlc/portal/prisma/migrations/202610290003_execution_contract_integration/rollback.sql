BEGIN;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM "ExecutionContractIntegration") OR EXISTS(SELECT 1 FROM "ExecutionContractPublication" WHERE "resolvedAt" IS NOT NULL) THEN RAISE EXCEPTION 'Retain integration intent or resolution; compatible runtime required'; END IF;END $$;
DROP TABLE "ExecutionContractIntegration";
DROP FUNCTION validate_contract_integration();CREATE OR REPLACE FUNCTION validate_contract_publication() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE proposal "ExecutionContractProposal";review "ExecutionContractReview";repo "Repository";
BEGIN
 IF TG_OP='INSERT' THEN
  SELECT * INTO proposal FROM "ExecutionContractProposal" WHERE id=NEW."proposalId";SELECT * INTO review FROM "ExecutionContractReview" WHERE id=NEW."reviewId";SELECT * INTO repo FROM "Repository" WHERE id=NEW."repositoryId";
  IF NOT EXISTS(SELECT 1 FROM "Item" WHERE id=NEW."systemId" AND kind='system') OR proposal."systemId"<>NEW."systemId" OR proposal.number<>NEW."proposalNumber" OR proposal."repositoryId"<>NEW."repositoryId" OR proposal."repositoryVersion"<>NEW."repositoryVersion" OR proposal."projectId"<>NEW."projectId" OR proposal."baseSha"<>NEW."baseSha" OR proposal.branch<>NEW."targetBranch" OR proposal."contextDigest"<>NEW."contextDigest" OR proposal.content IS DISTINCT FROM NEW.content::jsonb OR review."proposalId"<>proposal.id OR review."contextDigest"<>NEW."contextDigest" OR repo."systemId"<>NEW."systemId" OR repo.version<>NEW."repositoryVersion" OR repo."gitlabProjectId"<>NEW."projectId" THEN RAISE EXCEPTION 'Publication must preserve reviewed System contract and repository'; END IF;
 ELSE
  IF (to_jsonb(NEW)-ARRAY['state','version','message','leaseId','leaseUntil','commitWriteStartedAt','mrWriteStartedAt','commitSha','iid','url','mrState','confirmedAt','checkedAt','updatedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version','message','leaseId','leaseUntil','commitWriteStartedAt','mrWriteStartedAt','commitSha','iid','url','mrState','confirmedAt','checkedAt','updatedAt']) OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Preserve publication intent and version'; END IF;
  IF OLD."commitWriteStartedAt" IS NOT NULL AND NEW."commitWriteStartedAt" IS DISTINCT FROM OLD."commitWriteStartedAt" OR OLD."mrWriteStartedAt" IS NOT NULL AND NEW."mrWriteStartedAt" IS DISTINCT FROM OLD."mrWriteStartedAt" OR OLD."commitSha" IS NOT NULL AND NEW."commitSha" IS DISTINCT FROM OLD."commitSha" OR OLD.iid IS NOT NULL AND NEW.iid IS DISTINCT FROM OLD.iid OR OLD.url IS NOT NULL AND NEW.url IS DISTINCT FROM OLD.url OR OLD."confirmedAt" IS NOT NULL AND NEW."confirmedAt" IS DISTINCT FROM OLD."confirmedAt" THEN RAISE EXCEPTION 'Preserve known publication effects'; END IF;
 END IF;
 RETURN NEW;
END; $$;
DROP INDEX "ExecutionContractPublication_one_pending";
ALTER TABLE "ExecutionContractPublication" DROP COLUMN "resolvedAt",DROP COLUMN "resolvedById",DROP COLUMN "resolvedByName",DROP COLUMN "resolutionReason";
CREATE UNIQUE INDEX "ExecutionContractPublication_one_pending" ON "ExecutionContractPublication"("systemId") WHERE state IN ('queued','running','paused','partial','unknown') OR (state='succeeded' AND "mrState"='opened');
COMMIT;