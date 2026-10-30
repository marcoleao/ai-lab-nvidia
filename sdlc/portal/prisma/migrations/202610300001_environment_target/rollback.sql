BEGIN;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM "EnvironmentOperation") OR EXISTS(SELECT 1 FROM "EnvironmentTarget") THEN RAISE EXCEPTION 'Retain environment intent and target evidence'; END IF; END $$;
DROP TABLE "EnvironmentTarget";DROP TABLE "EnvironmentOperation";DROP FUNCTION validate_environment_target();DROP FUNCTION validate_environment_operation();COMMIT;
