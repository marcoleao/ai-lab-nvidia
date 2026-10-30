BEGIN;
DO $$BEGIN IF EXISTS(SELECT 1 FROM "StoryDevelopmentApproval") THEN RAISE EXCEPTION 'Retain immutable development approval; populated rollback refused';END IF;END $$;
DROP FUNCTION sdlc_development_approval_validity(TEXT,TEXT);
DROP TABLE "StoryDevelopmentApproval";
DROP FUNCTION validate_development_approval();DROP FUNCTION retain_development_approvals();DROP FUNCTION sdlc_development_reference(TEXT);
COMMIT;
