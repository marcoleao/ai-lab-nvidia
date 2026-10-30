BEGIN;
DROP TRIGGER release_planning_scope ON "ReleaseStory";
DROP FUNCTION validate_release_planning();
DROP TRIGGER release_identity ON "Release";
DROP FUNCTION preserve_release_identity();

-- Rename values in place: identity, versions and retained audit payloads stay intact.
ALTER TYPE "ReleaseCompositionState" RENAME VALUE 'DRAFT' TO 'OPEN';
ALTER TYPE "ReleaseCompositionState" RENAME VALUE 'FROZEN' TO 'CLOSED';
ALTER TYPE "ReleaseCompositionState" RENAME VALUE 'CANCELLED' TO 'CANCELED';
ALTER TABLE "Release" ADD COLUMN "flowEnvironment" TEXT;
-- Only editable planning has a known initial flow position. Unknown historical
-- destinations of closed/canceled records are not reconstructed from status.
UPDATE "Release" SET "flowEnvironment"='DEV' WHERE "compositionStatus"='OPEN';
ALTER TABLE "Release" ALTER COLUMN "flowEnvironment" SET DEFAULT 'DEV';
ALTER TABLE "Release" ADD CONSTRAINT "Release_flowEnvironment_check" CHECK (
 "flowEnvironment" IS NULL OR "flowEnvironment" IN ('DEV','QA','HML','PRD')
);
ALTER TABLE "Release" ADD CONSTRAINT "Release_open_DEV_check" CHECK (
 "compositionStatus" <> 'OPEN' OR ("flowEnvironment" IS NOT NULL AND "flowEnvironment"='DEV')
);

CREATE FUNCTION validate_release_planning() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_system TEXT; target_state "ReleaseCompositionState"; story_system TEXT;
BEGIN
 IF TG_OP IN ('UPDATE','DELETE') THEN
  SELECT "compositionStatus" INTO target_state FROM "Release" WHERE id=OLD."releaseId";
  IF target_state <> 'OPEN' THEN RAISE EXCEPTION 'Closed release composition is immutable'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 SELECT "systemId","compositionStatus" INTO target_system,target_state FROM "Release" WHERE id=NEW."releaseId";
 SELECT p."parentId" INTO story_system FROM "Item" s
  JOIN "Item" e ON e.id=s."parentId" AND e.kind='epic'
  JOIN "Item" p ON p.id=e."parentId" AND p.kind='project'
  WHERE s.id=NEW."storyId" AND s.kind='story';
 IF target_state <> 'OPEN' OR story_system IS DISTINCT FROM target_system THEN
  RAISE EXCEPTION 'Release planning requires OPEN and a Story from its System';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER release_planning_scope BEFORE INSERT OR UPDATE OR DELETE ON "ReleaseStory"
FOR EACH ROW EXECUTE FUNCTION validate_release_planning();

CREATE FUNCTION preserve_release_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Releases are retained for traceability'; END IF;
 IF NEW."systemId" IS DISTINCT FROM OLD."systemId" OR NEW.key IS DISTINCT FROM OLD.key THEN
  RAISE EXCEPTION 'Release identity and System are immutable';
 END IF;
 IF OLD."compositionStatus" <> 'OPEN' AND (NEW."compositionStatus"='OPEN' OR NEW.name IS DISTINCT FROM OLD.name) THEN
  RAISE EXCEPTION 'Closed releases cannot return to editable planning';
 END IF;
 IF OLD."compositionStatus"='CANCELED' AND NEW."compositionStatus" <> 'CANCELED' THEN
  RAISE EXCEPTION 'Canceled releases are terminal';
 END IF;
 IF NEW."flowEnvironment" IS DISTINCT FROM OLD."flowEnvironment" THEN
  RAISE EXCEPTION 'Flow promotion requires an executor; unavailable in RA-04a';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER release_identity BEFORE UPDATE OR DELETE ON "Release"
FOR EACH ROW EXECUTE FUNCTION preserve_release_identity();
COMMIT;
