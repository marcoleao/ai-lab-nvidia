BEGIN;
CREATE TABLE "StoryExecution" (
 id TEXT PRIMARY KEY,"storyId" TEXT NOT NULL REFERENCES "Item"(id),"repositoryId" TEXT NOT NULL REFERENCES "Repository"(id),"storyVersion" INTEGER NOT NULL,
 state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','waiting_approval','succeeded','failed','cancelled')),
 stage TEXT NOT NULL DEFAULT 'specification' CHECK(stage IN ('specification','gate','context','generation','publishing','completed')),
 snapshot JSONB NOT NULL,specification JSONB,patch JSONB,branch TEXT,"commitSha" TEXT,"mergeRequestUrl" TEXT,error TEXT,
 "actorId" TEXT NOT NULL,"actorName" TEXT NOT NULL,"leaseId" TEXT,"leaseUntil" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "StoryExecution_storyId_createdAt_idx" ON "StoryExecution"("storyId","createdAt");
CREATE INDEX "StoryExecution_state_createdAt_idx" ON "StoryExecution"(state,"createdAt");
CREATE UNIQUE INDEX story_one_active_execution ON "StoryExecution"("storyId") WHERE state IN ('queued','running','waiting_approval');
COMMIT;
