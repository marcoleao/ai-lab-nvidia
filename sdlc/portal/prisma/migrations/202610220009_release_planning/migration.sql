-- Additive planning foundation. No business data, candidates or deployments.
CREATE TYPE "ReleaseStage" AS ENUM ('DRAFT', 'QA', 'HML', 'PRODUCTION', 'REJECTED');

CREATE TABLE "Release" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "systemId" TEXT NOT NULL,
  "systemKind" "ItemKind" NOT NULL DEFAULT 'system',
  "stage" "ReleaseStage" NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "createdByName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Release_system_kind_check" CHECK ("systemKind" = 'system'),
  CONSTRAINT "Release_version_check" CHECK ("version" > 0),
  CONSTRAINT "Release_name_check" CHECK (length(trim("name")) BETWEEN 3 AND 100),
  CONSTRAINT "Release_systemId_systemKind_fkey" FOREIGN KEY ("systemId", "systemKind") REFERENCES "Item"("id", "kind") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Release_key_key" ON "Release"("key");
CREATE INDEX "Release_systemId_createdAt_id_idx" ON "Release"("systemId", "createdAt", "id");
CREATE INDEX "Release_stage_createdAt_id_idx" ON "Release"("stage", "createdAt", "id");

CREATE TABLE "ReleaseStory" (
  "storyId" TEXT NOT NULL PRIMARY KEY,
  "storyKind" "ItemKind" NOT NULL DEFAULT 'story',
  "releaseId" TEXT NOT NULL,
  "plannedStoryVersion" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReleaseStory_story_kind_check" CHECK ("storyKind" = 'story'),
  CONSTRAINT "ReleaseStory_version_check" CHECK ("plannedStoryVersion" > 0),
  CONSTRAINT "ReleaseStory_storyId_storyKind_fkey" FOREIGN KEY ("storyId", "storyKind") REFERENCES "Item"("id", "kind") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ReleaseStory_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ReleaseStory_releaseId_idx" ON "ReleaseStory"("releaseId");
CREATE UNIQUE INDEX "ReleaseStory_storyId_storyKind_key" ON "ReleaseStory"("storyId", "storyKind");

-- A Story has at most one active planning association. Historical closed
-- manifests will be separate records; they must never reuse this mutable row.
CREATE FUNCTION validate_release_planning() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_system TEXT; target_stage "ReleaseStage"; story_system TEXT;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT stage INTO target_stage FROM "Release" WHERE id = OLD."releaseId";
    IF target_stage <> 'DRAFT' THEN RAISE EXCEPTION 'Closed release composition is immutable'; END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  SELECT "systemId", stage INTO target_system, target_stage FROM "Release" WHERE id = NEW."releaseId";
  SELECT p."parentId" INTO story_system FROM "Item" s
    JOIN "Item" e ON e.id = s."parentId" AND e.kind = 'epic'
    JOIN "Item" p ON p.id = e."parentId" AND p.kind = 'project'
    WHERE s.id = NEW."storyId" AND s.kind = 'story';
  IF target_stage <> 'DRAFT' OR story_system IS DISTINCT FROM target_system THEN
    RAISE EXCEPTION 'Release planning requires a DRAFT and a Story from its System';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER release_planning_scope BEFORE INSERT OR UPDATE OR DELETE ON "ReleaseStory"
FOR EACH ROW EXECUTE FUNCTION validate_release_planning();

CREATE FUNCTION preserve_release_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Releases are retained for traceability'; END IF;
  IF NEW."systemId" IS DISTINCT FROM OLD."systemId" OR NEW.key IS DISTINCT FROM OLD.key THEN
    RAISE EXCEPTION 'Release identity and System are immutable';
  END IF;
  IF OLD.stage <> 'DRAFT' AND (NEW.stage = 'DRAFT' OR NEW.name IS DISTINCT FROM OLD.name) THEN
    RAISE EXCEPTION 'Closed releases cannot return to editable planning';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER release_identity BEFORE UPDATE OR DELETE ON "Release"
FOR EACH ROW EXECUTE FUNCTION preserve_release_identity();
