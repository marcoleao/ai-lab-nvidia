BEGIN;
CREATE TABLE "EnvironmentOperation" (
 id TEXT PRIMARY KEY,"systemId" TEXT NOT NULL REFERENCES "Item"(id) ON DELETE RESTRICT,"environmentId" TEXT NOT NULL REFERENCES "Environment"(id) ON DELETE RESTRICT,"repositoryId" TEXT NOT NULL REFERENCES "Repository"(id) ON DELETE RESTRICT,"repositoryVersion" INTEGER NOT NULL,"projectId" INTEGER NOT NULL,
 number INTEGER NOT NULL,kind TEXT NOT NULL DEFAULT 'prepare' CHECK(kind='prepare'),version INTEGER NOT NULL DEFAULT 1,state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','paused','blocked','failed','unknown','succeeded','cancelled')),message TEXT NOT NULL DEFAULT '',"actorId" TEXT NOT NULL,"actorName" TEXT NOT NULL,reason TEXT NOT NULL,
 "sourceSha" TEXT NOT NULL CHECK("sourceSha" ~ '^([a-f0-9]{40}|[a-f0-9]{64})$'),"contractDigest" TEXT NOT NULL CHECK("contractDigest" ~ '^[a-f0-9]{64}$'),"unitId" TEXT NOT NULL,profile TEXT NOT NULL CHECK(profile='node24-http-v1'),"configDigest" TEXT NOT NULL CHECK("configDigest" ~ '^[a-f0-9]{64}$'),
 "leaseId" TEXT,"leaseUntil" TIMESTAMP(3),"dispatchStartedAt" TIMESTAMP(3),"startedAt" TIMESTAMP(3),"finishedAt" TIMESTAMP(3),proof JSONB,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("environmentId",number),CHECK(state<>'succeeded' OR (proof IS NOT NULL AND jsonb_typeof(proof)='object' AND coalesce(proof->>'configDigest'="configDigest",false) AND coalesce(proof->>'resourceId' ~ '^[a-f0-9]{64}$',false) AND coalesce(proof->>'resourceName' ~ '^sdlc-dev-[a-f0-9]{24}$',false) AND "dispatchStartedAt" IS NOT NULL AND "finishedAt" IS NOT NULL))
);
CREATE INDEX "EnvironmentOperation_state_createdAt_idx" ON "EnvironmentOperation"(state,"createdAt");
CREATE UNIQUE INDEX "EnvironmentOperation_one_pending" ON "EnvironmentOperation"("environmentId") WHERE state IN ('queued','running','paused','unknown');
CREATE TABLE "EnvironmentTarget"(id TEXT PRIMARY KEY,"environmentId" TEXT NOT NULL UNIQUE REFERENCES "Environment"(id) ON DELETE RESTRICT,"systemId" TEXT NOT NULL REFERENCES "Item"(id) ON DELETE RESTRICT,"repositoryId" TEXT NOT NULL REFERENCES "Repository"(id) ON DELETE RESTRICT,"operationId" TEXT NOT NULL UNIQUE REFERENCES "EnvironmentOperation"(id) ON DELETE RESTRICT,"unitId" TEXT NOT NULL,profile TEXT NOT NULL,"configDigest" TEXT NOT NULL,"resourceId" TEXT NOT NULL,"resourceName" TEXT NOT NULL,"confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE FUNCTION validate_environment_operation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE env "Environment";repo "Repository";
BEGIN
 IF TG_OP='INSERT' THEN
  SELECT * INTO env FROM "Environment" WHERE id=NEW."environmentId";SELECT * INTO repo FROM "Repository" WHERE id=NEW."repositoryId";
  IF env.code<>'DEV' OR env."repositoryId"<>repo.id OR repo."systemId"<>NEW."systemId" OR repo."gitlabProjectId" IS DISTINCT FROM NEW."projectId" OR repo.version<>NEW."repositoryVersion" OR NEW.number<>coalesce((SELECT max(number)+1 FROM "EnvironmentOperation" WHERE "environmentId"=NEW."environmentId"),1) THEN RAISE EXCEPTION 'Exact System DEV target required'; END IF;
 ELSE
  IF (to_jsonb(NEW)-ARRAY['state','version','message','leaseId','leaseUntil','dispatchStartedAt','startedAt','finishedAt','proof','updatedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version','message','leaseId','leaseUntil','dispatchStartedAt','startedAt','finishedAt','proof','updatedAt']) OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Preserve environment intent and version'; END IF;
  IF OLD."dispatchStartedAt" IS NOT NULL AND NEW."dispatchStartedAt" IS DISTINCT FROM OLD."dispatchStartedAt" OR OLD.proof IS NOT NULL AND NEW.proof IS DISTINCT FROM OLD.proof OR OLD.state='succeeded' AND NEW.state<>'succeeded' THEN RAISE EXCEPTION 'Preserve known environment effects'; END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE FUNCTION validate_environment_target() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE job "EnvironmentOperation"; BEGIN SELECT * INTO job FROM "EnvironmentOperation" WHERE id=NEW."operationId"; IF job.id IS NULL OR job.state<>'succeeded' OR NEW."environmentId"<>job."environmentId" OR NEW."systemId"<>job."systemId" OR NEW."repositoryId"<>job."repositoryId" OR NEW.profile<>job.profile OR NEW."unitId"<>job."unitId" OR NEW."configDigest"<>job."configDigest" OR NEW."resourceId" IS DISTINCT FROM job.proof->>'resourceId' OR NEW."resourceName" IS DISTINCT FROM job.proof->>'resourceName' THEN RAISE EXCEPTION 'Confirmed environment proof required'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER environment_operation_validate BEFORE INSERT OR UPDATE ON "EnvironmentOperation" FOR EACH ROW EXECUTE FUNCTION validate_environment_operation();
CREATE TRIGGER environment_operation_no_delete BEFORE DELETE ON "EnvironmentOperation" FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TRIGGER environment_operation_no_truncate BEFORE TRUNCATE ON "EnvironmentOperation" FOR EACH STATEMENT EXECUTE FUNCTION prevent_history_mutation();
CREATE TRIGGER environment_target_validate BEFORE INSERT ON "EnvironmentTarget" FOR EACH ROW EXECUTE FUNCTION validate_environment_target();
CREATE TRIGGER environment_target_immutable BEFORE UPDATE OR DELETE ON "EnvironmentTarget" FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TRIGGER environment_target_no_truncate BEFORE TRUNCATE ON "EnvironmentTarget" FOR EACH STATEMENT EXECUTE FUNCTION prevent_history_mutation();
GRANT SELECT,INSERT,UPDATE ON "EnvironmentOperation" TO sdlc_portal_app;
GRANT SELECT,INSERT ON "EnvironmentTarget" TO sdlc_portal_app;
COMMIT;
