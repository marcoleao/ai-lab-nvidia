BEGIN;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM "DevelopmentTest") THEN RAISE EXCEPTION 'Retain DEV test evidence; populated rollback refused';END IF;END $$;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM "ApplicationPreparation" WHERE "templateVersion"<>'node24-react-starter-v1') THEN RAISE EXCEPTION 'Retain versioned starter v2 preparation';END IF;END $$;
DROP TABLE "DevelopmentTest";
DROP FUNCTION validate_development_test();
DROP FUNCTION retain_development_tests();
ALTER TABLE "ApplicationPreparation" DROP CONSTRAINT "ApplicationPreparation_template_files_check";
ALTER TABLE "ApplicationPreparation" ADD CONSTRAINT "ApplicationPreparation_templateVersion_check" CHECK("templateVersion"='node24-react-starter-v1'),ADD CONSTRAINT "ApplicationPreparation_files_check" CHECK(jsonb_typeof(files)='array' AND jsonb_array_length(files)=9);
COMMIT;
