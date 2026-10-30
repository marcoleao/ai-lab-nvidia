BEGIN;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM "ReleaseBranchPreparation") THEN RAISE EXCEPTION 'Retain recorded preparations and remote effects'; END IF; END; $$;
DROP TABLE "ReleaseBranchPreparation";
DROP FUNCTION validate_release_branch_preparation();
COMMIT;
