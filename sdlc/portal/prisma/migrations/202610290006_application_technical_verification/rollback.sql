BEGIN;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM "ApplicationPreparation" WHERE "buildBaseImageId" IS NOT NULL OR "buildWriteStartedAt" IS NOT NULL OR "statusWriteStartedAt" IS NOT NULL OR "technicalTestPassed") THEN RAISE EXCEPTION 'Retain preparation technical intent and proof'; END IF; END $$;
ALTER TABLE "ApplicationPreparation" DROP CONSTRAINT "ApplicationPreparation_verified";
ALTER TABLE "ApplicationPreparation" DROP COLUMN "buildBaseImageId",DROP COLUMN "buildWriteStartedAt",DROP COLUMN "statusWriteStartedAt",DROP COLUMN "validationImageId",DROP COLUMN "validationArchiveDigest",DROP COLUMN "validationSize",DROP COLUMN "technicalTestPassed",DROP COLUMN "pipelineId",DROP COLUMN "statusId";
CREATE OR REPLACE FUNCTION validate_application_preparation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE repo "Repository";p "ApplicationPreparation";
BEGIN
 IF TG_OP='INSERT' THEN
  SELECT * INTO repo FROM "Repository" WHERE id=NEW."repositoryId";
  IF NOT EXISTS(SELECT 1 FROM "Item" WHERE id=NEW."systemId" AND kind='system') OR repo.id IS NULL OR repo."systemId"<>NEW."systemId" OR repo.version<>NEW."repositoryVersion" OR repo."gitlabProjectId"<>NEW."projectId" OR NEW.number<>coalesce((SELECT max(number)+1 FROM "ApplicationPreparation" WHERE "systemId"=NEW."systemId"),1) THEN RAISE EXCEPTION 'Preparation requires exact System repository and sequence'; END IF;
  IF NEW."parentId" IS NOT NULL THEN
   SELECT * INTO p FROM "ApplicationPreparation" WHERE id=NEW."parentId";
   IF p.id IS NULL OR p.kind<>'publish' OR p.state<>'succeeded' OR p."resolvedAt" IS NOT NULL OR (p."systemId",p."repositoryId",p."repositoryVersion",p."projectId",p."templateVersion",p."contentDigest",p.files,p."baseSha",p.branch,p."targetBranch",p."commitSha",p.iid,p.url) IS DISTINCT FROM (NEW."systemId",NEW."repositoryId",NEW."repositoryVersion",NEW."projectId",NEW."templateVersion",NEW."contentDigest",NEW.files,NEW."baseSha",NEW.branch,NEW."targetBranch",NEW."commitSha",NEW.iid,NEW.url) THEN RAISE EXCEPTION 'Step must preserve exact published preparation'; END IF;
  END IF;
 ELSE
  IF (to_jsonb(NEW)-ARRAY['state','version','message','leaseId','leaseUntil','commitWriteStartedAt','mrWriteStartedAt','writeStartedAt','commitSha','iid','url','mrState','confirmedAt','integrationSha','mergedAt','resolvedAt','resolvedById','resolvedByName','resolutionReason','updatedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version','message','leaseId','leaseUntil','commitWriteStartedAt','mrWriteStartedAt','writeStartedAt','commitSha','iid','url','mrState','confirmedAt','integrationSha','mergedAt','resolvedAt','resolvedById','resolvedByName','resolutionReason','updatedAt']) OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Preserve preparation intent and version'; END IF;
  IF OLD."commitWriteStartedAt" IS NOT NULL AND NEW."commitWriteStartedAt" IS DISTINCT FROM OLD."commitWriteStartedAt" OR OLD."mrWriteStartedAt" IS NOT NULL AND NEW."mrWriteStartedAt" IS DISTINCT FROM OLD."mrWriteStartedAt" OR OLD."writeStartedAt" IS NOT NULL AND NEW."writeStartedAt" IS DISTINCT FROM OLD."writeStartedAt" OR OLD."commitSha" IS NOT NULL AND NEW."commitSha" IS DISTINCT FROM OLD."commitSha" OR OLD.iid IS NOT NULL AND NEW.iid IS DISTINCT FROM OLD.iid OR OLD.url IS NOT NULL AND NEW.url IS DISTINCT FROM OLD.url OR OLD."confirmedAt" IS NOT NULL AND NEW."confirmedAt" IS DISTINCT FROM OLD."confirmedAt" OR OLD."integrationSha" IS NOT NULL AND NEW."integrationSha" IS DISTINCT FROM OLD."integrationSha" OR OLD."mergedAt" IS NOT NULL AND NEW."mergedAt" IS DISTINCT FROM OLD."mergedAt" OR OLD.state='succeeded' AND NEW.state<>'succeeded' THEN RAISE EXCEPTION 'Preserve known preparation effects'; END IF;
  IF OLD."resolvedAt" IS NOT NULL AND (NEW."resolvedAt",NEW."resolvedById",NEW."resolvedByName",NEW."resolutionReason") IS DISTINCT FROM (OLD."resolvedAt",OLD."resolvedById",OLD."resolvedByName",OLD."resolutionReason") THEN RAISE EXCEPTION 'Preserve preparation resolution'; END IF;
 END IF;
 IF NEW."resolvedAt" IS NOT NULL AND (NEW."resolvedById" IS NULL OR NEW."resolvedByName" IS NULL OR length(btrim(coalesce(NEW."resolutionReason",''))) NOT BETWEEN 10 AND 2000) THEN RAISE EXCEPTION 'Preparation resolution requires author and reason'; END IF;
 RETURN NEW;
END; $$;
COMMIT;
