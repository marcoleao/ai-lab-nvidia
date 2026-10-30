BEGIN;
ALTER TABLE "Release" ADD COLUMN "canceledAt" TIMESTAMP(3), ADD COLUMN "canceledById" TEXT, ADD COLUMN "canceledByName" TEXT, ADD COLUMN "cancellationReason" TEXT;
-- Historical CANCELED rows retain unknown metadata, never invented decisions.
ALTER TABLE "Release" ADD CONSTRAINT "Release_cancellation_metadata_check" CHECK (
 ("canceledAt" IS NULL AND "canceledById" IS NULL AND "canceledByName" IS NULL AND "cancellationReason" IS NULL) OR
 ("compositionStatus"='CANCELED' AND "canceledAt" IS NOT NULL AND "canceledById" IS NOT NULL AND "canceledByName" IS NOT NULL AND "cancellationReason" IS NOT NULL AND char_length(btrim("cancellationReason")) BETWEEN 10 AND 500)
);
DROP TRIGGER release_identity ON "Release";
DROP FUNCTION preserve_release_identity();
CREATE FUNCTION preserve_release_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Releases are retained for traceability'; END IF;
 IF NEW."systemId" IS DISTINCT FROM OLD."systemId" OR NEW.key IS DISTINCT FROM OLD.key THEN
  RAISE EXCEPTION 'Release identity and System are immutable';
 END IF;
 IF OLD."compositionStatus" <> 'OPEN' AND (NEW."compositionStatus"='OPEN' OR NEW.name IS DISTINCT FROM OLD.name) THEN
  RAISE EXCEPTION 'Closed releases cannot return to editable planning';
 END IF;
 IF OLD."compositionStatus" <> 'CANCELED' AND NEW."compositionStatus"='CANCELED' AND (NEW."canceledAt" IS NULL OR NEW."canceledById" IS NULL OR NEW."canceledByName" IS NULL OR NEW."cancellationReason" IS NULL) THEN
  RAISE EXCEPTION 'Release cancellation requires decision metadata';
 END IF;
 IF OLD."compositionStatus"='CANCELED' AND ROW(NEW."canceledAt",NEW."canceledById",NEW."canceledByName",NEW."cancellationReason") IS DISTINCT FROM ROW(OLD."canceledAt",OLD."canceledById",OLD."canceledByName",OLD."cancellationReason") THEN
  RAISE EXCEPTION 'Release cancellation decision is immutable';
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
