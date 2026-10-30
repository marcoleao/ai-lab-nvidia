BEGIN;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM "MergeHistoryResolution") THEN RAISE EXCEPTION 'Preserve recorded historical resolutions; compensate instead of dropping evidence'; END IF; END; $$;
DROP TABLE "MergeHistoryResolution";
DROP FUNCTION validate_merge_history_resolution();
COMMIT;
