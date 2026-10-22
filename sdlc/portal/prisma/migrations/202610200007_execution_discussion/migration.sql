BEGIN;
ALTER TABLE "StoryExecution" ADD COLUMN "discussionVersion" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "discussionProposal" JSONB, ADD COLUMN "allowDependencies" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StoryExecution" DROP CONSTRAINT "StoryExecution_state_check", DROP CONSTRAINT "StoryExecution_stage_check";
ALTER TABLE "StoryExecution" ADD CHECK(state IN ('queued','running','waiting_approval','waiting_input','succeeded','failed','cancelled')),
 ADD CHECK(stage IN ('specification','gate','context','generation','publishing','completed','discussion'));
DROP INDEX story_one_active_execution;
CREATE UNIQUE INDEX story_one_active_execution ON "StoryExecution"("storyId") WHERE state IN ('queued','running','waiting_approval','waiting_input');
CREATE TABLE "ExecutionMessage" (
 id TEXT PRIMARY KEY,"executionId" TEXT NOT NULL REFERENCES "StoryExecution"(id),sequence INTEGER NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('user','assistant')),content TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'succeeded' CHECK(state IN ('queued','running','succeeded','failed')),
 "actorId" TEXT NOT NULL,"actorName" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("executionId",sequence)
);
COMMIT;
