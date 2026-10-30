BEGIN;
CREATE TABLE "ApplicationPreparation" (
 id TEXT PRIMARY KEY,"parentId" TEXT REFERENCES "ApplicationPreparation"(id) ON DELETE RESTRICT,"systemId" TEXT NOT NULL REFERENCES "Item"(id) ON DELETE RESTRICT,"repositoryId" TEXT NOT NULL REFERENCES "Repository"(id) ON DELETE RESTRICT,"repositoryVersion" INTEGER NOT NULL,"projectId" INTEGER NOT NULL,
 number INTEGER NOT NULL CHECK(number>0),kind TEXT NOT NULL CHECK(kind IN ('publish','release_draft','merge')),"templateVersion" TEXT NOT NULL CHECK("templateVersion"='node24-react-starter-v1'),"contentDigest" TEXT NOT NULL CHECK("contentDigest" ~ '^[a-f0-9]{64}$'),files JSONB NOT NULL CHECK(jsonb_typeof(files)='array' AND jsonb_array_length(files)=9),
 "baseSha" TEXT NOT NULL CHECK("baseSha" ~ '^([a-f0-9]{40}|[a-f0-9]{64})$'),branch TEXT NOT NULL,"targetBranch" TEXT NOT NULL,"remoteToken" TEXT,"actorId" TEXT NOT NULL,"actorName" TEXT NOT NULL,reason TEXT NOT NULL CHECK(length(btrim(reason)) BETWEEN 10 AND 2000),
 state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','paused','partial','blocked','unknown','succeeded','cancelled')),version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),message TEXT NOT NULL,
 "leaseId" TEXT,"leaseUntil" TIMESTAMP(3),"commitWriteStartedAt" TIMESTAMP(3),"mrWriteStartedAt" TIMESTAMP(3),"writeStartedAt" TIMESTAMP(3),"commitSha" TEXT CHECK("commitSha" IS NULL OR "commitSha" ~ '^([a-f0-9]{40}|[a-f0-9]{64})$'),iid INTEGER,url TEXT,"mrState" TEXT,"confirmedAt" TIMESTAMP(3),"integrationSha" TEXT CHECK("integrationSha" IS NULL OR "integrationSha" ~ '^([a-f0-9]{40}|[a-f0-9]{64})$'),"mergedAt" TIMESTAMP(3),
 "resolvedAt" TIMESTAMP(3),"resolvedById" TEXT,"resolvedByName" TEXT,"resolutionReason" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("systemId",number),CHECK((kind='publish' AND "parentId" IS NULL) OR (kind<>'publish' AND "parentId" IS NOT NULL AND "remoteToken" IS NOT NULL)),
 CHECK(state<>'succeeded' OR ("confirmedAt" IS NOT NULL AND "commitSha" IS NOT NULL AND iid>0 AND url IS NOT NULL AND (kind<>'merge' OR ("integrationSha" IS NOT NULL AND "mergedAt" IS NOT NULL))))
);
CREATE INDEX "ApplicationPreparation_state_createdAt_idx" ON "ApplicationPreparation"(state,"createdAt");
CREATE INDEX "ApplicationPreparation_parentId_number_idx" ON "ApplicationPreparation"("parentId",number);
CREATE UNIQUE INDEX "ApplicationPreparation_one_pending" ON "ApplicationPreparation"("systemId") WHERE "resolvedAt" IS NULL AND state IN ('queued','running','paused','partial','unknown');
CREATE FUNCTION validate_application_preparation() RETURNS trigger LANGUAGE plpgsql AS $$
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
CREATE TRIGGER application_preparation_validate BEFORE INSERT OR UPDATE ON "ApplicationPreparation" FOR EACH ROW EXECUTE FUNCTION validate_application_preparation();
CREATE TRIGGER application_preparation_no_delete BEFORE DELETE ON "ApplicationPreparation" FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TRIGGER application_preparation_no_truncate BEFORE TRUNCATE ON "ApplicationPreparation" FOR EACH STATEMENT EXECUTE FUNCTION prevent_history_mutation();
GRANT SELECT,INSERT,UPDATE ON "ApplicationPreparation" TO sdlc_portal_app;
COMMIT;
