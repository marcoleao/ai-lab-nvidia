BEGIN;
ALTER TABLE "MergeDiscussionTurn" ADD COLUMN "specialist" TEXT NOT NULL DEFAULT 'merge';
CREATE TABLE "MergePreparation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "operationId" TEXT NOT NULL,
  "executionId" TEXT NOT NULL,
  "storyId" TEXT NOT NULL,
  "sha" TEXT NOT NULL,
  "storyVersion" INTEGER NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'queued',
  "actorId" TEXT NOT NULL,
  "actorName" TEXT NOT NULL,
  "message" TEXT,
  "leaseId" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "writeStartedAt" TIMESTAMP(3),
  "reconcileOnly" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "MergePreparation_operationId_key" ON "MergePreparation"("operationId");
CREATE INDEX "MergePreparation_state_updatedAt_idx" ON "MergePreparation"("state","updatedAt");
COMMIT;
