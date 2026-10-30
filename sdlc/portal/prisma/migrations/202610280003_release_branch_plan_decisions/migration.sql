BEGIN;
CREATE TABLE "ReleaseBranchPlanDecision" (
 id TEXT PRIMARY KEY,"releaseId" TEXT NOT NULL REFERENCES "Release"(id) ON DELETE RESTRICT,
 number INTEGER NOT NULL CHECK(number>0),"releaseRecordVersion" INTEGER NOT NULL CHECK("releaseRecordVersion">0),
 "compositionRevisionId" TEXT NOT NULL REFERENCES "ReleaseCompositionRevision"(id) ON DELETE RESTRICT,"compositionNumber" INTEGER NOT NULL CHECK("compositionNumber">0),
 "repositoryId" TEXT NOT NULL REFERENCES "Repository"(id) ON DELETE RESTRICT,"repositoryRecordVersion" INTEGER NOT NULL CHECK("repositoryRecordVersion">0),"gitlabProjectId" INTEGER NOT NULL CHECK("gitlabProjectId">0),
 "branchName" TEXT NOT NULL,"defaultBranch" TEXT NOT NULL CHECK(length("defaultBranch")>0),
 "defaultBranchSha" TEXT NOT NULL CHECK("defaultBranchSha" ~ '^([a-f0-9]{40}|[a-f0-9]{64})$'),
 "observedBranchSha" TEXT CHECK("observedBranchSha" IS NULL OR "observedBranchSha" ~ '^([a-f0-9]{40}|[a-f0-9]{64})$'),
 "baseSha" TEXT NOT NULL CHECK("baseSha" ~ '^([a-f0-9]{40}|[a-f0-9]{64})$'),scenario TEXT NOT NULL CHECK(scenario='initial'),
 "policyVersion" TEXT NOT NULL CHECK("policyVersion"='release-branches-v1'),policy JSONB NOT NULL CHECK(jsonb_typeof(policy)='object' AND policy->>'version' IS NOT NULL AND policy->>'version'="policyVersion"),
 "policyDigest" TEXT NOT NULL CHECK("policyDigest" ~ '^[a-f0-9]{64}$'),"contextDigest" TEXT NOT NULL CHECK("contextDigest" ~ '^[a-f0-9]{64}$'),"decisionDigest" TEXT NOT NULL CHECK("decisionDigest" ~ '^[a-f0-9]{64}$'),
 reason TEXT NOT NULL CHECK(char_length(btrim(reason)) BETWEEN 10 AND 500),
 "actorId" TEXT NOT NULL,"actorName" TEXT NOT NULL,"operationId" TEXT NOT NULL,"observedAt" TIMESTAMP(3) NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("releaseId",number)
);
CREATE INDEX "ReleaseBranchPlanDecision_releaseId_createdAt_id_idx" ON "ReleaseBranchPlanDecision"("releaseId","createdAt",id);
CREATE FUNCTION validate_branch_plan_decision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r "Release"; repo "Repository"; c "ReleaseCompositionRevision";
BEGIN
 SELECT * INTO r FROM "Release" WHERE id=NEW."releaseId";
 SELECT * INTO repo FROM "Repository" WHERE id=NEW."repositoryId";
 SELECT * INTO c FROM "ReleaseCompositionRevision" WHERE id=NEW."compositionRevisionId";
 IF r."compositionStatus"<>'OPEN' OR r."flowEnvironment" IS DISTINCT FROM 'DEV' OR r.version<>NEW."releaseRecordVersion"
 OR repo."systemId"<>r."systemId" OR repo.state<>'ready' OR repo.version<>NEW."repositoryRecordVersion" OR repo."gitlabProjectId" IS DISTINCT FROM NEW."gitlabProjectId"
 OR c."releaseId"<>r.id OR c.number<>NEW."compositionNumber" OR c.id IS DISTINCT FROM (SELECT id FROM "ReleaseCompositionRevision" WHERE "releaseId"=r.id ORDER BY number DESC LIMIT 1)
 OR NEW."branchName"<>'sdlc/release-'||r.id OR NEW.number<>coalesce((SELECT max(number)+1 FROM "ReleaseBranchPlanDecision" WHERE "releaseId"=r.id),1)
 OR NOT EXISTS(SELECT 1 FROM "Item" WHERE id=r."systemId" AND NOT archived AND status='active') THEN
 RAISE EXCEPTION 'Branch plan decision requires current active OPEN DEV composition and System repository'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER branch_plan_decision_scope BEFORE INSERT ON "ReleaseBranchPlanDecision" FOR EACH ROW EXECUTE FUNCTION validate_branch_plan_decision();
CREATE TRIGGER branch_plan_decision_immutable BEFORE UPDATE OR DELETE ON "ReleaseBranchPlanDecision" FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TRIGGER branch_plan_decision_no_truncate BEFORE TRUNCATE ON "ReleaseBranchPlanDecision" FOR EACH STATEMENT EXECUTE FUNCTION prevent_history_mutation();
GRANT SELECT,INSERT ON "ReleaseBranchPlanDecision" TO sdlc_portal_app;
COMMIT;
