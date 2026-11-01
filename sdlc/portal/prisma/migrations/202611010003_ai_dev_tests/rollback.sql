BEGIN;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM "DevelopmentAiTest") THEN RAISE EXCEPTION 'Preserve populated AI test evidence; rollback refused';END IF;END $$;
DROP TABLE "DevelopmentAiTest";
DROP FUNCTION retain_ai_dev_test_source();
COMMIT;
