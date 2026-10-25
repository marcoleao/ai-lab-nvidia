CREATE TABLE "QualityCheck" (
 "id" TEXT PRIMARY KEY, "executionId" TEXT NOT NULL REFERENCES "StoryExecution"("id") ON DELETE RESTRICT,
 "storyId" TEXT NOT NULL REFERENCES "Item"("id") ON DELETE RESTRICT,
 "kind" TEXT NOT NULL CHECK ("kind" IN ('code_review','security_scan')),
 "sha" TEXT NOT NULL, "baseSha" TEXT NOT NULL, "policyVersion" TEXT NOT NULL,
 "state" TEXT NOT NULL DEFAULT 'queued' CHECK ("state" IN ('queued','running','passed','blocked','failed','stale')),
 "actorId" TEXT NOT NULL, "actorName" TEXT NOT NULL, "summary" TEXT, "findings" JSONB NOT NULL DEFAULT '[]',
 "evidence" JSONB, "error" TEXT, "leaseId" TEXT, "leaseUntil" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "finishedAt" TIMESTAMP(3),
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "QualityCheck_executionId_kind_createdAt_idx" ON "QualityCheck"("executionId","kind","createdAt");
CREATE INDEX "QualityCheck_state_createdAt_idx" ON "QualityCheck"("state","createdAt");
CREATE UNIQUE INDEX "QualityCheck_active_execution" ON "QualityCheck"("executionId") WHERE "state" IN ('queued','running');
