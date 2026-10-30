BEGIN;
CREATE TABLE "StoryDevelopmentApproval"(
 id TEXT PRIMARY KEY,"storyId" TEXT NOT NULL REFERENCES "Item"(id) ON DELETE RESTRICT,number INTEGER NOT NULL CHECK(number>0),"policyVersion" TEXT NOT NULL CHECK("policyVersion"='development-approval-v1'),"referenceDigest" TEXT NOT NULL CHECK("referenceDigest" ~ '^[a-f0-9]{64}$'),
 "specificationId" TEXT NOT NULL REFERENCES "StorySpecificationRevision"(id) ON DELETE RESTRICT,"executionId" TEXT NOT NULL REFERENCES "StoryExecution"(id) ON DELETE RESTRICT,"repositoryId" TEXT NOT NULL REFERENCES "Repository"(id) ON DELETE RESTRICT,"repositoryVersion" INTEGER NOT NULL,"sourceSha" TEXT NOT NULL,"integrationReferenceId" TEXT NOT NULL REFERENCES "MergeIntegrationReference"(id) ON DELETE RESTRICT,"integrationSha" TEXT NOT NULL,
 "buildId" TEXT NOT NULL REFERENCES "DevelopmentBuild"(id) ON DELETE RESTRICT,"buildSourceSha" TEXT NOT NULL,"imageId" TEXT NOT NULL,"archiveDigest" TEXT NOT NULL,"deploymentId" TEXT NOT NULL REFERENCES "DevelopmentDeployment"(id) ON DELETE RESTRICT,"testId" TEXT NOT NULL REFERENCES "DevelopmentTest"(id) ON DELETE RESTRICT,"suiteDigest" TEXT NOT NULL,
 "reviewId" TEXT NOT NULL REFERENCES "QualityCheck"(id) ON DELETE RESTRICT,"securityId" TEXT NOT NULL REFERENCES "QualityCheck"(id) ON DELETE RESTRICT,"qualityPolicy" TEXT NOT NULL,"actorId" TEXT NOT NULL,"actorName" TEXT NOT NULL,reason TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE("storyId",number)
);
CREATE INDEX "StoryDevelopmentApproval_storyId_createdAt_idx" ON "StoryDevelopmentApproval"("storyId","createdAt");

-- This reference deliberately excludes administrative versions, status, titles,
-- release membership, the shared environment's active pointer and global HEAD.
CREATE FUNCTION sdlc_development_reference(story_id TEXT) RETURNS JSONB LANGUAGE sql STABLE AS $$
 WITH RECURSIVE lineage AS (SELECT id,kind,"parentId" FROM "Item" WHERE id=story_id UNION ALL SELECT p.id,p.kind,p."parentId" FROM "Item" p JOIN lineage c ON p.id=c."parentId"),
 source AS (
 SELECT i.*,r.id rid,r.version rversion,r."gitlabProjectId" project_id,e.id eid,e.state estate,e."commitSha" sha,e.snapshot,
 s.id sid,s.number snumber,m.id mid,m."integrationSha" integrated,b.id bid,b."sourceSha" build_sha,b."imageId" image,b."archiveDigest" archive,d.id did,
 encode(sha256(convert_to(jsonb_build_object('requirements',i.data->'requirements','criteria',coalesce(i.data->'requirements'->'functionalCriteria',i.data->'acceptanceCriteria'),'technical',i.data->'technicalPlan','fallback',CASE WHEN i.data->'requirements'->>'objective' IS NULL OR coalesce(i.data->'requirements'->>'behavior','')='' THEN i.description ELSE NULL END,
 'tasks',coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'description',t.description,'scope',t.data->'plannedScope','repositories',(SELECT coalesce(jsonb_agg(ir."repositoryId" ORDER BY ir."repositoryId"),'[]'::jsonb) FROM "ItemRepository" ir WHERE ir."itemId"=t.id)) ORDER BY t.id) FROM "Item" t WHERE t."parentId"=i.id AND t.kind='task' AND NOT t.archived AND (t.data->>'pipelineStage'='coding' OR EXISTS(SELECT 1 FROM "WorkTaskLink" l JOIN "WorkActivity" a ON a.id=l."activityId" WHERE l."taskId"=t.id AND a."storyId"=i.id AND a.kind='coding'))),'[]'::jsonb),
 'links',coalesce((SELECT jsonb_agg(jsonb_build_object('taskId',l."taskId",'scope',l.scope,'completion',l.completion) ORDER BY l."taskId",l."activityId") FROM "WorkTaskLink" l JOIN "WorkActivity" a ON a.id=l."activityId" WHERE a."storyId"=i.id AND a.kind='coding'),'[]'::jsonb))::text,'UTF8')),'hex') content_digest
 FROM "Item" i LEFT JOIN "Repository" r ON r."systemId"=(SELECT id FROM lineage WHERE kind='system' LIMIT 1)
 LEFT JOIN LATERAL(SELECT * FROM "StoryExecution" WHERE "storyId"=i.id ORDER BY "createdAt" DESC,id DESC LIMIT 1)e ON true
 LEFT JOIN LATERAL(SELECT id,number FROM "StorySpecificationRevision" WHERE "storyId"=i.id ORDER BY number DESC LIMIT 1)s ON true
 LEFT JOIN LATERAL(SELECT id,"integrationSha" FROM "MergeIntegrationReference" WHERE "executionId"=e.id LIMIT 1)m ON true
 LEFT JOIN LATERAL(SELECT id,"sourceSha","imageId","archiveDigest" FROM "DevelopmentBuild" WHERE "storyId"=i.id AND "executionId"=e.id AND state='succeeded' ORDER BY number DESC LIMIT 1)b ON true
 LEFT JOIN LATERAL(SELECT id FROM "DevelopmentDeployment" WHERE "storyId"=i.id AND "executionId"=e.id AND state='succeeded' ORDER BY number DESC LIMIT 1)d ON true
 WHERE i.id=story_id AND i.kind='story'),
 facts AS(SELECT jsonb_build_object('storyId',id,'contentDigest',content_digest,'specificationId',sid,'specificationNumber',snumber,'executionId',eid,'sourceSha',sha,'repositoryId',rid,'repositoryVersion',rversion,'projectId',project_id,'cycleId',data->'developmentCycleId','requiresNewG1',coalesce(data->'requiresNewG1','false'::jsonb),'executionFingerprint',snapshot->'fingerprint','integrationReferenceId',mid,'integrationSha',integrated,'buildId',bid,'buildSourceSha',build_sha,'imageId',image,'archiveDigest',archive,'deploymentId',did) value FROM source)
 SELECT value||jsonb_build_object('referenceDigest',encode(sha256(convert_to(value::text,'UTF8')),'hex')) FROM facts;
$$;

CREATE FUNCTION sdlc_development_approval_validity(story_id TEXT,current_quality_policy TEXT) RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
DECLARE a "StoryDevelopmentApproval";i "Item";r JSONB;reasons TEXT[]:=ARRAY[]::TEXT[];uncertain BOOLEAN:=false;q "QualityCheck";t "DevelopmentTest";
BEGIN
 SELECT * INTO a FROM "StoryDevelopmentApproval" WHERE "storyId"=story_id ORDER BY number DESC LIMIT 1;
 IF a.id IS NULL THEN RETURN jsonb_build_object('state','not_recorded','label','Sem aprovação registrada','reasons','[]'::jsonb);END IF;
 SELECT * INTO i FROM "Item" WHERE id=story_id;r:=sdlc_development_reference(story_id);
 IF r->>'referenceDigest' IS DISTINCT FROM a."referenceDigest" THEN reasons:=array_append(reasons,'A revisão, o ciclo, o código ou o artefato da própria História mudou.');END IF;
 IF i.status='cancelled' OR coalesce(i.data->>'cancellationRequested' NOT IN ('false','null','','0'),false) THEN reasons:=array_append(reasons,'A História foi cancelada ou tem cancelamento solicitado.');END IF;
 IF a."qualityPolicy"<>current_quality_policy THEN reasons:=array_append(reasons,'A política de revisão/segurança mudou; confira os controles atuais.');END IF;
 IF EXISTS(SELECT 1 FROM "DevelopmentTest" WHERE "storyId"=story_id AND "executionId"=a."executionId" AND result='failed' AND number>(SELECT number FROM "DevelopmentTest" WHERE id=a."testId")) THEN reasons:=array_append(reasons,'Há reprovação de testes posterior à aprovação desta revisão.');END IF;
 IF EXISTS(SELECT 1 FROM "QualityCheck" WHERE "executionId"=a."executionId" AND state='blocked' AND "createdAt">a."createdAt") THEN reasons:=array_append(reasons,'Há reprovação de revisão de código ou segurança posterior à aprovação.');END IF;
 FOR q IN SELECT DISTINCT ON(kind) * FROM "QualityCheck" WHERE "executionId"=a."executionId" ORDER BY kind,"createdAt" DESC,id DESC LOOP
  IF q.state='blocked' THEN reasons:=array_append(reasons,'Há reprovação de revisão de código ou segurança nesta revisão.');END IF;
  IF q.state<>'passed' OR q.sha<>a."sourceSha" OR q."policyVersion"<>current_quality_policy OR coalesce(q.evidence->>'digest','') !~ '^[a-f0-9]{64}$' THEN uncertain:=true;END IF;
 END LOOP;
 SELECT * INTO t FROM "DevelopmentTest" WHERE "storyId"=story_id AND "executionId"=a."executionId" AND state<>'cancelled' ORDER BY number DESC LIMIT 1;
 IF t.state IN ('queued','running','paused','unknown','blocked') OR t.state='failed' AND t.result IS NULL THEN uncertain:=true;END IF;
 IF EXISTS(SELECT 1 FROM "DevelopmentBuild" WHERE "storyId"=story_id AND state IN ('queued','running','paused','unknown')) OR EXISTS(SELECT 1 FROM "DevelopmentDeployment" WHERE "storyId"=story_id AND state IN ('queued','running','paused','unknown')) THEN uncertain:=true;END IF;
 IF cardinality(reasons)>0 THEN RETURN jsonb_build_object('state','outdated','label','Aprovação anterior não vigente','reasons',to_jsonb(reasons));END IF;
 IF uncertain THEN RETURN jsonb_build_object('state','unconfirmed','label','Aprovação registrada; controles atuais sem confirmação','reasons',jsonb_build_array('Há trabalho ou controle da própria História sem resultado confirmado. A aprovação histórica foi preservada.'));END IF;
 RETURN jsonb_build_object('state','valid','label','Desenvolvimento Finalizado','reasons','[]'::jsonb);
END $$;

CREATE FUNCTION validate_development_approval() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE e "StoryExecution";b "DevelopmentBuild";d "DevelopmentDeployment";t "DevelopmentTest";m "MergeIntegrationReference";q "QualityCheck";s "QualityCheck";r JSONB;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Retain immutable development approval';END IF;
 r:=sdlc_development_reference(NEW."storyId");SELECT * INTO e FROM "StoryExecution" WHERE id=NEW."executionId";SELECT * INTO b FROM "DevelopmentBuild" WHERE id=NEW."buildId";SELECT * INTO d FROM "DevelopmentDeployment" WHERE id=NEW."deploymentId";SELECT * INTO t FROM "DevelopmentTest" WHERE id=NEW."testId";SELECT * INTO m FROM "MergeIntegrationReference" WHERE id=NEW."integrationReferenceId";SELECT * INTO q FROM "QualityCheck" WHERE id=NEW."reviewId";SELECT * INTO s FROM "QualityCheck" WHERE id=NEW."securityId";
 IF r->>'executionId' IS DISTINCT FROM NEW."executionId" OR r->>'buildId' IS DISTINCT FROM NEW."buildId" OR r->>'deploymentId' IS DISTINCT FROM NEW."deploymentId" OR r->>'repositoryId' IS DISTINCT FROM NEW."repositoryId" OR r->>'repositoryVersion' IS DISTINCT FROM NEW."repositoryVersion"::text OR r->>'requiresNewG1'='true' OR q."executionId"<>e.id OR s."executionId"<>e.id OR coalesce(q.evidence->>'digest','') !~ '^[a-f0-9]{64}$' OR coalesce(s.evidence->>'digest','') !~ '^[a-f0-9]{64}$' OR d."storyId"<>NEW."storyId" OR t."storyId"<>NEW."storyId" OR q.id IS DISTINCT FROM (SELECT id FROM "QualityCheck" WHERE "executionId"=e.id AND kind='code_review' ORDER BY "createdAt" DESC,id DESC LIMIT 1) OR s.id IS DISTINCT FROM (SELECT id FROM "QualityCheck" WHERE "executionId"=e.id AND kind='security_scan' ORDER BY "createdAt" DESC,id DESC LIMIT 1) OR t.id IS DISTINCT FROM (SELECT id FROM "DevelopmentTest" WHERE "storyId"=NEW."storyId" AND "executionId"=e.id AND state<>'cancelled' ORDER BY number DESC LIMIT 1) OR EXISTS(SELECT 1 FROM jsonb_array_elements(t.coverage) WITH ORDINALITY c(value,n) WHERE c.value::text<>((c.n-1)::text)) OR EXISTS(SELECT 1 FROM jsonb_array_elements(t.proof->'cases') c WHERE coalesce((c->>'passed')::boolean,false)=false) OR jsonb_array_length(t.coverage)<>jsonb_array_length(coalesce((SELECT data->'requirements'->'functionalCriteria' FROM "Item" WHERE id=NEW."storyId"),'[]'::jsonb)) OR r->>'referenceDigest' IS DISTINCT FROM NEW."referenceDigest" OR r->>'specificationId' IS DISTINCT FROM NEW."specificationId" OR e.id IS NULL OR e.state<>'succeeded' OR e.snapshot->>'scopeRevision' IS DISTINCT FROM '3' OR e."storyId"<>NEW."storyId" OR e."repositoryId"<>NEW."repositoryId" OR e."commitSha" IS DISTINCT FROM NEW."sourceSha" OR m.id IS NULL OR m."executionId"<>e.id OR m."sourceSha"<>NEW."sourceSha" OR m."integrationSha" IS DISTINCT FROM NEW."integrationSha" OR b.id IS NULL OR b.state<>'succeeded' OR b."executionId"<>e.id OR b."integrationReferenceId"<>m.id OR b."sourceSha"<>NEW."buildSourceSha" OR b."imageId" IS DISTINCT FROM NEW."imageId" OR b."archiveDigest" IS DISTINCT FROM NEW."archiveDigest" OR d.id IS NULL OR d.state<>'succeeded' OR d."buildId"<>b.id OR t.id IS NULL OR t."deploymentId"<>d.id OR t.state<>'succeeded' OR t.result IS DISTINCT FROM 'passed' OR t."suiteScope"<>'acceptance' OR t."suiteDigest"<>NEW."suiteDigest" OR q.id IS NULL OR q.kind<>'code_review' OR q.state<>'passed' OR q.sha<>NEW."sourceSha" OR q."policyVersion"<>NEW."qualityPolicy" OR s.id IS NULL OR s.kind<>'security_scan' OR s.state<>'passed' OR s.sha<>NEW."sourceSha" OR s."policyVersion"<>NEW."qualityPolicy" OR NEW.number<>coalesce((SELECT max(number)+1 FROM "StoryDevelopmentApproval" WHERE "storyId"=NEW."storyId"),1) THEN RAISE EXCEPTION 'Complete source-bound development approval required';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_development_approval BEFORE INSERT OR UPDATE OR DELETE ON "StoryDevelopmentApproval" FOR EACH ROW EXECUTE FUNCTION validate_development_approval();
CREATE FUNCTION retain_development_approvals() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'Retain immutable development approval';END $$;
CREATE TRIGGER retain_development_approvals BEFORE TRUNCATE ON "StoryDevelopmentApproval" FOR EACH STATEMENT EXECUTE FUNCTION retain_development_approvals();
REVOKE ALL ON FUNCTION sdlc_development_reference(TEXT),sdlc_development_approval_validity(TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sdlc_development_reference(TEXT),sdlc_development_approval_validity(TEXT,TEXT) TO sdlc_portal_app;
GRANT SELECT,INSERT ON "StoryDevelopmentApproval" TO sdlc_portal_app;
COMMIT;
