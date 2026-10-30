BEGIN;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM "ReleaseBranchPlanDecision") THEN RAISE EXCEPTION 'Retain recorded branch plan decisions; rollback would discard human choices'; END IF; END; $$;
DROP TABLE "ReleaseBranchPlanDecision";
DROP FUNCTION validate_branch_plan_decision();
COMMIT;
