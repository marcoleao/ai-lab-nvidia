BEGIN;
CREATE TABLE "ExecutionContractPublication" (
 id TEXT PRIMARY KEY,"systemId" TEXT NOT NULL REFERENCES "Item"(id) ON DELETE RESTRICT,number INTEGER NOT NULL CHECK(number>0),
 "proposalId" TEXT NOT NULL REFERENCES "ExecutionContractProposal"(id) ON DELETE RESTRICT,"proposalNumber" INTEGER NOT NULL,"reviewId" TEXT NOT NULL REFERENCES "ExecutionContractReview"(id) ON DELETE RESTRICT,
 "repositoryId" TEXT NOT NULL REFERENCES "Repository"(id) ON DELETE RESTRICT,"repositoryVersion" INTEGER NOT NULL CHECK("repositoryVersion">0),"projectId" INTEGER NOT NULL CHECK("projectId">0),
 branch TEXT NOT NULL,"targetBranch" TEXT NOT NULL,"baseSha" TEXT NOT NULL CHECK("baseSha" ~ '^([a-f0-9]{40}|[a-f0-9]{64})$'),"baseContentDigest" TEXT,"contextDigest" TEXT NOT NULL,content TEXT NOT NULL CHECK(octet_length(content)<=32768),"contentDigest" TEXT NOT NULL CHECK("contentDigest"=encode(sha256(convert_to(content,'UTF8')),'hex')),
 reason TEXT NOT NULL CHECK(length(btrim(reason)) BETWEEN 10 AND 2000),"actorId" TEXT NOT NULL,"actorName" TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','paused','blocked','cancelled','partial','unknown','succeeded')),version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),message TEXT NOT NULL,
 "leaseId" TEXT,"leaseUntil" TIMESTAMP(3),"commitWriteStartedAt" TIMESTAMP(3),"mrWriteStartedAt" TIMESTAMP(3),"commitSha" TEXT,"iid" INTEGER,"url" TEXT,"mrState" TEXT CHECK("mrState" IN ('opened','closed','merged')),"confirmedAt" TIMESTAMP(3),"checkedAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("systemId",number),CHECK(branch='sdlc/contract-'||"proposalId"||'-'||number::text),CHECK(branch<>"targetBranch"),CHECK("commitSha" IS NULL OR "commitSha" ~ '^([a-f0-9]{40}|[a-f0-9]{64})$'),CHECK("iid" IS NULL OR "iid">0),CHECK(state<>'succeeded' OR ("commitSha" IS NOT NULL AND "iid" IS NOT NULL AND "url" IS NOT NULL AND "confirmedAt" IS NOT NULL))
);
CREATE INDEX "ExecutionContractPublication_state_leaseUntil_idx" ON "ExecutionContractPublication"(state,"leaseUntil");
CREATE INDEX "ExecutionContractPublication_systemId_createdAt_id_idx" ON "ExecutionContractPublication"("systemId","createdAt",id);
CREATE UNIQUE INDEX "ExecutionContractPublication_one_pending" ON "ExecutionContractPublication"("systemId") WHERE state IN ('queued','running','paused','partial','unknown') OR (state='succeeded' AND "mrState"='opened');
CREATE FUNCTION validate_contract_publication() RETURNS trigger LANGUAGE plpgsql AS $$
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
CREATE TRIGGER contract_publication_validate BEFORE INSERT OR UPDATE ON "ExecutionContractPublication" FOR EACH ROW EXECUTE FUNCTION validate_contract_publication();
CREATE TRIGGER contract_publication_no_delete BEFORE DELETE ON "ExecutionContractPublication" FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TRIGGER contract_publication_no_truncate BEFORE TRUNCATE ON "ExecutionContractPublication" FOR EACH STATEMENT EXECUTE FUNCTION prevent_history_mutation();
REVOKE ALL ON "ExecutionContractPublication" FROM sdlc_portal_app;GRANT SELECT,INSERT,UPDATE ON "ExecutionContractPublication" TO sdlc_portal_app;
COMMIT;
