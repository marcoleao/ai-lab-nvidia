BEGIN;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM "MergeIntegrationReference") THEN RAISE EXCEPTION 'Preserve recorded integration references; rollback cannot discard evidence'; END IF; END $$;
DROP TABLE "MergeIntegrationReference";
DROP FUNCTION validate_merge_integration_reference();
COMMIT;
