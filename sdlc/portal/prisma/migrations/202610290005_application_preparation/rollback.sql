BEGIN;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM "ApplicationPreparation") THEN RAISE EXCEPTION 'Retain application preparation intent; use compatible runtime'; END IF; END $$;
DROP TABLE "ApplicationPreparation";
DROP FUNCTION validate_application_preparation();
COMMIT;
