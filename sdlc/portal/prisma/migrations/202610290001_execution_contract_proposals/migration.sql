BEGIN;
ALTER TABLE "ChatTurn" DROP CONSTRAINT "ChatTurn_kind_check";
ALTER TABLE "ChatTurn" ADD CONSTRAINT "ChatTurn_kind_check" CHECK(kind IN ('chat','plan','contract_proposal'));
CREATE TABLE "ExecutionContractRequest" (
 id TEXT PRIMARY KEY,"turnId" TEXT NOT NULL UNIQUE REFERENCES "ChatTurn"(id) ON DELETE RESTRICT,"systemId" TEXT NOT NULL REFERENCES "Item"(id) ON DELETE RESTRICT,
 "repositoryId" TEXT NOT NULL REFERENCES "Repository"(id) ON DELETE RESTRICT,"repositoryVersion" INTEGER NOT NULL CHECK("repositoryVersion">0),"projectId" INTEGER NOT NULL CHECK("projectId">0),
 "baseSha" TEXT NOT NULL CHECK("baseSha" ~ '^([a-f0-9]{40}|[a-f0-9]{64})$'),branch TEXT NOT NULL,"contextDigest" TEXT NOT NULL,"context" JSONB NOT NULL,"expectedProposalId" TEXT,
 "actorId" TEXT NOT NULL,"actorName" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ExecutionContractRequest_systemId_createdAt_id_idx" ON "ExecutionContractRequest"("systemId","createdAt",id);
CREATE TABLE "ExecutionContractProposal" (
 id TEXT PRIMARY KEY,"systemId" TEXT NOT NULL REFERENCES "Item"(id) ON DELETE RESTRICT,number INTEGER NOT NULL CHECK(number>0),"requestId" TEXT UNIQUE REFERENCES "ExecutionContractRequest"(id) ON DELETE RESTRICT,"parentId" TEXT REFERENCES "ExecutionContractProposal"(id) ON DELETE RESTRICT,
 "repositoryId" TEXT NOT NULL REFERENCES "Repository"(id) ON DELETE RESTRICT,"repositoryVersion" INTEGER NOT NULL CHECK("repositoryVersion">0),"projectId" INTEGER NOT NULL CHECK("projectId">0),"baseSha" TEXT NOT NULL CHECK("baseSha" ~ '^([a-f0-9]{40}|[a-f0-9]{64})$'),branch TEXT NOT NULL,"contextDigest" TEXT NOT NULL,
 content JSONB CHECK(content IS NULL OR jsonb_typeof(content)='object'),summary TEXT NOT NULL,questions JSONB NOT NULL CHECK(jsonb_typeof(questions)='array'),"pendingEntries" JSONB NOT NULL CHECK(jsonb_typeof("pendingEntries")='array'),digest TEXT NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),source TEXT NOT NULL CHECK(source IN ('agent','human')),"actorId" TEXT NOT NULL,"actorName" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("systemId",number)
);
CREATE INDEX "ExecutionContractProposal_systemId_createdAt_id_idx" ON "ExecutionContractProposal"("systemId","createdAt",id);
ALTER TABLE "ExecutionContractRequest" ADD CONSTRAINT "ExecutionContractRequest_expectedProposalId_fkey" FOREIGN KEY("expectedProposalId") REFERENCES "ExecutionContractProposal"(id) ON DELETE RESTRICT;
CREATE TABLE "ExecutionContractReview" (id TEXT PRIMARY KEY,"proposalId" TEXT NOT NULL UNIQUE REFERENCES "ExecutionContractProposal"(id) ON DELETE RESTRICT,"systemId" TEXT NOT NULL REFERENCES "Item"(id) ON DELETE RESTRICT,"contextDigest" TEXT NOT NULL,reason TEXT NOT NULL CHECK(length(btrim(reason)) BETWEEN 10 AND 2000),"actorId" TEXT NOT NULL,"actorName" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "ExecutionContractReview_systemId_createdAt_id_idx" ON "ExecutionContractReview"("systemId","createdAt",id);
CREATE FUNCTION validate_execution_contract_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE repo "Repository"; turn "ChatTurn"; proposal "ExecutionContractProposal"; intent "ExecutionContractRequest";
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "Item" WHERE id=NEW."systemId" AND kind='system') THEN RAISE EXCEPTION 'Contract source requires a System'; END IF;
 IF TG_TABLE_NAME='ExecutionContractReview' THEN
  SELECT * INTO proposal FROM "ExecutionContractProposal" WHERE id=NEW."proposalId";
  IF proposal."systemId"<>NEW."systemId" OR proposal."contextDigest"<>NEW."contextDigest" OR proposal.content IS NULL OR jsonb_array_length(proposal.questions)<>0 OR proposal."pendingEntries" @> '[{"kind":"unsupported"}]'::jsonb THEN RAISE EXCEPTION 'Review must match the complete proposal definition'; END IF;
 ELSE
  SELECT * INTO repo FROM "Repository" WHERE id=NEW."repositoryId";
  IF repo."systemId"<>NEW."systemId" OR repo.version<>NEW."repositoryVersion" OR repo."gitlabProjectId" IS DISTINCT FROM NEW."projectId" THEN RAISE EXCEPTION 'Contract source must match its System repository'; END IF;
  IF TG_TABLE_NAME='ExecutionContractRequest' THEN
   SELECT * INTO turn FROM "ChatTurn" WHERE id=NEW."turnId";
   IF turn.kind<>'contract_proposal' OR NOT EXISTS(SELECT 1 FROM "ChatSession" WHERE id=turn."sessionId" AND "contextId"=NEW."systemId") OR turn."actorId"<>NEW."actorId" THEN RAISE EXCEPTION 'Contract request must match the original turn'; END IF;
   IF NEW."expectedProposalId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "ExecutionContractProposal" WHERE id=NEW."expectedProposalId" AND "systemId"=NEW."systemId") THEN RAISE EXCEPTION 'Contract parent must belong to its System'; END IF;
  ELSE
   IF NEW."parentId" IS NOT NULL THEN
    SELECT * INTO proposal FROM "ExecutionContractProposal" WHERE id=NEW."parentId";
    IF proposal."systemId"<>NEW."systemId" OR NEW.number<>proposal.number+1 THEN RAISE EXCEPTION 'Preserve contract revision lineage'; END IF;
   ELSIF NEW.number<>1 THEN RAISE EXCEPTION 'Initial contract proposal number must be one'; END IF;
   IF NEW."requestId" IS NOT NULL THEN
    SELECT * INTO intent FROM "ExecutionContractRequest" WHERE id=NEW."requestId";
    IF intent."systemId"<>NEW."systemId" OR intent."repositoryId"<>NEW."repositoryId" OR intent."baseSha"<>NEW."baseSha" OR intent."contextDigest"<>NEW."contextDigest" OR intent."expectedProposalId" IS DISTINCT FROM NEW."parentId" OR NEW.source<>'agent' THEN RAISE EXCEPTION 'Proposal must preserve its request context'; END IF;
   ELSIF NEW.source<>'human' THEN RAISE EXCEPTION 'Agent proposal requires a request'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END; $$;
DO $$ DECLARE name TEXT; BEGIN FOREACH name IN ARRAY ARRAY['ExecutionContractRequest','ExecutionContractProposal','ExecutionContractReview'] LOOP
 EXECUTE format('CREATE TRIGGER contract_source_scope BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION validate_execution_contract_source()',name);
 EXECUTE format('CREATE TRIGGER contract_source_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation()',name);
 EXECUTE format('CREATE TRIGGER contract_source_no_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION prevent_history_mutation()',name);
 EXECUTE format('REVOKE ALL ON %I FROM sdlc_portal_app',name);EXECUTE format('GRANT SELECT,INSERT ON %I TO sdlc_portal_app',name);
END LOOP; END; $$;
CREATE FUNCTION freeze_contract_turn_intent() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.kind='contract_proposal' AND (NEW.kind IS DISTINCT FROM OLD.kind OR NEW."sessionId"<>OLD."sessionId" OR NEW.sequence<>OLD.sequence OR NEW."createdAt"<>OLD."createdAt" OR NEW.input<>OLD.input OR NEW."actorId"<>OLD."actorId" OR NEW."actorName"<>OLD."actorName" OR NEW."contextSnapshot" IS DISTINCT FROM OLD."contextSnapshot") THEN RAISE EXCEPTION 'Preserve contract request intent'; END IF; RETURN NEW;
END; $$;
CREATE TRIGGER freeze_contract_turn_intent BEFORE UPDATE ON "ChatTurn" FOR EACH ROW EXECUTE FUNCTION freeze_contract_turn_intent();
COMMIT;
