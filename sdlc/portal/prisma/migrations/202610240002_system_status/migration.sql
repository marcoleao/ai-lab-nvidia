-- Extend only the System states; retain every existing status constraint.
-- Both changes form a single atomic ALTER TABLE, preserving existing rows.
ALTER TABLE "Item"
  DROP CONSTRAINT "Item_status_check",
  ADD CONSTRAINT "Item_status_check" CHECK (
    (kind = 'system' AND status IN ('active','inactive')) OR
    (kind = 'project' AND status IN ('awaiting_approval','approved')) OR
    (kind = 'epic' AND status IN ('todo','approved','doing','done')) OR
    (kind = 'story' AND status IN ('specification','approved','coding','code_review','security_scan','testing','uat','production','completed')) OR
    (kind = 'task' AND status IN ('todo','doing','done'))
  );
