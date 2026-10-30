BEGIN;
ALTER TABLE "ExecutionContractPublication" ADD COLUMN "resolvedAt" TIMESTAMP(3),ADD COLUMN "resolvedById" TEXT,ADD COLUMN "resolvedByName" TEXT,ADD COLUMN "resolutionReason" TEXT;
DROP INDEX "ExecutionContractPublication_one_pending";
CREATE UNIQUE INDEX "ExecutionContractPublication_one_pending" ON "ExecutionContractPublication"("systemId") WHERE "resolvedAt" IS NULL AND (state IN ('queued','running','paused','partial','unknown') OR (state='succeeded' AND "mrState"='opened'));
CREATE OR REPLACE FUNCTION validate_contract_publication() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE proposal "ExecutionContractProposal";review "ExecutionContractReview";repo "Repository";
BEGIN
 IF TG_OP='INSERT' THEN
  SELECT * INTO proposal FROM "ExecutionContractProposal" WHERE id=NEW."proposalId";SELECT * INTO review FROM "ExecutionContractReview" WHERE id=NEW."reviewId";SELECT * INTO repo FROM "Repository" WHERE id=NEW."repositoryId";
  IF NOT EXISTS(SELECT 1 FROM "Item" WHERE id=NEW."systemId" AND kind='system') OR proposal."systemId"<>NEW."systemId" OR proposal.number<>NEW."proposalNumber" OR proposal."repositoryId"<>NEW."repositoryId" OR proposal."repositoryVersion"<>NEW."repositoryVersion" OR proposal."projectId"<>NEW."projectId" OR proposal."baseSha"<>NEW."baseSha" OR proposal.branch<>NEW."targetBranch" OR proposal."contextDigest"<>NEW."contextDigest" OR proposal.content IS DISTINCT FROM NEW.content::jsonb OR review."proposalId"<>proposal.id OR review."contextDigest"<>NEW."contextDigest" OR repo."systemId"<>NEW."systemId" OR repo.version<>NEW."repositoryVersion" OR repo."gitlabProjectId"<>NEW."projectId" THEN RAISE EXCEPTION 'Publication must preserve reviewed System contract and repository'; END IF;
 ELSE
  IF (to_jsonb(NEW)-ARRAY['state','version','message','leaseId','leaseUntil','commitWriteStartedAt','mrWriteStartedAt','commitSha','iid','url','mrState','confirmedAt','checkedAt','updatedAt','resolvedAt','resolvedById','resolvedByName','resolutionReason']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version','message','leaseId','leaseUntil','commitWriteStartedAt','mrWriteStartedAt','commitSha','iid','url','mrState','confirmedAt','checkedAt','updatedAt','resolvedAt','resolvedById','resolvedByName','resolutionReason']) OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Preserve publication intent and version'; END IF;
  IF OLD."commitWriteStartedAt" IS NOT NULL AND NEW."commitWriteStartedAt" IS DISTINCT FROM OLD."commitWriteStartedAt" OR OLD."mrWriteStartedAt" IS NOT NULL AND NEW."mrWriteStartedAt" IS DISTINCT FROM OLD."mrWriteStartedAt" OR OLD."commitSha" IS NOT NULL AND NEW."commitSha" IS DISTINCT FROM OLD."commitSha" OR OLD.iid IS NOT NULL AND NEW.iid IS DISTINCT FROM OLD.iid OR OLD.url IS NOT NULL AND NEW.url IS DISTINCT FROM OLD.url OR OLD."confirmedAt" IS NOT NULL AND NEW."confirmedAt" IS DISTINCT FROM OLD."confirmedAt" THEN RAISE EXCEPTION 'Preserve known publication effects'; END IF;
 END IF;
 IF NEW."resolvedAt" IS NOT NULL AND (NEW."resolvedById" IS NULL OR NEW."resolvedByName" IS NULL OR NEW."resolutionReason" IS NULL OR length(btrim(NEW."resolutionReason")) NOT BETWEEN 10 AND 2000) THEN RAISE EXCEPTION 'Resolution requires explicit authorship and reason'; END IF;
 IF TG_OP='UPDATE' AND OLD."resolvedAt" IS NOT NULL AND (NEW."resolvedAt",NEW."resolvedById",NEW."resolvedByName",NEW."resolutionReason") IS DISTINCT FROM (OLD."resolvedAt",OLD."resolvedById",OLD."resolvedByName",OLD."resolutionReason") THEN RAISE EXCEPTION 'Preserve publication resolution'; END IF;
 RETURN NEW;
END; $$;
CREATE TABLE "ExecutionContractIntegration" (
 id TEXT PRIMARY KEY,"publicationId" TEXT NOT NULL REFERENCES "ExecutionContractPublication"(id) ON DELETE RESTRICT,"systemId" TEXT NOT NULL REFERENCES "Item"(id) ON DELETE RESTRICT,
 number INTEGER NOT NULL CHECK(number>0),kind TEXT NOT NULL CHECK(kind IN ('release_draft','merge')),
 "repositoryId" TEXT NOT NULL REFERENCES "Repository"(id) ON DELETE RESTRICT,"repositoryVersion" INTEGER NOT NULL,"projectId" INTEGER NOT NULL,
 "sourceSha" TEXT NOT NULL CHECK("sourceSha" ~ '^([a-f0-9]{40}|[a-f0-9]{64})$'),"targetSha" TEXT NOT NULL CHECK("targetSha" ~ '^([a-f0-9]{40}|[a-f0-9]{64})$'),"remoteToken" TEXT NOT NULL CHECK("remoteToken" ~ '^[a-f0-9]{64}$'),
 reason TEXT NOT NULL CHECK(length(btrim(reason)) BETWEEN 10 AND 2000),"actorId" TEXT NOT NULL,"actorName" TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','paused','blocked','unknown','succeeded','cancelled')),version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),message TEXT NOT NULL,
 "leaseId" TEXT,"leaseUntil" TIMESTAMP(3),"writeStartedAt" TIMESTAMP(3),"checkedAt" TIMESTAMP(3),"confirmedAt" TIMESTAMP(3),"integrationSha" TEXT CHECK("integrationSha" IS NULL OR "integrationSha" ~ '^([a-f0-9]{40}|[a-f0-9]{64})$'),"mergedAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("publicationId",number),CHECK(state<>'succeeded' OR ("confirmedAt" IS NOT NULL AND "checkedAt" IS NOT NULL AND (kind='release_draft' OR ("integrationSha" IS NOT NULL AND "mergedAt" IS NOT NULL))))
);
CREATE INDEX "ExecutionContractIntegration_state_leaseUntil_idx" ON "ExecutionContractIntegration"(state,"leaseUntil");
CREATE UNIQUE INDEX "ExecutionContractIntegration_one_pending" ON "ExecutionContractIntegration"("publicationId") WHERE state IN ('queued','running','paused','unknown');
CREATE FUNCTION validate_contract_integration() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p "ExecutionContractPublication";
BEGIN
 IF TG_OP='INSERT' THEN
  SELECT * INTO p FROM "ExecutionContractPublication" WHERE id=NEW."publicationId";
  IF p.id IS NULL OR p."resolvedAt" IS NOT NULL OR p."systemId"<>NEW."systemId" OR p."repositoryId"<>NEW."repositoryId" OR p."repositoryVersion"<>NEW."repositoryVersion" OR p."projectId"<>NEW."projectId" OR p."commitSha" IS DISTINCT FROM NEW."sourceSha" OR p.iid IS NULL OR p.state<>'succeeded' OR NEW.number<>coalesce((SELECT max(number)+1 FROM "ExecutionContractIntegration" WHERE "publicationId"=p.id),1) THEN RAISE EXCEPTION 'Integration requires exact confirmed contract publication'; END IF;
 ELSE
  IF (to_jsonb(NEW)-ARRAY['state','version','message','leaseId','leaseUntil','writeStartedAt','checkedAt','confirmedAt','integrationSha','mergedAt','updatedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version','message','leaseId','leaseUntil','writeStartedAt','checkedAt','confirmedAt','integrationSha','mergedAt','updatedAt']) OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Preserve integration intent and version'; END IF;
  IF OLD."writeStartedAt" IS NOT NULL AND NEW."writeStartedAt" IS DISTINCT FROM OLD."writeStartedAt" OR OLD."confirmedAt" IS NOT NULL AND NEW."confirmedAt" IS DISTINCT FROM OLD."confirmedAt" OR OLD."integrationSha" IS NOT NULL AND NEW."integrationSha" IS DISTINCT FROM OLD."integrationSha" OR OLD."mergedAt" IS NOT NULL AND NEW."mergedAt" IS DISTINCT FROM OLD."mergedAt" OR OLD.state='succeeded' AND NEW.state<>'succeeded' THEN RAISE EXCEPTION 'Preserve confirmed integration effects'; END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER contract_integration_validate BEFORE INSERT OR UPDATE ON "ExecutionContractIntegration" FOR EACH ROW EXECUTE FUNCTION validate_contract_integration();
CREATE TRIGGER contract_integration_no_delete BEFORE DELETE ON "ExecutionContractIntegration" FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TRIGGER contract_integration_no_truncate BEFORE TRUNCATE ON "ExecutionContractIntegration" FOR EACH STATEMENT EXECUTE FUNCTION prevent_history_mutation();
GRANT SELECT,INSERT,UPDATE ON "ExecutionContractIntegration" TO sdlc_portal_app;
COMMIT;