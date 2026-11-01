BEGIN;
CREATE FUNCTION validate_ai_dev_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r JSONB;b "DevelopmentBuild";d "DevelopmentDeployment";criteria JSONB;
BEGIN
 r:=sdlc_development_reference(NEW."storyId");SELECT * INTO b FROM "DevelopmentBuild" WHERE id=NEW."buildId";SELECT * INTO d FROM "DevelopmentDeployment" WHERE id=NEW."deploymentId";
 SELECT coalesce(data->'requirements'->'functionalCriteria',data->'acceptanceCriteria') INTO criteria FROM "Item" WHERE id=NEW."storyId" AND kind='story';
 IF r->>'referenceDigest' IS DISTINCT FROM NEW."referenceDigest" OR r->>'specificationId' IS DISTINCT FROM NEW."specificationId" OR r->>'executionId' IS DISTINCT FROM NEW."executionId" OR r->>'buildId' IS DISTINCT FROM NEW."buildId" OR r->>'deploymentId' IS DISTINCT FROM NEW."deploymentId" OR r->>'buildSourceSha' IS DISTINCT FROM NEW."sourceSha" OR r->>'imageId' IS DISTINCT FROM NEW."imageId" OR r->>'requiresNewG1'='true' OR b.id IS NULL OR b.state<>'succeeded' OR d.id IS NULL OR d.state<>'succeeded' OR d."buildId"<>b.id OR d."environmentId"<>NEW."environmentId" OR NEW.context->>'policyVersion' IS DISTINCT FROM 'dev-ai-browser-v1' OR NEW.context#>>'{approvedContext,contextVersion}' IS DISTINCT FROM '2' OR NEW.context#>'{approvedContext,criteria}' IS DISTINCT FROM criteria OR jsonb_typeof(criteria) IS DISTINCT FROM 'array' OR jsonb_array_length(criteria) NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION 'AI test must retain the current approved deployment and complete criteria';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_ai_dev_source BEFORE INSERT ON "DevelopmentAiTest" FOR EACH ROW EXECUTE FUNCTION validate_ai_dev_source();
CREATE FUNCTION retain_ai_dispatch() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD."dispatchStartedAt" IS NOT NULL AND NEW."dispatchStartedAt" IS DISTINCT FROM OLD."dispatchStartedAt" THEN RAISE EXCEPTION 'Retain first AI dispatch marker';END IF;RETURN NEW;END $$;
CREATE TRIGGER retain_ai_dispatch BEFORE UPDATE ON "DevelopmentAiTest" FOR EACH ROW EXECUTE FUNCTION retain_ai_dispatch();
COMMIT;
