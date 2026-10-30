BEGIN;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM "DevelopmentBuild") THEN RAISE EXCEPTION 'Retain build intent; use compatible runtime'; END IF; END $$;
DROP TABLE "DevelopmentBuild";
DROP FUNCTION validate_development_build();
COMMIT;
