ALTER TABLE "MergeOperation" ADD COLUMN "discussionVersion" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "MergeDiscussionTurn" (
 "id" TEXT PRIMARY KEY, "operationId" TEXT NOT NULL REFERENCES "MergeOperation"("id") ON DELETE RESTRICT,
 "sequence" INTEGER NOT NULL, "input" TEXT NOT NULL, "output" TEXT,
 "state" TEXT NOT NULL DEFAULT 'queued' CHECK ("state" IN ('queued','running','succeeded','failed')),
 "error" TEXT, "actorId" TEXT NOT NULL, "actorName" TEXT NOT NULL,
 "leaseId" TEXT, "leaseUntil" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 UNIQUE ("operationId","sequence")
);
CREATE INDEX "MergeDiscussionTurn_state_createdAt_idx" ON "MergeDiscussionTurn"("state","createdAt");
