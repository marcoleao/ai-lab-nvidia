BEGIN;
DO $$BEGIN IF EXISTS(SELECT 1 FROM "DevelopmentManualAcceptance" WHERE scope='story') THEN RAISE EXCEPTION 'Retain human Story approvals; populated rollback refused';END IF;END $$;
ALTER TABLE "DevelopmentManualAcceptance" DROP CONSTRAINT manual_acceptance_scope_policy;
ALTER TABLE "DevelopmentManualAcceptance" DROP CONSTRAINT manual_acceptance_notes;
ALTER TABLE "DevelopmentManualAcceptance" DROP COLUMN scope;
ALTER TABLE "DevelopmentManualAcceptance" ADD CONSTRAINT "DevelopmentManualAcceptance_policyVersion_check" CHECK("policyVersion"='dev-manual-acceptance-v1');
ALTER TABLE "DevelopmentManualAcceptance" ADD CONSTRAINT "DevelopmentManualAcceptance_notes_check" CHECK(length(trim(notes)) BETWEEN 10 AND 2000);
CREATE OR REPLACE FUNCTION validate_manual_dev_acceptance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r JSONB;b "DevelopmentBuild";d "DevelopmentDeployment";i "Item";
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Retain immutable manual acceptance';END IF;
 r:=sdlc_development_reference(NEW."storyId");SELECT * INTO b FROM "DevelopmentBuild" WHERE id=NEW."buildId";SELECT * INTO d FROM "DevelopmentDeployment" WHERE id=NEW."deploymentId";SELECT * INTO i FROM "Item" WHERE id=NEW."taskId";
 IF r->>'referenceDigest' IS DISTINCT FROM NEW."referenceDigest" OR r->>'specificationId' IS DISTINCT FROM NEW."specificationId" OR r->>'executionId' IS DISTINCT FROM NEW."executionId" OR r->>'buildId' IS DISTINCT FROM NEW."buildId" OR r->>'deploymentId' IS DISTINCT FROM NEW."deploymentId" OR r->>'buildSourceSha' IS DISTINCT FROM NEW."sourceSha" OR r->>'imageId' IS DISTINCT FROM NEW."imageId" OR r->>'archiveDigest' IS DISTINCT FROM NEW."archiveDigest" OR r->>'requiresNewG1'='true' OR b.id IS NULL OR b.state<>'succeeded' OR d.id IS NULL OR d.state<>'succeeded' OR d."buildId"<>b.id OR i.id IS NULL OR i.kind<>'task' OR i."parentId"<>NEW."storyId" OR i.archived OR i.data->>'pipelineStage' IS DISTINCT FROM 'test' THEN RAISE EXCEPTION 'Manual acceptance must match current source and test task';END IF;
 IF jsonb_typeof(NEW.criteria) IS DISTINCT FROM 'array' OR jsonb_typeof(NEW.results) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Criterion results required';END IF;
 IF NEW.criteria IS DISTINCT FROM (SELECT coalesce(data->'requirements'->'functionalCriteria',data->'acceptanceCriteria') FROM "Item" WHERE id=NEW."storyId") OR jsonb_array_length(NEW.criteria)=0 OR jsonb_array_length(NEW.criteria)<>jsonb_array_length(NEW.results) OR EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.results) WITH ORDINALITY x(value,n) WHERE x.value->>'index' IS DISTINCT FROM (x.n-1)::text OR jsonb_typeof(x.value->'passed') NOT IN ('boolean','null') OR NOT (x.value ? 'passed')) OR NEW.result IS DISTINCT FROM (CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.results) x WHERE x->>'passed'='false') THEN 'failed' WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.results) x WHERE x->>'passed' IS NULL) THEN 'pending' ELSE 'passed' END) OR NEW.number<>coalesce((SELECT max(number)+1 FROM "DevelopmentManualAcceptance" WHERE "storyId"=NEW."storyId"),1) THEN RAISE EXCEPTION 'Complete ordered criterion results required';END IF;
 RETURN NEW;
END $$;
COMMIT;
