BEGIN;
-- Laboratory model revision. No environment is converted into deployment or a
-- frozen composition. Non-DRAFT records require explicit review before applying.
DO $$ BEGIN IF EXISTS(SELECT FROM "Release" WHERE stage <> 'DRAFT') THEN
 RAISE EXCEPTION 'RELEASE_DATA_REVIEW_REQUIRED'; END IF; END $$;
DROP TRIGGER release_planning_scope ON "ReleaseStory";
DROP FUNCTION validate_release_planning();
DROP TRIGGER release_identity ON "Release";
DROP FUNCTION preserve_release_identity();
CREATE TYPE "ReleaseCompositionState" AS ENUM ('DRAFT','FROZEN','CANCELLED');
ALTER TABLE "Release" ALTER COLUMN stage DROP DEFAULT;
ALTER TABLE "Release" RENAME COLUMN stage TO "compositionStatus";
ALTER TABLE "Release" ALTER COLUMN "compositionStatus" TYPE "ReleaseCompositionState" USING "compositionStatus"::text::"ReleaseCompositionState";
ALTER TABLE "Release" ALTER COLUMN "compositionStatus" SET DEFAULT 'DRAFT';
ALTER INDEX "Release_stage_createdAt_id_idx" RENAME TO "Release_compositionStatus_createdAt_id_idx";
DROP TYPE "ReleaseStage";
CREATE FUNCTION validate_release_planning() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_system TEXT; target_stage "ReleaseCompositionState"; story_system TEXT;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT "compositionStatus" INTO target_stage FROM "Release" WHERE id = OLD."releaseId";
    IF target_stage <> 'DRAFT' THEN RAISE EXCEPTION 'Closed release composition is immutable'; END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  SELECT "systemId", "compositionStatus" INTO target_system, target_stage FROM "Release" WHERE id = NEW."releaseId";
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
  IF OLD."compositionStatus" <> 'DRAFT' AND (NEW."compositionStatus" = 'DRAFT' OR NEW.name IS DISTINCT FROM OLD.name) THEN
    RAISE EXCEPTION 'Closed releases cannot return to editable planning';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER release_identity BEFORE UPDATE OR DELETE ON "Release"
FOR EACH ROW EXECUTE FUNCTION preserve_release_identity();

-- Broaden constraints without rewriting business rows or historical decisions.
-- Legacy status values remain accepted until explicit, audited normalization.
ALTER TABLE "Item" DROP CONSTRAINT "Item_status_check";
ALTER TABLE "Item" ADD CONSTRAINT "Item_status_check" CHECK (
 (kind='system' AND status IN ('active','inactive')) OR
 (kind='project' AND status IN ('active','inactive','completed','cancelled','awaiting_approval','approved')) OR
 (kind='epic' AND status IN ('active','inactive','completed','cancelled','todo','doing','done','approved')) OR
 (kind='story' AND status IN ('specification','approved','coding','code_review','security_scan','merge_request','testing','uat','production','completed','cancelled')) OR
 (kind='task' AND status IN ('todo','doing','done','cancelled'))
);

COMMIT;
