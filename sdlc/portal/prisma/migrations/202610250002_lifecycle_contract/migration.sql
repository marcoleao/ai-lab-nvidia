-- Broaden constraints without rewriting business rows or historical decisions.
-- Legacy status values remain accepted until explicit, audited normalization.
ALTER TABLE "Item" DROP CONSTRAINT "Item_status_check";
ALTER TABLE "Item" ADD CONSTRAINT "Item_status_check" CHECK (
 (kind='system' AND status IN ('active','inactive')) OR
 (kind='project' AND status IN ('active','inactive','completed','cancelled','awaiting_approval','approved')) OR
 (kind='epic' AND status IN ('active','inactive','completed','cancelled','todo','doing','done','approved')) OR
 (kind='story' AND status IN ('specification','approved','coding','code_review','security_scan','testing','uat','production','completed','cancelled')) OR
 (kind='task' AND status IN ('todo','doing','done','cancelled'))
);
ALTER TABLE "Item" DROP CONSTRAINT "Item_lifecycle_check";
ALTER TABLE "Item" ADD CONSTRAINT "Item_lifecycle_check" CHECK (
 (kind='project' AND "projectLifecycle" IS NOT NULL AND "projectLifecycle" IN ('planned','active','inactive','completed','cancelled')) OR
 (kind<>'project' AND "projectLifecycle" IS NULL)
);
ALTER TABLE "StoryExecution" DROP CONSTRAINT "StoryExecution_state_check";
ALTER TABLE "StoryExecution" ADD CONSTRAINT "StoryExecution_state_check"
 CHECK (state IN ('queued','running','waiting_approval','waiting_input','succeeded','failed','cancelled','paused','cancel_pending'));
DROP INDEX story_one_active_execution;
CREATE UNIQUE INDEX story_one_active_execution ON "StoryExecution"("storyId")
 WHERE state IN ('queued','running','waiting_approval','waiting_input','paused','cancel_pending');
ALTER TABLE "ChatTurn" DROP CONSTRAINT "ChatTurn_status_check";
ALTER TABLE "ChatTurn" ADD CONSTRAINT "ChatTurn_status_check"
 CHECK (status IN ('queued','running','succeeded','failed','cancelled','paused'));
ALTER TABLE "ExecutionMessage" DROP CONSTRAINT "ExecutionMessage_state_check";
ALTER TABLE "ExecutionMessage" ADD CONSTRAINT "ExecutionMessage_state_check"
 CHECK (state IN ('queued','running','succeeded','failed','cancelled','paused'));
ALTER TABLE "QualityCheck" DROP CONSTRAINT "QualityCheck_state_check";
ALTER TABLE "QualityCheck" ADD CONSTRAINT "QualityCheck_state_check"
 CHECK (state IN ('queued','running','passed','blocked','failed','stale','paused','cancelled'));
DROP INDEX "QualityCheck_active_execution";
CREATE UNIQUE INDEX "QualityCheck_active_execution" ON "QualityCheck"("executionId") WHERE state IN ('queued','running','paused');
ALTER TABLE "MergeOperation" DROP CONSTRAINT "MergeOperation_state_check";
ALTER TABLE "MergeOperation" ADD CONSTRAINT "MergeOperation_state_check"
 CHECK (state IN ('tracking','queued','running','blocked','failed','succeeded','paused','cancelled'));
ALTER TABLE "MergeDiscussionTurn" DROP CONSTRAINT "MergeDiscussionTurn_state_check";
ALTER TABLE "MergeDiscussionTurn" ADD CONSTRAINT "MergeDiscussionTurn_state_check"
 CHECK (state IN ('queued','running','succeeded','failed','paused','cancelled'));
