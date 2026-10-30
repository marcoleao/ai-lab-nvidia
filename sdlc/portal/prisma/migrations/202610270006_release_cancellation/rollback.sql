BEGIN;
DO $$ BEGIN IF EXISTS(SELECT FROM "Release" WHERE "canceledAt" IS NOT NULL OR "canceledById" IS NOT NULL OR "canceledByName" IS NOT NULL OR "cancellationReason" IS NOT NULL) THEN RAISE EXCEPTION 'ROLLBACK_CANCELLATION_DATA_REVIEW_REQUIRED'; END IF; END $$;
DROP TRIGGER release_identity ON "Release";
DROP FUNCTION preserve_release_identity();
ALTER TABLE "Release" DROP COLUMN "canceledAt",DROP COLUMN "canceledById",DROP COLUMN "canceledByName",DROP COLUMN "cancellationReason";
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
