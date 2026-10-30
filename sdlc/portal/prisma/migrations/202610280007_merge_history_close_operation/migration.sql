BEGIN;
CREATE TABLE "MergeHistoryCloseOperation" (
 id TEXT PRIMARY KEY,"mergeOperationId" TEXT NOT NULL REFERENCES "MergeOperation"(id) ON DELETE RESTRICT,
 "executionId" TEXT NOT NULL REFERENCES "StoryExecution"(id) ON DELETE RESTRICT,"storyId" TEXT NOT NULL REFERENCES "Item"(id) ON DELETE RESTRICT,
 "projectId" INTEGER NOT NULL CHECK("projectId">0),iid INTEGER NOT NULL CHECK(iid>0),
 "sourceBranch" TEXT NOT NULL,"targetBranch" TEXT NOT NULL,sha TEXT NOT NULL CHECK(sha ~ '^([a-f0-9]{40}|[a-f0-9]{64})$'),
 "remoteUpdatedAt" TEXT NOT NULL,"contextDigest" TEXT NOT NULL CHECK("contextDigest" ~ '^[a-f0-9]{64}$'),
 reason TEXT NOT NULL CHECK(length(btrim(reason)) BETWEEN 10 AND 2000),"actorId" TEXT NOT NULL,"actorName" TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','unknown','blocked','succeeded','merged','paused','cancelled')),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),message TEXT NOT NULL,
 "leaseId" TEXT,"leaseUntil" TIMESTAMP(3),"writeStartedAt" TIMESTAMP(3),"reconcileOnly" BOOLEAN NOT NULL DEFAULT false,"checkedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "MergeHistoryCloseOperation_mergeOperationId_createdAt_id_idx" ON "MergeHistoryCloseOperation"("mergeOperationId","createdAt",id);
CREATE INDEX "MergeHistoryCloseOperation_state_leaseUntil_idx" ON "MergeHistoryCloseOperation"(state,"leaseUntil");
CREATE INDEX "MergeHistoryCloseOperation_storyId_state_idx" ON "MergeHistoryCloseOperation"("storyId",state);
CREATE UNIQUE INDEX merge_history_close_one_active ON "MergeHistoryCloseOperation"("mergeOperationId") WHERE state IN ('queued','running','unknown','paused');
CREATE FUNCTION protect_merge_history_close_intent() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Preserve historical close requests'; END IF;
 IF (to_jsonb(OLD)-ARRAY['state','version','message','leaseId','leaseUntil','writeStartedAt','reconcileOnly','checkedAt','updatedAt']) IS DISTINCT FROM
    (to_jsonb(NEW)-ARRAY['state','version','message','leaseId','leaseUntil','writeStartedAt','reconcileOnly','checkedAt','updatedAt'])
 OR (OLD."writeStartedAt" IS NOT NULL AND OLD."writeStartedAt" IS DISTINCT FROM NEW."writeStartedAt")
 OR (OLD."reconcileOnly" AND NOT NEW."reconcileOnly") OR NEW.version<=OLD.version THEN
 RAISE EXCEPTION 'Preserve the approved historical close intent and monotonic execution markers'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER merge_history_close_intent BEFORE UPDATE OR DELETE ON "MergeHistoryCloseOperation" FOR EACH ROW EXECUTE FUNCTION protect_merge_history_close_intent();
CREATE TRIGGER merge_history_close_no_truncate BEFORE TRUNCATE ON "MergeHistoryCloseOperation" FOR EACH STATEMENT EXECUTE FUNCTION prevent_history_mutation();
REVOKE ALL ON "MergeHistoryCloseOperation" FROM sdlc_portal_app;
GRANT SELECT,INSERT ON "MergeHistoryCloseOperation" TO sdlc_portal_app;
GRANT UPDATE(state,version,message,"leaseId","leaseUntil","writeStartedAt","reconcileOnly","checkedAt","updatedAt") ON "MergeHistoryCloseOperation" TO sdlc_portal_app;
COMMIT;
