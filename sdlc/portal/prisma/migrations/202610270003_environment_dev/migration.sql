-- Reference registration only. Existing Systems are completed by an explicit,
-- scoped and audited command, never by migration, startup or a GET.
BEGIN;
ALTER TABLE "Environment" DROP CONSTRAINT "Environment_code_check";
ALTER TABLE "Environment" ADD CONSTRAINT "Environment_code_check" CHECK (code IN ('DEV','QA','HML','PRD'));
COMMIT;
