BEGIN;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM "DevelopmentAiTest") THEN RAISE EXCEPTION 'Preserve AI evidence; source guard rollback refused';END IF;END $$;
DROP TRIGGER validate_ai_dev_source ON "DevelopmentAiTest";DROP FUNCTION validate_ai_dev_source();
DROP TRIGGER retain_ai_dispatch ON "DevelopmentAiTest";DROP FUNCTION retain_ai_dispatch();
COMMIT;
