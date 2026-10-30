BEGIN;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM "ExecutionContractPublication") THEN RAISE EXCEPTION 'Preserve recorded contract publication intents and effects'; END IF; END; $$;
DROP TABLE "ExecutionContractPublication";DROP FUNCTION validate_contract_publication();
DELETE FROM "_prisma_migrations" WHERE migration_name='202610290002_execution_contract_publication';
COMMIT;
