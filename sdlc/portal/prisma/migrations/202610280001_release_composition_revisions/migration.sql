BEGIN;
CREATE TABLE "ReleaseCompositionRevision" (
 id TEXT PRIMARY KEY, "releaseId" TEXT NOT NULL REFERENCES "Release"(id) ON DELETE RESTRICT,
 number INTEGER NOT NULL CHECK(number>0), "releaseRecordVersion" INTEGER NOT NULL CHECK("releaseRecordVersion">0),
 "compositionStatus" "ReleaseCompositionState" NOT NULL,"flowEnvironment" TEXT,
 source TEXT NOT NULL CHECK(source IN ('planned','observed')), "storyCount" INTEGER NOT NULL CHECK("storyCount">=0),
 stories JSONB NOT NULL CHECK(jsonb_typeof(stories)='array' AND jsonb_array_length(stories)="storyCount"),
 digest TEXT CHECK(digest IS NULL OR digest ~ '^[a-f0-9]{64}$'),
 "actorId" TEXT,"actorName" TEXT,"operationId" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(source<>'planned' OR (digest IS NOT NULL AND "actorId" IS NOT NULL AND "actorName" IS NOT NULL AND "operationId" IS NOT NULL)),
 UNIQUE("releaseId",number)
);
CREATE INDEX "ReleaseCompositionRevision_releaseId_createdAt_id_idx" ON "ReleaseCompositionRevision"("releaseId","createdAt",id);
CREATE INDEX "ReleaseCompositionRevision_createdAt_id_idx" ON "ReleaseCompositionRevision"("createdAt",id);
CREATE INDEX "ReleaseCompositionRevision_stories_idx" ON "ReleaseCompositionRevision" USING GIN(stories jsonb_path_ops);
-- Observe the complete composition NOW. No historical authorship, specification,
-- code revision, approval or deployment is reconstructed from an optimistic lock.
INSERT INTO "ReleaseCompositionRevision" (id,"releaseId",number,"releaseRecordVersion","compositionStatus","flowEnvironment",source,"storyCount",stories)
 SELECT 'observed:'||r.id,r.id,1,r.version,r."compositionStatus",r."flowEnvironment",'observed',count(rs."storyId")::integer,
 coalesce(jsonb_agg(jsonb_build_object('storyId',i.id,'storyKey',i.key,'storyName',i.name,'recordVersion',rs."plannedStoryVersion",'specification',NULL,'execution',NULL,'contentDigest',NULL) ORDER BY i.id) FILTER(WHERE i.id IS NOT NULL),'[]'::jsonb)
 FROM "Release" r LEFT JOIN "ReleaseStory" rs ON rs."releaseId"=r.id LEFT JOIN "Item" i ON i.id=rs."storyId" GROUP BY r.id;
CREATE FUNCTION validate_composition_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r "Release"; entry JSONB;
BEGIN
 SELECT * INTO r FROM "Release" WHERE id=NEW."releaseId";
 IF NEW.source<>'planned' OR r."compositionStatus"<>'OPEN' OR NEW."compositionStatus"<>r."compositionStatus" OR NEW."flowEnvironment" IS DISTINCT FROM r."flowEnvironment" OR NEW."releaseRecordVersion"<>r.version OR NEW.number<>coalesce((SELECT max(number)+1 FROM "ReleaseCompositionRevision" WHERE "releaseId"=NEW."releaseId"),1) THEN
  RAISE EXCEPTION 'Composition revision requires a new sequential snapshot of current OPEN planning';
 END IF;
 IF (SELECT count(DISTINCT v->>'storyId') FROM jsonb_array_elements(NEW.stories) v)<>NEW."storyCount" THEN RAISE EXCEPTION 'Duplicate composition Story'; END IF;
 FOR entry IN SELECT * FROM jsonb_array_elements(NEW.stories) LOOP
  IF NOT EXISTS(SELECT 1 FROM "Item" s JOIN "Item" e ON e.id=s."parentId" JOIN "Item" p ON p.id=e."parentId" WHERE s.id=entry->>'storyId' AND s.kind='story' AND p."parentId"=r."systemId") OR coalesce((entry->>'recordVersion')::integer,0)<1 THEN RAISE EXCEPTION 'Composition Story must belong to the Release System'; END IF;
  IF entry->'specification'<>'null'::jsonb AND NOT EXISTS(SELECT 1 FROM "StorySpecificationRevision" s WHERE s.id=entry->'specification'->>'id' AND s."storyId"=entry->>'storyId' AND s.number=(entry->'specification'->>'number')::integer) THEN RAISE EXCEPTION 'Invalid specification reference'; END IF;
  IF entry->'execution'<>'null'::jsonb AND NOT EXISTS(SELECT 1 FROM "StoryExecution" e WHERE e.id=entry->'execution'->>'id' AND e."storyId"=entry->>'storyId') THEN RAISE EXCEPTION 'Invalid execution reference'; END IF;
 END LOOP;
 RETURN NEW;
END; $$;
CREATE TRIGGER composition_revision_scope BEFORE INSERT ON "ReleaseCompositionRevision" FOR EACH ROW EXECUTE FUNCTION validate_composition_revision();
CREATE TRIGGER composition_revision_immutable BEFORE UPDATE OR DELETE ON "ReleaseCompositionRevision" FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TRIGGER composition_revision_no_truncate BEFORE TRUNCATE ON "ReleaseCompositionRevision" FOR EACH STATEMENT EXECUTE FUNCTION prevent_history_mutation();
GRANT SELECT,INSERT ON "ReleaseCompositionRevision" TO sdlc_portal_app;
COMMIT;
