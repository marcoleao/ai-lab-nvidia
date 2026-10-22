BEGIN;
ALTER TABLE "ExecutionMessage" ADD COLUMN intent TEXT NOT NULL DEFAULT 'discuss' CHECK(intent IN ('discuss','prepare_decision'));
COMMIT;
