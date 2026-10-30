BEGIN;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM "MergeHistoryCloseOperation") THEN RAISE EXCEPTION 'Preserve recorded historical close requests'; END IF; END; $$;
DROP TABLE "MergeHistoryCloseOperation";
DROP FUNCTION protect_merge_history_close_intent();
COMMIT;
